/*
 * The agent loop. While it is on: every few minutes one villager takes the
 * next job, reads what it needs with read-only tools, drafts an answer, has
 * it criticised, and puts it through the guard. What passes lands in your
 * inbox. Nothing else happens until you press a button.
 *
 * This file deliberately imports nothing that writes to GitHub or Stripe
 * (see tests/structure.test.ts). Stop aborts the request in flight.
 */
import { check, extractJson, type Proposal } from "./guard";
import { chat, detectEngines, QuotaError, type Engine, type Message } from "./llm";
import { JOBS, nextJob, type Job } from "./jobs";
import { CONSTITUTION, ANSWER_FORMAT } from "./constitution";
import { runTool, TOOL_HELP } from "./tools";
import { net } from "./net";
import { getSecret, saveState, today, type Item, type State } from "./store";

export type WorldEvent = { villager: string; building: string; say: string };

export type Hooks = {
  status: (text: string, running: boolean) => void;
  log: (text: string, tone?: "bad" | "good") => void;
  world: (e: WorldEvent) => void;
  changed: () => void;
};

const MAX_TOOL_STEPS = 4;

export class Agent {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private busy = false;

  constructor(private state: State, private hooks: Hooks) {}

  get running(): boolean {
    return this.state.running;
  }

  async start(): Promise<void> {
    if (this.state.running) return;
    this.state.running = true;
    await saveState(this.state);
    this.hooks.status("Starting…", true);
    this.hooks.log("Agent switched on.", "good");
    void this.cycle();
  }

  /** The off switch. Stops at once: the request in flight is aborted and nothing more is scheduled. */
  async stop(why = "Agent switched off."): Promise<void> {
    this.state.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    await saveState(this.state);
    this.hooks.status("Off. The village is asleep.", false);
    this.hooks.log(why);
    for (const job of JOBS) this.hooks.world({ villager: job.villager, building: "home", say: "Zzz" });
  }

  private schedule(minutes: number) {
    if (!this.state.running) return;
    this.timer = setTimeout(() => void this.cycle(), minutes * 60_000);
    this.hooks.status(`Resting. Next job in ${minutes} min.`, true);
  }

  private countCall(engine: Engine) {
    if (engine.kind !== "github") return;
    if (this.state.githubCalls.day !== today()) this.state.githubCalls = { day: today(), count: 0 };
    this.state.githubCalls.count += 1;
  }

  private underCap(engine: Engine): boolean {
    if (engine.kind !== "github") return true;
    const used = this.state.githubCalls.day === today() ? this.state.githubCalls.count : 0;
    return used < this.state.settings.githubDailyCap;
  }

  async cycle(): Promise<void> {
    if (!this.state.running || this.busy) return;
    this.busy = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const s = this.state.settings;
    try {
      const f = await net();
      const githubToken = await getSecret("github_token");
      const engines = (await detectEngines(f, s, githubToken)).filter((e) => this.underCap(e));
      if (engines.length === 0) {
        this.hooks.log("No free engine is available: start Ollama, or add a GitHub token in Settings (or today's free quota is used).", "bad");
        this.schedule(Math.max(10, s.intervalMin));
        return;
      }
      const { job, index } = nextJob(this.state.jobIndex);
      this.state.jobIndex = index;
      const item = await this.work(job, engines, { f, githubToken, signal });
      if (item) {
        this.state.inbox.unshift(item);
        this.hooks.log(`${job.villager} put "${item.title}" in your inbox.`, "good");
        this.hooks.world({ villager: job.villager, building: "inbox", say: "Done! Check your inbox" });
      }
      await saveState(this.state);
      this.hooks.changed();
      this.schedule(s.intervalMin);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof QuotaError) this.hooks.log(error.message, "bad");
      else this.hooks.log(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`, "bad");
      this.schedule(Math.max(10, s.intervalMin));
    } finally {
      this.busy = false;
    }
  }

  private async ask(engines: Engine[], messages: Message[], ctx: { f: Awaited<ReturnType<typeof net>>; githubToken: string | null; signal: AbortSignal }): Promise<{ text: string; engine: Engine }> {
    let lastError: unknown = null;
    for (const engine of engines) {
      if (!this.underCap(engine)) continue;
      try {
        this.countCall(engine);
        const text = await chat(ctx.f, engine, messages, { ollamaUrl: this.state.settings.ollamaUrl, githubToken: ctx.githubToken, signal: ctx.signal });
        return { text, engine };
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Error("no engine answered");
  }

  private async work(job: Job, engines: Engine[], ctx: { f: Awaited<ReturnType<typeof net>>; githubToken: string | null; signal: AbortSignal }): Promise<Item | null> {
    const s = this.state.settings;
    const toolCtx = { f: ctx.f, owner: s.owner, repo: s.repo, token: ctx.githubToken, signal: ctx.signal };
    const say = (building: string, text: string) => this.hooks.world({ villager: job.villager, building, say: text });
    this.hooks.status(`${job.villager} is working on: ${job.id}`, true);

    // A first look, chosen for the job, so a small model starts from real material.
    const looked: string[] = [];
    for (const t of job.firstLook) {
      say("library", `Reading ${t.tool.replace("_", " ")}…`);
      looked.push(`[${t.tool} ${JSON.stringify(t.args)}]\n${await runTool(toolCtx, t.tool, t.args)}`);
    }
    const known = this.state.inbox.filter((i) => i.status !== "dismissed").slice(0, 25).map((i) => `- ${i.title}`).join("\n") || "- (none yet)";

    const messages: Message[] = [
      { role: "system", content: `${CONSTITUTION}\n\n${TOOL_HELP}\n\n${ANSWER_FORMAT}` },
      { role: "user", content: `Your job: ${job.goal}\n\nIdeas the village already has (do not repeat them):\n${known}\n\nWhat you have read so far:\n${looked.join("\n\n")}` },
    ];

    say(job.building, "Thinking…");
    let answer: Proposal | null = null;
    let engineUsed = engines[0];
    for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
      if (step === MAX_TOOL_STEPS) messages.push({ role: "user", content: "No more tools. Give your final answer now." });
      const { text, engine } = await this.ask(engines, messages, ctx);
      engineUsed = engine;
      const parsed = extractJson(text) as (Proposal & { tool?: string; args?: Record<string, unknown> }) | null;
      if (parsed?.tool && step < MAX_TOOL_STEPS) {
        say("library", `Reading ${String(parsed.tool).replace("_", " ")}…`);
        const result = await runTool(toolCtx, String(parsed.tool), parsed.args ?? {});
        messages.push({ role: "assistant", content: text }, { role: "user", content: `Result of ${parsed.tool}:\n${result}` });
        continue;
      }
      answer = parsed;
      break;
    }
    if (!answer || answer.action !== "propose") {
      this.hooks.log(`${job.villager} found nothing worth doing (${answer?.reason ?? "no answer"}).`);
      say("home", "Nothing worth doing");
      return null;
    }

    // A second look by the critic, who may improve the draft or throw it away.
    say("tower", "Checking my work…");
    const critique = await this.ask(engines, [
      { role: "system", content: `${CONSTITUTION}\n\n${ANSWER_FORMAT}` },
      { role: "user", content: `You are the critic. Here is a draft for this job: ${job.goal}\n\nDraft:\n${JSON.stringify(answer)}\n\nCheck it against the rules and the job. Is every fact grounded in what was read? Is it specific and useful? Return the improved final answer as {"action":"propose",...}, or {"action":"noop","reason":"..."} if it is weak, vague or breaks a rule.` },
    ], ctx);
    const final = (extractJson(critique.text) as Proposal | null) ?? answer;

    const verdict = check(final, this.state.inbox.filter((i) => i.status !== "dismissed").map((i) => i.title));
    if (!verdict.ok) {
      this.hooks.log(`The guard refused ${job.villager}'s draft: ${verdict.reason}.`, "bad");
      say("home", "Refused by the guard");
      return null;
    }
    if ("noop" in verdict) {
      this.hooks.log(`The critic set aside ${job.villager}'s draft: ${verdict.reason}`);
      say("home", "Set aside");
      return null;
    }
    return {
      id: crypto.randomUUID(),
      kind: job.id,
      villager: job.villager,
      title: verdict.title,
      body: verdict.body,
      offer: job.id === "revenue" ? verdict.offer : null,
      status: "new",
      created: new Date().toISOString(),
      engine: engineUsed.label,
    };
  }
}
