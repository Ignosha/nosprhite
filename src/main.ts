/*
 * The window: the off switch, the village, and the inbox where every result
 * waits for you. The only paths to GitHub, Gist and Stripe writes, and to
 * opening an email in your mail app, are the buttons in renderInbox(); the
 * agent loop cannot reach them.
 */
import { Agent } from "./agent/loop";
import { World } from "./world";
import { loadState, saveState, getSecret, setSecret, type State, type Item, type SecretName } from "./agent/store";
import { detectEngines } from "./agent/llm";
import { net } from "./agent/net";
import { fileIssue } from "./agent/github";
import { balance, createOffer, keyMode, recentPayments } from "./agent/stripe";
import { checkOffer } from "./agent/guard";
import { publishGist } from "./agent/publish";
import { mailto } from "./agent/outreach";

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
/** Links open in your browser (or mail app), never inside the village window. */
async function openExternal(url: string) {
  if (inTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank", "noopener");
}

document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='http']");
  if (!a) return;
  e.preventDefault();
  void openExternal(a.href);
});

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

function renderInbox() {
  const open = state.inbox.filter((i) => i.status !== "dismissed");
  const fresh = open.filter((i) => i.status === "new").length;
  $("count").textContent = fresh ? `(${fresh})` : "";
  if (open.length === 0) {
    $("tab-inbox").innerHTML = `<p class="empty">Nothing yet. Switch the agent on and the villagers will start bringing you work.</p>`;
    return;
  }
  $("tab-inbox").innerHTML = open
    .map((i) => {
      const offer = i.offer
        ? `<div class="offer"><b>Drafted offer</b> (not created yet): ${esc(i.offer.name)} · $${esc(i.offer.amount_usd)}${i.offer.interval === "one_time" ? " one-time" : ` per ${esc(i.offer.interval)}`} · ${i.offer.delivery === "digital" ? "digital: buyers get it automatically" : "service: you deliver it"}<br>${esc(i.offer.description)}</div>`
        : "";
      const product = i.product ? `<details class="offer"><summary>Read the product (${words(i.product)} words)</summary><pre>${esc(i.product)}</pre></details>` : "";
      const mail = i.mail ? `<div class="offer"><b>To:</b> ${esc(i.mail.institution)} &lt;${esc(i.mail.to)}&gt;<br><b>Subject:</b> ${esc(i.mail.subject)}<br><span class="note">From NOSHASHI's verified outreach list. Your signature is added when it opens.</span></div>` : "";
      const done = i.link
        ? `<p class="note good">${i.status === "filed" ? "Filed" : i.status === "opened-in-mail" ? "Opened in Mail" : "Payment link"}: <a href="${esc(i.link)}">${esc(i.link)}</a></p>`
        : i.status === "opened-in-mail"
          ? `<p class="note good">Opened in your mail app. Once you send it, tell Claude so the outreach list is updated.</p>`
          : "";
      const digital = i.offer?.delivery === "digital" && i.product;
      return `<article class="item" data-id="${esc(i.id)}">
        <h3>${esc(i.title)}</h3>
        <div class="meta">${esc(i.villager)} · ${esc(i.kind)} · ${esc(new Date(i.created).toLocaleString())} · <span class="pill">${esc(i.engine)}</span></div>
        ${mail}<pre>${esc(i.body)}</pre>${offer}${product}${done}
        <div class="row">
          ${i.mail && i.status === "new" ? `<button class="btn" data-act="mail">Open in Mail…</button>` : ""}
          ${!i.mail && i.status === "new" ? `<button class="btn${i.offer ? " ghost" : ""}" data-act="file">File on GitHub</button>` : ""}
          ${digital && i.status !== "offer-created" ? `<button class="btn" data-act="sell">Publish &amp; sell…</button>` : ""}
          ${i.offer && !digital && i.status !== "offer-created" ? `<button class="btn" data-act="offer">Create payment link…</button>` : ""}
          <button class="btn ghost" data-act="copy">Copy</button>
          <button class="btn ghost" data-act="dismiss">Dismiss</button>
        </div></article>`;
    })
    .join("");
}

/** A Stripe key, checked, and a clear sentence about what is about to be created. */
async function stripeReady(): Promise<{ key: string; mode: string }> {
  const key = await getSecret("stripe_key");
  const mode = keyMode(key);
  if (!key || mode === "invalid") throw new Error("Add a Stripe restricted key in Settings first.");
  return { key, mode };
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
    if (act === "copy") await navigator.clipboard.writeText(`${item.title}\n\n${item.body}${item.product ? `\n\n${item.product}` : ""}`);
    if (act === "file") {
      const token = await getSecret("github_token");
      if (!token) throw new Error("Add a GitHub token in Settings to file issues.");
      item.link = await fileIssue(await net(), token, state.settings.owner, state.settings.repo, item);
      item.status = "filed";
      log(`Filed "${item.title}" on GitHub.`, "good");
    }
    if (act === "mail" && item.mail) {
      const sig = state.settings.signature.trim();
      if (/\[your postal address\]/.test(sig)) throw new Error("Add your postal address to the email signature in Settings first. US law (CAN-SPAM) requires one in every sales email.");
      await openExternal(mailto(item.mail.to, item.mail.subject, `${item.body}\n\n${sig}`));
      item.status = "opened-in-mail";
      log(`Opened the email to ${item.mail.institution} in your mail app. Nothing is sent until you press Send there.`, "good");
    }
    if (act === "offer") {
      // Checked again here, at the moment of creation, not only when drafted.
      const o = checkOffer(item.offer);
      if (!o.ok) throw new Error(`Offer refused: ${o.reason}`);
      const { key, mode } = await stripeReady();
      const price = `$${o.offer.amount_usd}${o.offer.interval === "one_time" ? " one-time" : ` per ${o.offer.interval}`}`;
      const sure = confirm(`Create this in Stripe (${mode.toUpperCase()} mode)?\n\n${o.offer.name}\n${price}\n\n${o.offer.description}\n\nThis is a service: you deliver it after someone pays. This creates a product, a price and a payment link. Nobody is charged until someone pays through the link.`);
      if (!sure) return;
      const made = await createOffer(await net(), key, o.offer);
      item.link = made.url;
      item.status = "offer-created";
      log(`Created a ${mode} payment link for "${o.offer.name}".`, "good");
    }
    if (act === "sell") {
      const o = checkOffer(item.offer);
      if (!o.ok || !item.product) throw new Error(`Offer refused: ${o.ok ? "no product" : o.reason}`);
      const { key, mode } = await stripeReady();
      const token = await getSecret("github_token");
      if (!token) throw new Error("Add a GitHub token (with Gists: Read and write) in Settings to publish products.");
      const sure = confirm(`Publish and sell this (${mode.toUpperCase()} mode)?\n\n${o.offer.name} · $${o.offer.amount_usd} one-time\n\n1. The product (${words(item.product)} words) goes in a secret Gist on your GitHub: unlisted, readable by anyone with the link.\n2. Stripe gets a product, a price and a payment link.\n3. After paying, buyers see the Gist link on Stripe's thank-you page, automatically.\n\nRead the product first: you are the seller.`);
      if (!sure) return;
      const f = await net();
      const gist = await publishGist(f, token, o.offer.name, item.product);
      const made = await createOffer(f, key, o.offer, `Thank you for buying ${o.offer.name}! Your copy is here: ${gist}`);
      item.link = made.url;
      item.status = "offer-created";
      log(`Published "${o.offer.name}" and created a ${mode} payment link. Share the link to sell it.`, "good");
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
const AI_KEYS: Array<{ id: "groq" | "mistral" | "openrouter" | "gemini"; secret: SecretName; name: string; how: string }> = [
  { id: "groq", secret: "groq_key", name: "Groq key (free, recommended)", how: "console.groq.com/keys › Create API Key. Free, no card, available in most regions. Runs OpenAI's open gpt-oss-120b." },
  { id: "mistral", secret: "mistral_key", name: "Mistral key (free)", how: "console.mistral.ai/api-keys › choose the free plan › Create new key. Free, no card. Free-mode requests may be used to train Mistral's models." },
  { id: "openrouter", secret: "openrouter_key", name: "OpenRouter key (free models)", how: "openrouter.ai/settings/keys › Create key. Uses only its free models (about 50 a day)." },
  { id: "gemini", secret: "gemini_key", name: "Google Gemini key (optional)", how: "aistudio.google.com/apikey › Create API key. Not available in every region or to every account; skip it if it does not work for you." },
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
      <p class="note">Add at least one; Groq is the easiest. Your GitHub token below also counts as a free AI. The village uses them in this order and moves to the next when one reaches its free daily limit. Each picks its provider's best free model by itself unless you name one.</p>
      ${aiRows}
      <h3 style="margin:18px 0 4px">GitHub and Stripe</h3>
      <label for="s-gh">GitHub token <span class="note">(${await has("github_token")})</span></label>
      <input id="s-gh" type="password" autocomplete="off" placeholder="Paste to replace; leave empty to keep">
      <p class="note">A fine-grained token for ${esc(s.owner)}/${esc(s.repo)} with Contents: read and Issues: read and write, plus the account permissions Models: read and Gists: read and write. Used to read the repo, file issues you approve, publish products you sell, and as one more free AI (GitHub Models).</p>
      <label for="s-stripe">Stripe restricted key <span class="note">(${await has("stripe_key")})</span></label>
      <input id="s-stripe" type="password" autocomplete="off" placeholder="rk_test_… or rk_live_…">
      <p class="note">Create it in Stripe › Developers › API keys › Restricted key, with Write on Products, Prices and Payment Links, and Read on Balance and Payment Intents. Nothing else. Start with a test key.</p>
      <label for="s-sig">Email signature (added under every outreach email)</label>
      <textarea id="s-sig" rows="4" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--rule);background:var(--bg);color:var(--ink);font:13px inherit">${esc(s.signature)}</textarea>
      <p class="note">Include your real name and a postal address. US law (CAN-SPAM) requires one in sales email, and the unsubscribe line keeps you on the right side of UK and EU rules.</p>
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
      signature: ($("s-sig") as unknown as HTMLTextAreaElement).value.trim() || s.signature,
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
    mistral_key: await getSecret("mistral_key"),
  };
  const engines = await detectEngines(await net(), state.settings, keys);
  const text = engines.length
    ? `AI: ${engines.map((e) => e.label).join(", then ")}`
    : "AI: none yet. Add a free Groq key (or your GitHub token) in Settings.";
  $("engine").textContent = text;
  if (verbose) alert(text);
}

/* ── updates ──────────────────────────────────────────────────────── */
/*
 * Nosprhite updates itself from its GitHub releases. Every update is signed,
 * and the app refuses one that is not signed with the project's key.
 */
async function checkForUpdate() {
  if (!inTauri) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return;
    const bar = $("update");
    bar.hidden = false;
    bar.innerHTML = `Nosprhite ${esc(update.version)} is ready. <button class="btn" id="update-go" type="button">Install and restart</button>`;
    $("update-go").addEventListener("click", async () => {
      bar.textContent = "Downloading the update…";
      if (agent.running) await agent.stop("Paused for an update.");
      await update.downloadAndInstall();
      state.running = false;
      await saveState(state);
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    });
  } catch (error) {
    log(`Could not check for updates: ${error instanceof Error ? error.message : String(error)}`);
  }
}
void checkForUpdate();
setInterval(() => void checkForUpdate(), 6 * 3600_000);

renderInbox();
renderLog();
void showEngine();
// The village remembers being on: if you left it working, it carries on.
if (state.running) {
  state.running = false;
  setPower(true, "Resuming…");
  await agent.start();
}
