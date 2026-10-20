/*
 * The window: the off switch, the village, and the inbox where every result
 * waits for you. The only paths to GitHub and Stripe writes are the buttons
 * in renderInbox(); the agent loop cannot reach them.
 */
import { Agent } from "./agent/loop";
import { World } from "./world";
import { loadState, saveState, getSecret, setSecret, type State, type Item, type SecretName } from "./agent/store";
import { detectEngines } from "./agent/llm";
import { net } from "./agent/net";
import { fileIssue } from "./agent/github";
import { balance, createOffer, keyMode, recentPayments } from "./agent/stripe";
import { checkOffer } from "./agent/guard";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const inTauri = "__TAURI_INTERNALS__" in window;

const state: State = await loadState();
const world = new World($("world") as HTMLCanvasElement);

function setPower(running: boolean, text?: string) {
  const btn = $("power");
  btn.setAttribute("aria-pressed", String(running));
  $("power-label").textContent = running ? "ON" : "OFF";
  if (text) $("status").textContent = text;
  world.setAwake(running);
  if (inTauri) void import("@tauri-apps/api/core").then(({ invoke }) => invoke("tray_state", { running }).catch(() => {}));
}

function log(text: string, tone?: "bad" | "good") {
  state.log.unshift({ at: new Date().toISOString(), text, tone });
  renderLog();
}

const agent = new Agent(state, {
  status: (text, running) => {
    $("status").textContent = text;
    $("power").setAttribute("aria-pressed", String(running));
    $("power-label").textContent = running ? "ON" : "OFF";
  },
  log,
  world: (e) => world.event(e.villager, e.building, e.say),
  changed: () => renderInbox(),
});

$("power").addEventListener("click", async () => {
  if (agent.running) {
    await agent.stop();
    setPower(false);
  } else {
    setPower(true, "Starting…");
    await agent.start();
  }
});

if (inTauri) {
  const { listen } = await import("@tauri-apps/api/event");
  await listen<string>("tray-agent", async (e) => {
    if (e.payload === "stop" && agent.running) {
      await agent.stop("Agent switched off from the tray.");
      setPower(false);
    }
    if (e.payload === "start" && !agent.running) {
      setPower(true, "Starting…");
      await agent.start();
    }
  });
}

/* ── tabs ─────────────────────────────────────────────────────────── */
document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll<HTMLElement>(".tab").forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
    if (b.dataset.tab === "money") void renderMoney();
    if (b.dataset.tab === "settings") void renderSettings();
  }),
);

/* ── inbox ────────────────────────────────────────────────────────── */
function renderInbox() {
  const open = state.inbox.filter((i) => i.status !== "dismissed");
  $("count").textContent = open.filter((i) => i.status === "new").length ? `(${open.filter((i) => i.status === "new").length})` : "";
  if (open.length === 0) {
    $("tab-inbox").innerHTML = `<p class="empty">Nothing yet. Switch the agent on and the villagers will start bringing you work.</p>`;
    return;
  }
  $("tab-inbox").innerHTML = open
    .map((i) => {
      const offer = i.offer
        ? `<div class="offer"><b>Drafted offer</b> (not created): ${esc(i.offer.name)} · $${esc(i.offer.amount_usd)}${i.offer.interval === "one_time" ? " one-time" : ` per ${esc(i.offer.interval)}`}<br>${esc(i.offer.description)}</div>`
        : "";
      const done = i.link ? `<p class="note good">${i.status === "filed" ? "Filed" : "Payment link"}: <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.link)}</a></p>` : "";
      return `<article class="item" data-id="${esc(i.id)}">
        <h3>${esc(i.title)}</h3>
        <div class="meta">${esc(i.villager)} · ${esc(i.kind)} · ${esc(new Date(i.created).toLocaleString())} · <span class="pill">${esc(i.engine)}</span></div>
        <pre>${esc(i.body)}</pre>${offer}${done}
        <div class="row">
          ${i.status === "new" ? `<button class="btn" data-act="file">File on GitHub</button>` : ""}
          ${i.offer && i.status !== "offer-created" ? `<button class="btn" data-act="offer">Create payment link…</button>` : ""}
          <button class="btn ghost" data-act="copy">Copy</button>
          <button class="btn ghost" data-act="dismiss">Dismiss</button>
        </div></article>`;
    })
    .join("");
}

$("tab-inbox").addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
  const card = btn?.closest<HTMLElement>("article[data-id]");
  if (!btn || !card) return;
  const item = state.inbox.find((i) => i.id === card.dataset.id) as Item;
  const act = btn.dataset.act;
  btn.disabled = true;
  try {
    if (act === "dismiss") item.status = "dismissed";
    if (act === "copy") await navigator.clipboard.writeText(`${item.title}\n\n${item.body}`);
    if (act === "file") {
      const token = await getSecret("github_token");
      if (!token) throw new Error("Add a GitHub token in Settings to file issues.");
      item.link = await fileIssue(await net(), token, state.settings.owner, state.settings.repo, item);
      item.status = "filed";
      log(`Filed "${item.title}" on GitHub.`, "good");
    }
    if (act === "offer") {
      // Checked again here, at the moment of creation, not only when drafted.
      const o = checkOffer(item.offer);
      if (!o.ok) throw new Error(`Offer refused: ${o.reason}`);
      const key = await getSecret("stripe_key");
      const mode = keyMode(key);
      if (!key || mode === "invalid") throw new Error("Add a Stripe restricted key in Settings first.");
      const price = `$${o.offer.amount_usd}${o.offer.interval === "one_time" ? " one-time" : ` per ${o.offer.interval}`}`;
      const sure = confirm(`Create this in Stripe (${mode.toUpperCase()} mode)?\n\n${o.offer.name}\n${price}\n\n${o.offer.description}\n\nThis creates a product, a price and a payment link. Nobody is charged until someone pays through the link.`);
      if (!sure) return;
      const made = await createOffer(await net(), key, o.offer);
      item.link = made.url;
      item.status = "offer-created";
      log(`Created a ${mode} payment link for "${o.offer.name}".`, "good");
    }
    await saveState(state);
    renderInbox();
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), "bad");
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    btn.disabled = false;
  }
});

/* ── money ────────────────────────────────────────────────────────── */
async function renderMoney() {
  const el = $("tab-money");
  const key = await getSecret("stripe_key");
  const mode = keyMode(key);
  if (!key || mode === "invalid") {
    el.innerHTML = `<p class="empty">Connect Stripe in Settings with a restricted key to see your balance and payments here.</p>`;
    return;
  }
  el.innerHTML = `<p class="note">Stripe, <b>${mode.toUpperCase()}</b> mode. Read-only here: payment links are created only from an inbox item, after you confirm.</p><p class="note">Loading…</p>`;
  try {
    const f = await net();
    const [bal, pays] = await Promise.all([balance(f, key), recentPayments(f, key)]);
    const money = (a: number, c: string) => `${(a / 100).toLocaleString("en-US", { style: "currency", currency: c.toUpperCase() })}`;
    el.innerHTML = `<p class="note">Stripe, <b>${mode.toUpperCase()}</b> mode.</p>
      <h3>Balance</h3>${bal.map((b) => `<p>${esc(b.kind)}: <b>${esc(money(b.amount, b.currency))}</b></p>`).join("") || "<p>None</p>"}
      <h3>Recent payments</h3>${pays.map((p) => `<p>${esc(new Date(p.created * 1000).toLocaleDateString())} · ${esc(money(p.amount, p.currency))} · ${esc(p.status)}${p.description ? ` · ${esc(p.description)}` : ""}</p>`).join("") || "<p>None yet.</p>"}`;
  } catch (error) {
    el.innerHTML = `<p class="bad">Stripe: ${esc(error instanceof Error ? error.message : String(error))}</p>`;
  }
}

/* ── log ──────────────────────────────────────────────────────────── */
function renderLog() {
  $("tab-log").innerHTML = `<div class="log">${state.log
    .slice(0, 200)
    .map((l) => `<p class="${l.tone ?? ""}"><time>${esc(new Date(l.at).toLocaleTimeString())}</time>${esc(l.text)}</p>`)
    .join("") || '<p class="empty">Nothing logged yet.</p>'}</div>`;
}

/* ── settings ─────────────────────────────────────────────────────── */
/** The free AI keys, in the order the village uses them. */
const AI_KEYS: Array<{ id: "gemini" | "groq" | "openrouter"; secret: SecretName; name: string; how: string }> = [
  { id: "gemini", secret: "gemini_key", name: "Google Gemini key (free, recommended)", how: "aistudio.google.com/apikey › Create API key. Free, no card. The smartest free option." },
  { id: "groq", secret: "groq_key", name: "Groq key (free)", how: "console.groq.com/keys › Create API Key. Free, no card. Very fast." },
  { id: "openrouter", secret: "openrouter_key", name: "OpenRouter key (free models)", how: "openrouter.ai/settings/keys › Create key. Uses only its free models (about 50 a day)." },
];

async function renderSettings() {
  const s = state.settings;
  const has = async (n: SecretName) => ((await getSecret(n)) ? "saved in your keychain" : "not set");
  const aiRows = (
    await Promise.all(
      AI_KEYS.map(
        async (k) => `
      <label for="s-${k.id}">${esc(k.name)} <span class="note">(${await has(k.secret)})</span></label>
      <div class="row"><input id="s-${k.id}" type="password" autocomplete="off" placeholder="Paste to replace; leave empty to keep" style="flex:3">
        <input id="s-${k.id}-model" value="${esc(s.pinned[k.id] ?? "")}" placeholder="model: auto" style="flex:1"></div>
      <p class="note">${esc(k.how)}</p>`,
      ),
    )
  ).join("");
  $("tab-settings").innerHTML = `
    <form id="settings-form">
      <h3 style="margin:4px 0">Free AI</h3>
      <p class="note">Add at least one. The village uses them in this order and moves to the next when one reaches its free daily limit. Each picks its provider's best free model by itself unless you name one.</p>
      ${aiRows}
      <h3 style="margin:18px 0 4px">GitHub and Stripe</h3>
      <label for="s-gh">GitHub token <span class="note">(${await has("github_token")})</span></label>
      <input id="s-gh" type="password" autocomplete="off" placeholder="Paste to replace; leave empty to keep">
      <p class="note">A fine-grained token for ${esc(s.owner)}/${esc(s.repo)} with Issues: read and write, and Models: read. Used to read the repo, file issues you approve, and as one more free AI (GitHub Models).</p>
      <label for="s-stripe">Stripe restricted key <span class="note">(${await has("stripe_key")})</span></label>
      <input id="s-stripe" type="password" autocomplete="off" placeholder="rk_test_… or rk_live_…">
      <p class="note">Create it in Stripe › Developers › API keys › Restricted key, with Write on Products, Prices and Payment Links, and Read on Balance and Payment Intents. Nothing else. Start with a test key.</p>
      <h3 style="margin:18px 0 4px">Village</h3>
      <label for="s-owner">Repository</label>
      <div class="row"><input id="s-owner" value="${esc(s.owner)}" style="flex:1"><input id="s-repo" value="${esc(s.repo)}" style="flex:1"></div>
      <label for="s-interval">Minutes between jobs, and GitHub Models calls per day</label>
      <div class="row"><input id="s-interval" type="number" min="5" max="1440" value="${s.intervalMin}" style="flex:1"><input id="s-cap" type="number" min="0" max="150" value="${s.githubDailyCap}" style="flex:1"></div>
      <details style="margin-top:12px"><summary class="note">Optional: Ollama on this computer (used last, only if running)</summary>
        <div class="row" style="margin-top:6px"><input id="s-ollama" value="${esc(s.ollamaUrl)}" style="flex:2"><input id="s-ollama-model" value="${esc(s.pinned.ollama ?? "")}" placeholder="model: auto" style="flex:1"></div>
      </details>
      <div class="row" style="margin-top:14px"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="s-test">Check engines</button></div>
      <p class="note" id="s-msg"></p>
    </form>`;
  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id: string) => ($(id) as HTMLInputElement).value.trim();
    const pinned: State["settings"]["pinned"] = {};
    for (const k of AI_KEYS) if (v(`s-${k.id}-model`)) pinned[k.id] = v(`s-${k.id}-model`);
    if (v("s-ollama-model")) pinned.ollama = v("s-ollama-model");
    Object.assign(state.settings, {
      owner: v("s-owner") || s.owner,
      repo: v("s-repo") || s.repo,
      ollamaUrl: v("s-ollama") || s.ollamaUrl,
      pinned,
      intervalMin: Math.min(1440, Math.max(5, Number(v("s-interval")) || 30)),
      githubDailyCap: Math.min(150, Math.max(0, Number(v("s-cap")) || 0)),
    });
    try {
      for (const k of AI_KEYS) if (v(`s-${k.id}`)) await setSecret(k.secret, v(`s-${k.id}`));
      if (v("s-gh")) await setSecret("github_token", v("s-gh"));
      if (v("s-stripe")) {
        if (keyMode(v("s-stripe")) === "invalid") throw new Error("That is not a Stripe secret or restricted key (rk_… or sk_…).");
        await setSecret("stripe_key", v("s-stripe"));
      }
      await saveState(state);
      $("s-msg").textContent = "Saved.";
      void renderSettings();
      void showEngine();
    } catch (error) {
      $("s-msg").textContent = error instanceof Error ? error.message : String(error);
    }
  });
  $("s-test").addEventListener("click", () => void showEngine(true));
}

async function showEngine(verbose = false) {
  const keys = {
    github_token: await getSecret("github_token"),
    gemini_key: await getSecret("gemini_key"),
    groq_key: await getSecret("groq_key"),
    openrouter_key: await getSecret("openrouter_key"),
  };
  const engines = await detectEngines(await net(), state.settings, keys);
  const text = engines.length
    ? `AI: ${engines.map((e) => e.label).join(", then ")}`
    : "AI: none yet. Add a free Gemini or Groq key in Settings.";
  $("engine").textContent = text;
  if (verbose) alert(text);
}

renderInbox();
renderLog();
void showEngine();
// The village remembers being on: if you left it working, it carries on.
if (state.running) {
  state.running = false;
  setPower(true, "Resuming…");
  await agent.start();
}
