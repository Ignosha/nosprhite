/*
 * The free engines. Ollama runs models on your own computer: free, private
 * and offline. GitHub Models gives hosted models free within a daily quota,
 * using your own GitHub token. Local is tried first.
 *
 * Neither is as capable as Claude. A 7 to 14 billion parameter local model
 * or a free hosted one handles focused tasks well and long, many-step work
 * poorly, which is why each job is small and every answer is checked.
 */
import type { Fetch } from "./net";

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type Engine = { kind: "ollama" | "github"; model: string; label: string };

export class QuotaError extends Error {}

/** Local models that do well at this kind of work, best first. */
export const PREFERRED_LOCAL = ["qwen2.5:14b", "qwen2.5-coder:14b", "llama3.1:8b", "qwen2.5:7b", "qwen2.5-coder:7b", "gemma2:9b", "mistral-nemo", "llama3.2:3b"];

export function pickLocal(available: string[], wanted: string): string | null {
  if (available.length === 0) return null;
  if (wanted && available.includes(wanted)) return wanted;
  for (const p of PREFERRED_LOCAL) {
    const hit = available.find((a) => a === p) ?? available.find((a) => a.startsWith(p));
    if (hit) return hit;
  }
  return available[0];
}

export async function detectEngines(
  f: Fetch,
  cfg: { ollamaUrl: string; ollamaModel: string; githubModel: string },
  githubToken: string | null,
): Promise<Engine[]> {
  const engines: Engine[] = [];
  try {
    const r = await f(`${cfg.ollamaUrl}/api/tags`, { method: "GET" });
    if (r.ok) {
      const tags = (await r.json()) as { models?: Array<{ name: string }> };
      const model = pickLocal((tags.models ?? []).map((m) => m.name), cfg.ollamaModel);
      if (model) engines.push({ kind: "ollama", model, label: `${model} on this computer` });
    }
  } catch {
    /* Ollama not running: fine, try the next engine. */
  }
  if (githubToken) engines.push({ kind: "github", model: cfg.githubModel, label: `${cfg.githubModel} (GitHub Models, free tier)` });
  return engines;
}

export async function chat(
  f: Fetch,
  engine: Engine,
  messages: Message[],
  opts: { ollamaUrl: string; githubToken: string | null; signal?: AbortSignal },
): Promise<string> {
  if (engine.kind === "ollama") {
    const r = await f(`${opts.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: engine.model, messages, stream: false, format: "json", options: { temperature: 0.4, num_ctx: 8192 } }),
      signal: opts.signal,
    });
    if (!r.ok) throw new Error(`Ollama replied ${r.status}`);
    const body = (await r.json()) as { message?: { content?: string } };
    return body.message?.content ?? "";
  }
  const r = await f("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.githubToken}`, Accept: "application/json" },
    body: JSON.stringify({ model: engine.model, messages, temperature: 0.4, max_tokens: 1500 }),
    signal: opts.signal,
  });
  if (r.status === 429) throw new QuotaError("GitHub Models' free quota is used up for now");
  if (!r.ok) throw new Error(`GitHub Models replied ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}
