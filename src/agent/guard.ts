/*
 * The agent's rules, enforced in code.
 *
 * The model proposes; this decides. A free model will sometimes ignore a
 * prompt, so nothing it writes reaches your inbox, GitHub or Stripe without
 * passing every check here. The checks are deliberately blunt: a false
 * refusal costs one idea, a false pass could cost your reputation or money.
 *
 * What the agent can never do on its own, by construction rather than by
 * rule: the loop (loop.ts) has no import of anything that writes to GitHub
 * or Stripe. Those writers are reachable only from a button you press, and
 * tests/structure.test.ts fails the build if that ever changes.
 */

export type Kind = "workload" | "idea" | "revenue" | "improvement" | "review";

export type Offer = {
  name: string;
  description: string;
  amount_usd: number;
  interval: "one_time" | "month" | "year";
};

export type Proposal = {
  action?: string;
  title?: string;
  body?: string;
  offer?: Partial<Offer> | null;
  reason?: string;
};

export type Checked =
  | { ok: true; title: string; body: string; offer: Offer | null }
  | { ok: true; noop: true; reason: string }
  | { ok: false; reason: string };

export const MAX_TITLE = 120;
export const MAX_BODY = 6000;

/** Price limits for a drafted offer. Anything outside is refused, not clamped. */
export const OFFER_LIMITS = { min: 1, max: 5000, maxMonthly: 1000 };

const RULES: Array<[RegExp, string]> = [
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/, "contains something shaped like a secret key"],
  [/\bs[1-9A-HJ-NP-Za-km-z]{28}\b|\bsEd[1-9A-HJ-NP-Za-km-z]{26,}\b/, "contains something shaped like an XRPL seed"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "contains an email address; the agent never contacts or lists people"],
  [/(^|[\s(])@[A-Za-z0-9][A-Za-z0-9-]{0,38}\b/, "mentions a person by handle"],
  [/\bSOC ?2 (certified|compliant|report held)\b|\b(our|existing|paying) (customers|clients)\b|\bcode[- ]signed builds? (are|is) (live|available|shipping)\b|\bguarantee(d|s)? (returns?|profits?|compliance)\b/i, "makes a claim NOSHASHI cannot make (customers, SOC 2, signing, guarantees)"],
  [/\b(scrap(e|ing) (emails?|contacts?|linkedin)|buy(ing)? (followers|reviews|likes)|fake (reviews?|testimonials?|users?)|mass[- ]?(email|dm)s?|send(ing)? spam|spamm(ing|ed)|purchased (email|contact) lists?|wash[- ]?trad(e|ing)|pump[- ]and[- ]dump|front[- ]?run(ning)?|insider (trading|information)|impersonat\w*|evad(e|ing) (kyc|aml|sanctions)|bypass(ing)? (kyc|aml|sanctions)|without (their )?(consent|permission)|dark patterns?|hidden fees?|auto[- ]?renew without)\b/i, "proposes something unethical or unlawful"],
  [/\b(charge|bill|invoice) (the |their |a )?(card|customer|user)s? (automatically|now|immediately)\b|\b(create|issue) (a )?(refund|payout|transfer)\b|\bsend (xrp|funds|payment)\b/i, "tries to move money; only you do that"],
];

/** Checks any text the agent produced. Returns the first broken rule, or null. */
export function brokenRule(text: string): string | null {
  for (const [pattern, reason] of RULES) if (pattern.test(text)) return reason;
  return null;
}

/** Word-set overlap, for refusing an idea the agent already has. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.min(x.size, y.size);
}

/** A drafted Stripe offer, checked. Refused if anything is off; never adjusted. */
export function checkOffer(raw: Partial<Offer> | null | undefined): { ok: true; offer: Offer } | { ok: false; reason: string } {
  if (!raw) return { ok: false, reason: "no offer" };
  const name = String(raw.name ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const amount = Number(raw.amount_usd);
  const interval = raw.interval ?? "one_time";
  if (name.length < 3 || name.length > 80) return { ok: false, reason: "offer name must be 3 to 80 characters" };
  if (description.length < 10 || description.length > 500) return { ok: false, reason: "offer description must be 10 to 500 characters" };
  if (!["one_time", "month", "year"].includes(interval)) return { ok: false, reason: "interval must be one_time, month or year" };
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return { ok: false, reason: "price must be a whole number of dollars" };
  if (amount < OFFER_LIMITS.min || amount > OFFER_LIMITS.max) return { ok: false, reason: `price must be $${OFFER_LIMITS.min} to $${OFFER_LIMITS.max}` };
  if (interval === "month" && amount > OFFER_LIMITS.maxMonthly) return { ok: false, reason: `a monthly price above $${OFFER_LIMITS.maxMonthly} needs a person, not the agent` };
  const rule = brokenRule(`${name}\n${description}`);
  if (rule) return { ok: false, reason: rule };
  return { ok: true, offer: { name, description, amount_usd: amount, interval: interval as Offer["interval"] } };
}

/** Check one proposal against the rules and against what the agent already has. */
export function check(p: Proposal | null, existingTitles: string[]): Checked {
  if (!p || typeof p !== "object") return { ok: false, reason: "the model did not return an answer" };
  if (p.action === "noop") return { ok: true, noop: true, reason: String(p.reason ?? "nothing worth doing").slice(0, 300) };
  if (p.action !== "propose") return { ok: false, reason: `"${String(p.action).slice(0, 40)}" is not something the agent may do` };
  const title = String(p.title ?? "").trim();
  const body = String(p.body ?? "").trim();
  if (!title) return { ok: false, reason: "no title" };
  if (!body) return { ok: false, reason: "empty body" };
  if (title.length > MAX_TITLE) return { ok: false, reason: "title too long" };
  if (body.length > MAX_BODY) return { ok: false, reason: "body too long" };
  const rule = brokenRule(`${title}\n${body}`);
  if (rule) return { ok: false, reason: rule };
  const twin = existingTitles.find((t) => similarity(t, title) >= 0.6);
  if (twin) return { ok: false, reason: `too close to "${twin}"` };
  let offer: Offer | null = null;
  if (p.offer) {
    const o = checkOffer(p.offer);
    if (!o.ok) return { ok: false, reason: `offer refused: ${o.reason}` };
    offer = o.offer;
  }
  return { ok: true, title, body, offer };
}

/** The first complete JSON object in a model's reply, or null. Models wrap JSON in prose and fences. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
