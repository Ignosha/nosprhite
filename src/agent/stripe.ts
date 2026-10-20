/*
 * The only code that talks to Stripe. Reading (balance, recent payments) is
 * used by the Money tab. Creating an offer is called only from the inbox's
 * "Create payment link" button, after you have read the offer, and never
 * from the agent loop. Use a restricted key: see README.md.
 */
import type { Fetch } from "./net";
import type { Offer } from "./guard";

export type KeyMode = "test" | "live" | "invalid";

export function keyMode(key: string | null): KeyMode {
  if (!key) return "invalid";
  if (/^(rk|sk)_test_/.test(key)) return "test";
  if (/^(rk|sk)_live_/.test(key)) return "live";
  return "invalid";
}

export function form(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function call(f: Fetch, key: string, method: "GET" | "POST", path: string, params?: Record<string, string | number>) {
  const r = await f(`https://api.stripe.com/v1/${path}${method === "GET" && params ? `?${form(params)}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? form(params) : undefined,
  });
  const body = (await r.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!r.ok) throw new Error(body.error?.message ?? `Stripe replied ${r.status}`);
  return body;
}

export async function balance(f: Fetch, key: string): Promise<Array<{ amount: number; currency: string; kind: string }>> {
  const b = (await call(f, key, "GET", "balance")) as { available?: Array<{ amount: number; currency: string }>; pending?: Array<{ amount: number; currency: string }> };
  return [
    ...(b.available ?? []).map((x) => ({ ...x, kind: "available" })),
    ...(b.pending ?? []).map((x) => ({ ...x, kind: "pending" })),
  ];
}

export async function recentPayments(f: Fetch, key: string): Promise<Array<{ id: string; amount: number; currency: string; status: string; created: number; description: string | null }>> {
  const r = (await call(f, key, "GET", "payment_intents", { limit: 10 })) as { data: Array<{ id: string; amount: number; currency: string; status: string; created: number; description: string | null }> };
  return r.data;
}

/** Product, price and payment link, in that order. Returns the link to share. */
export async function createOffer(f: Fetch, key: string, offer: Offer): Promise<{ url: string; product: string; price: string }> {
  const product = (await call(f, key, "POST", "products", { name: offer.name, description: offer.description, "metadata[source]": "nosprhite" })) as { id: string };
  const priceParams: Record<string, string | number> = { product: product.id, currency: "usd", unit_amount: offer.amount_usd * 100 };
  if (offer.interval !== "one_time") priceParams["recurring[interval]"] = offer.interval;
  const price = (await call(f, key, "POST", "prices", priceParams)) as { id: string };
  const link = (await call(f, key, "POST", "payment_links", { "line_items[0][price]": price.id, "line_items[0][quantity]": 1 })) as { url: string };
  return { url: link.url, product: product.id, price: price.id };
}
