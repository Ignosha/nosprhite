/*
 * Everything the village remembers, on this computer only. Settings, the
 * inbox and the log go in a JSON file through Tauri's store plugin. Keys
 * (GitHub token, Stripe key) never do: they go in the operating system's
 * keychain through the Rust side, and are read only when needed.
 */
import type { Kind, Offer } from "./guard";

export type Settings = {
  owner: string;
  repo: string;
  ollamaUrl: string;
  ollamaModel: string;
  githubModel: string;
  intervalMin: number;
  githubDailyCap: number;
};

export type Item = {
  id: string;
  kind: Kind;
  villager: string;
  title: string;
  body: string;
  offer: Offer | null;
  status: "new" | "filed" | "offer-created" | "dismissed";
  created: string;
  engine: string;
  link?: string;
};

export type LogLine = { at: string; text: string; tone?: "bad" | "good" };

export type State = {
  settings: Settings;
  running: boolean;
  jobIndex: number;
  githubCalls: { day: string; count: number };
  inbox: Item[];
  log: LogLine[];
};

export const DEFAULTS: State = {
  settings: {
    owner: "Ignosha",
    repo: "noshashi",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "",
    githubModel: "openai/gpt-4.1-mini",
    intervalMin: 30,
    githubDailyCap: 40,
  },
  running: false,
  jobIndex: -1,
  githubCalls: { day: "", count: 0 },
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

export type SecretName = "github_token" | "stripe_key";

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
