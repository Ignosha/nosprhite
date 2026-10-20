/*
 * What the agent may look at. Every tool only reads, every reply is cut to
 * a size a small model can use, and paths are checked before any request.
 */
import type { Fetch } from "./net";

export type ToolContext = { f: Fetch; owner: string; repo: string; token: string | null; signal?: AbortSignal };

const LIMIT = 3500;
const cut = (s: string) => (s.length > LIMIT ? `${s.slice(0, LIMIT)}\n…(cut)` : s);

/** Repository paths the agent may read. Secrets-shaped and generated paths are refused. */
export function safePath(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (!p || p.length > 200 || p.includes("..")) return false;
  if (/(^|\/)\.env|secret|credential|\.pem$|\.key$|node_modules|(^|\/)dist\/|(^|\/)target\//i.test(p)) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(p);
}

/** NOSHASHI endpoints the agent may read: public, read-only, free. */
export function safeApi(path: string): boolean {
  return /^\/api\/(book-health|book|authority|issuer-state|treasury)(\?[A-Za-z0-9=&%._,:-]*)?$/.test(path);
}

function headers(ctx: ToolContext, raw = false): Record<string, string> {
  const h: Record<string, string> = { Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (ctx.token) h.Authorization = `Bearer ${ctx.token}`;
  return h;
}

export const TOOL_HELP = `Tools (read-only). Call one with {"tool": "<name>", "args": {...}}:
- read_file {"path": "src/lib/roadmap.ts"}: a file from the NOSHASHI repository (first ${LIMIT} characters)
- list_dir {"path": "api/_lib"}: files in a folder
- list_issues {}: open issues with their labels
- recent_commits {}: the last 10 commit messages
- noshashi_api {"path": "/api/book-health"}: live, read-only NOSHASHI data (book-health, book, authority, issuer-state, treasury)`;

export async function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  const base = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}`;
  const get = async (url: string, raw = false) => {
    const r = await ctx.f(url, { method: "GET", headers: headers(ctx, raw), signal: ctx.signal });
    if (!r.ok) return `error: ${r.status}`;
    return raw ? r.text() : r.json();
  };
  switch (name) {
    case "read_file": {
      const path = String(args.path ?? "");
      if (!safePath(path)) return "refused: that path is not readable";
      return cut(String(await get(`${base}/contents/${path}`, true)));
    }
    case "list_dir": {
      const path = String(args.path ?? "");
      if (path && !safePath(path)) return "refused: that path is not readable";
      const items = (await get(`${base}/contents/${path}`)) as Array<{ name: string; type: string }> | string;
      return typeof items === "string" ? items : cut(items.map((i) => `${i.type === "dir" ? "dir " : ""}${i.name}`).join("\n"));
    }
    case "list_issues": {
      const items = (await get(`${base}/issues?state=open&per_page=25`)) as Array<{ number: number; title: string; labels: Array<{ name: string }>; pull_request?: unknown }> | string;
      return typeof items === "string" ? items : cut(items.map((i) => `#${i.number}${i.pull_request ? " (PR)" : ""} ${i.title} [${i.labels.map((l) => l.name).join(", ")}]`).join("\n") || "no open issues");
    }
    case "recent_commits": {
      const items = (await get(`${base}/commits?per_page=10`)) as Array<{ commit: { message: string } }> | string;
      return typeof items === "string" ? items : cut(items.map((c) => `- ${c.commit.message.split("\n")[0]}`).join("\n"));
    }
    case "noshashi_api": {
      const path = String(args.path ?? "");
      if (!safeApi(path)) return "refused: only the public read-only NOSHASHI endpoints";
      const r = await ctx.f(`https://www.noshashi.app${path}`, { method: "GET", signal: ctx.signal });
      return cut(await r.text());
    }
    default:
      return `unknown tool "${name}"`;
  }
}
