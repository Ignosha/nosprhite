/*
 * One fetch for the whole app. Inside the desktop app it is Tauri's HTTP
 * plugin, which only reaches the hosts listed in
 * src-tauri/capabilities/default.json: a second fence around the agent.
 * In a plain browser (npm run dev) it falls back to the browser's fetch.
 */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

let cached: Fetch | null = null;

export async function net(): Promise<Fetch> {
  if (cached) return cached;
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (inTauri) {
    const mod = await import("@tauri-apps/plugin-http");
    cached = mod.fetch as unknown as Fetch;
  } else {
    cached = (input, init) => fetch(input, init);
  }
  return cached;
}
