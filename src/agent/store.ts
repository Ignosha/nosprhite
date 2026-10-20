/*
 * Everything the village remembers, on this computer only. Settings, the
 * inbox and the log go in a JSON file through Tauri's store plugin. Keys
 * (GitHub token, Stripe key) never do: they go in the operating system's
 * keychain through the Rust side, and are read only when needed.
 */
import type { Kind, Offer } from "./guard";
import type { ProviderId } from "./llm";

export type Settings = {
  owner: string;
  repo: string;
  ollamaUrl: string;
  /** A model to use instead of the one picked automatically, per provider. */
  pinned: Partial<Record<ProviderId, string>>;
  githubModel: string;
  intervalMin: number;
  githubDailyCap: number;
  /** Added under every outreach email. Include a postal address: US law (CAN-SPAM) requires one. */
  signature: string;
};

export type Item = {
  id: string;
  kind: Kind;
  villager: string;
  title: string;
  body: string;
  offer: Offer | null;
  /** The full text of a digital product, when the offer sells one. */
  product?: string | null;
  /** For outreach: who it goes to (looked up from the verified list, never written by the model). */
  mail?: { to: string; institution: string; subject: string } | null;
  status: "new" | "filed" | "offer-created" | "opened-in-mail" | "dismissed";
  created: string;
  engine: string;
  link?: string;
};

export type LogLine = { at: string; text: string; tone?: "bad" | "good" };

export type State = {
  settings: Settings;
  running: boolean;
  jobIndex: number;
  /** Calls made today, per provider, to stay inside each free limit. */
  calls: Partial<Record<ProviderId, { day: string; count: number }>>;
  inbox: Item[];
  log: LogLine[];
};

export const DEFAULTS: State = {
  settings: {
    owner: "Ignosha",
    repo: "noshashi",
    ollamaUrl: "http://localhost:11434",
    pinned: {},
    githubModel: "openai/gpt-4.1-mini",
    intervalMin: 30,
    githubDailyCap: 40,
    signature: "Joshua Edmond\nFounder, NOSHASHI · https://www.noshashi.app\n[your postal address]\nNot relevant? Reply \"stop\" and you won't hear from us again.",
  },
  running: false,
  jobIndex: -1,
  calls: {},
  inbox: [],
  log: [],
};

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function loadState(): Promise<State> {
  let saved: Partial<State> | null = null;
  try {
    if (inTauri()) {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("village.json", { autoSave: false, defaults: {} });
      saved = ((await store.get("state")) as Partial<State> | undefined) ?? null;
    } else {
      saved = JSON.parse(localStorage.getItem("nosprhite-village") ?? "null");
    }
  } catch {
    saved = null;
  }
  return { ...DEFAULTS, ...saved, settings: { ...DEFAULTS.settings, ...(saved?.settings ?? {}) } };
}

export async function saveState(state: State): Promise<void> {
  const trimmed: State = { ...state, inbox: state.inbox.slice(0, 300), log: state.log.slice(0, 400) };
  try {
    if (inTauri()) {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("village.json", { autoSave: false, defaults: {} });
      await store.set("state", trimmed);
      await store.save();
    } else {
      localStorage.setItem("nosprhite-village", JSON.stringify(trimmed));
    }
  } catch {
    /* A failed save loses the latest change, never the app. */
  }
}

export type SecretName = "github_token" | "stripe_key" | "gemini_key" | "groq_key" | "openrouter_key" | "mistral_key";

export async function getSecret(name: SecretName): Promise<string | null> {
  if (!inTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke<string | null>("secret_get", { name })) ?? null;
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  if (value.trim()) await invoke("secret_set", { name, value });
  else await invoke("secret_delete", { name });
}

export const today = () => new Date().toISOString().slice(0, 10);
