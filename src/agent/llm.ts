/*
 * The free engines, best first. All of them speak the same OpenAI-style chat
 * API, so one client serves every provider; each needs only its own free key.
 *
 * - Groq, free tier: very fast, with OpenAI's open gpt-oss-120b. Available in
 *   most regions with no card, so it is first.
 * - Mistral, free mode: Mistral's own models; requests may be used for training.
 * - GitHub Models, free tier with your GitHub token: no new account needed.
 * - OpenRouter, free models: about 50 requests a day; a backup.
 * - Google Gemini, free tier: capable, but not offered in every region or to
 *   every account, so it is optional.
 * - Ollama on this computer: optional, used last if it happens to be running.
 *
 * Model names change, so the app asks each provider which models it has and
 * picks the best free one itself; you can pin one in Settings instead.
 * None of these is Claude. They are good at one focused task with the
 * material in front of them, which is how the village uses them.
 */
import type { Fetch } from "./net";
import type { SecretName } from "./store";

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type ProviderId = "groq" | "mistral" | "github" | "openrouter" | "gemini" | "ollama";

export type Provider = {
  id: ProviderId;
  label: string;
  base: string;
  key: SecretName | null;
  /** Calls per day the village allows itself, kept under the free limit. */
  dailyCap: number;
  /** Where to get a free key. */
  signup: string;
};

export const PROVIDERS: Provider[] = [
  { id: "groq", label: "Groq (free)", base: "https://api.groq.com/openai/v1", key: "groq_key", dailyCap: 800, signup: "https://console.groq.com/keys" },
  { id: "mistral", label: "Mistral (free)", base: "https://api.mistral.ai/v1", key: "mistral_key", dailyCap: 500, signup: "https://console.mistral.ai/api-keys" },
  { id: "github", label: "GitHub Models (free)", base: "https://models.github.ai/inference", key: "github_token", dailyCap: 40, signup: "https://github.com/settings/personal-access-tokens/new" },
  { id: "openrouter", label: "OpenRouter free models", base: "https://openrouter.ai/api/v1", key: "openrouter_key", dailyCap: 45, signup: "https://openrouter.ai/settings/keys" },
  { id: "gemini", label: "Google Gemini (free)", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: "gemini_key", dailyCap: 1000, signup: "https://aistudio.google.com/apikey" },
  { id: "ollama", label: "Ollama on this computer", base: "http://localhost:11434/v1", key: null, dailyCap: 100000, signup: "https://ollama.com" },
];

export type Engine = { provider: Provider; model: string; label: string; key: string | null; base: string };

export class QuotaError extends Error {}

const version = (id: string) => {
  const m = id.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
};

/** The best free model a provider lists. Pure, so it can be tested. */
export function pickModel(provider: ProviderId, listed: string[]): string | null {
  const ids = listed.map((id) => id.replace(/^models\//, ""));
  const first = (patterns: RegExp[], pool: string[]) => {
    for (const p of patterns) {
      const hit = pool.filter((id) => p.test(id)).sort((a, b) => version(b) - version(a))[0];
      if (hit) return hit;
    }
    return null;
  };
  switch (provider) {
    case "gemini": {
      const text = ids.filter((id) => /^gemini-/.test(id) && !/(image|tts|audio|live|embed|vision|thinking-exp|preview-\d{2}-\d{2}.*image)/.test(id));
      return first([/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash(?!-lite)/, /flash-lite/, /pro/], text) ?? text[0] ?? null;
    }
    case "groq": {
      const text = ids.filter((id) => !/(whisper|guard|tts|distil|playai|prompt-guard|orpheus)/i.test(id));
      return first([/gpt-oss-120b/, /(70b|72b|120b|235b|405b)/i, /qwen/i, /llama/i], text) ?? text[0] ?? null;
    }
    case "mistral": {
      const text = ids.filter((id) => !/(embed|ocr|moderation|voxtral|pixtral|saba)/i.test(id));
      return first([/^mistral-large-latest$/, /^mistral-medium-latest$/, /^magistral-medium-latest$/, /mistral-large/, /mistral-medium/, /mistral-small-latest/], text) ?? text[0] ?? null;
    }
    case "openrouter": {
      const free = ids.filter((id) => id.endsWith(":free"));
      return first([/deepseek.*(r1|v3|chat)/i, /gpt-oss-120b/i, /qwen.*(235b|72b|coder)/i, /llama.*(70b|405b)/i, /gemma.*27b/i], free) ?? free[0] ?? null;
    }
    case "ollama": {
      return first([/qwen.*14b/i, /llama3\.1:8b/i, /qwen/i], ids) ?? ids[0] ?? null;
    }
    default:
      return ids[0] ?? null;
  }
}

/** Remembered for a few hours, so the village does not ask every cycle. */
const picked = new Map<ProviderId, { model: string; at: number }>();

export async function detectEngines(
  f: Fetch,
  cfg: { githubModel: string; pinned: Partial<Record<ProviderId, string>>; ollamaUrl: string },
  keys: Partial<Record<SecretName, string | null>>,
): Promise<Engine[]> {
  const engines: Engine[] = [];
  for (const p of PROVIDERS) {
    const key = p.key ? keys[p.key] ?? null : null;
    if (p.key && !key) continue;
    const base = p.id === "ollama" ? `${cfg.ollamaUrl.replace(/\/$/, "")}/v1` : p.base;
    let model = cfg.pinned[p.id] || (p.id === "github" ? cfg.githubModel : "");
    if (!model) {
      const cached = picked.get(p.id);
      if (cached && Date.now() - cached.at < 6 * 3600_000) model = cached.model;
      else {
        try {
          const r = await f(`${base}/models`, { method: "GET", headers: key ? { Authorization: `Bearer ${key}` } : {} });
          if (!r.ok) continue;
          const body = (await r.json()) as { data?: Array<{ id: string }>; models?: Array<{ name: string }> };
          const ids = body.data?.map((m) => m.id) ?? body.models?.map((m) => m.name) ?? [];
          const best = pickModel(p.id, ids);
          if (!best) continue;
          model = best;
          picked.set(p.id, { model, at: Date.now() });
        } catch {
          continue; // Not reachable now (Ollama not running, offline): try the next provider.
        }
      }
    }
    engines.push({ provider: p, model, key, base, label: `${model} · ${p.label}` });
  }
  return engines;
}

export async function chat(f: Fetch, engine: Engine, messages: Message[], signal?: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (engine.key) headers.Authorization = `Bearer ${engine.key}`;
  if (engine.provider.id === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/Ignosha/nosprhite";
    headers["X-Title"] = "Nosprhite";
  }
  const r = await f(`${engine.base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: engine.model, messages, temperature: 0.4, max_tokens: 2000 }),
    signal,
  });
  if (r.status === 429) throw new QuotaError(`${engine.provider.label}: free limit reached for now`);
  if (!r.ok) throw new Error(`${engine.provider.label} replied ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}
