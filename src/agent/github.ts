/*
 * The only code that writes to GitHub. Called from the inbox's "File on
 * GitHub" button, never from the agent loop.
 */
import type { Fetch } from "./net";
import type { Item } from "./store";

export async function fileIssue(f: Fetch, token: string, owner: string, repo: string, item: Item): Promise<string> {
  const r = await f(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `[Nosprhite] ${item.title}`,
      body: `${item.body}\n\n---\n_Drafted by ${item.villager} in the Nosprhite village (${item.engine}) and filed by Joshua._`,
    }),
  });
  if (!r.ok) throw new Error(`GitHub replied ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { html_url: string }).html_url;
}
