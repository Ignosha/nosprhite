/*
 * Publishing a digital product: the only code that creates a Gist. Called
 * from the inbox's "Publish & sell" button, never from the agent loop.
 *
 * The product goes in a secret (unlisted) Gist on your GitHub account: free,
 * not searchable, readable by anyone who has the link. The Stripe payment
 * link's thank-you page shows that link, so a buyer gets the product the
 * moment they pay, with nobody needing to do anything.
 */
import type { Fetch } from "./net";

export async function publishGist(f: Fetch, token: string, name: string, markdown: string): Promise<string> {
  const file = `${name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "product"}.md`;
  const r = await f("https://api.github.com/gists", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ description: name, public: false, files: { [file]: { content: markdown } } }),
  });
  if (r.status === 403 || r.status === 404) throw new Error("GitHub refused to create the Gist. Give your token the Gists: Read and write permission (Account permissions).");
  if (!r.ok) throw new Error(`GitHub replied ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { html_url: string }).html_url;
}
