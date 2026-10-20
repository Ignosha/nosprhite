import { describe, it, expect } from "vitest";
import { check, checkOffer, brokenRule, extractJson, similarity } from "../src/agent/guard";

const propose = (title: string, body: string, offer: unknown = null) => ({ action: "propose", title, body, offer: offer as never });

describe("the guard refuses what the agent must never do", () => {
  it.each([
    ["a secret key", "Use sk_live_51HxAbCdEfGhIjKl to charge"],
    ["a GitHub token", "token ghp_abcdefghijklmnopqrstuvwxyz0123"],
    ["an email address", "Write to someone@example.com about it"],
    ["a handle", "Ask @somebody to review"],
    ["a customer claim", "Our customers love the gate"],
    ["a SOC 2 claim", "We are SOC 2 certified"],
    ["scraping", "Scrape emails from LinkedIn of compliance officers"],
    ["fake reviews", "Seed fake reviews on G2"],
    ["sanctions evasion", "Help users bypass sanctions screening"],
    ["moving money", "Charge the customer automatically every week"],
  ])("refuses %s", (_, text) => {
    const r = check(propose("A plan", text), []);
    expect(r.ok).toBe(false);
  });

  it("lets an honest, specific idea through", () => {
    const r = check(propose("Quarter-end fillable depth report", "Auditors of XRP treasuries need fillable depth at period end. Read book_offers at the closing ledger."), []);
    expect(r.ok && !("noop" in r)).toBe(true);
  });

  it("allows talk about detecting spam and insider threats", () => {
    expect(brokenRule("Flag spam memos and insider threat patterns in deposits")).toBeNull();
  });

  it("refuses an idea the village already has", () => {
    const r = check(propose("Quarter-end fillable depth report for auditors", "x"), ["Quarter end fillable depth report"]);
    expect(r.ok).toBe(false);
  });

  it("only accepts propose or noop", () => {
    expect(check({ action: "send_email", title: "t", body: "b" }, []).ok).toBe(false);
    const n = check({ action: "noop", reason: "quiet day" }, []);
    expect(n.ok && "noop" in n).toBe(true);
  });
});

describe("drafted Stripe offers", () => {
  const base = { name: "Treasury depth report", description: "A period-end fillable depth report for one XRP treasury.", amount_usd: 450, interval: "one_time" as const };
  it("accepts a sensible offer", () => expect(checkOffer(base).ok).toBe(true));
  it("refuses fractions, out-of-range and pricey monthly prices", () => {
    expect(checkOffer({ ...base, amount_usd: 49.5 }).ok).toBe(false);
    expect(checkOffer({ ...base, amount_usd: 0 }).ok).toBe(false);
    expect(checkOffer({ ...base, amount_usd: 50000 }).ok).toBe(false);
    expect(checkOffer({ ...base, amount_usd: 2000, interval: "month" }).ok).toBe(false);
  });
  it("refuses an offer whose text breaks a rule", () => {
    expect(checkOffer({ ...base, description: "Guaranteed returns for every buyer of this pack" }).ok).toBe(false);
  });
});

describe("reading model replies", () => {
  it("finds the JSON inside prose and fences", () => {
    expect(extractJson('Sure!\n```json\n{"action":"noop","reason":"a } in text"}\n```')).toEqual({ action: "noop", reason: "a } in text" });
    expect(extractJson("no json here")).toBeNull();
  });
  it("measures overlap by words", () => {
    expect(similarity("Book health page", "book health page live")).toBe(1);
    expect(similarity("Treasury report", "Stripe payment link")).toBe(0);
  });
});
