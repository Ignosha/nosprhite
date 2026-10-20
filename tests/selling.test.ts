/*
 * Selling: who the village may write to, and what a sellable product must be.
 */
import { describe, it, expect } from "vitest";
import { parseCsv, parseContacts, eligible, addressFor, mailto } from "../src/agent/outreach";
import { check, checkOffer } from "../src/agent/guard";

const CSV = `institution,vertical,segment,country,priority,channel,email,contact_page,note,fit,checked_on,status
Acme Exchange,compliance_function,exchange,US,1,compliance,compliance@acme.example,https://acme.example/contact,"Role inbox, published","Lists XRPL tokens, needs screening",2026-10-01,verified
Beta Bank,regulated_institution,bank,GB,1,general,info@beta.example,https://beta.example,"",fit,2026-10-01,contacted
Gamma Fund,trading_desk,fund,US,2,general,info@gamma.example,https://gamma.example,"",fit,2026-10-01,verified
Delta Pay,payments_corridor,"payments, FX",PT,1,form,,https://delta.example/form,"Form only",fit,2026-10-01,verified
Echo Co,treasury_holder,listed,US,1,investor_relations,ir@echo.example,https://echo.example,"says ""hello"", twice",fit,2026-10-01,declined
`;

describe("the outreach list", () => {
  it("reads quoted fields with commas and doubled quotes", () => {
    const rows = parseCsv(CSV);
    expect(rows[4][7]).toBe("https://delta.example/form");
    expect(rows[4][2]).toBe("payments, FX");
    expect(parseContacts(CSV)[4].note).toBe('says "hello", twice');
  });

  it("offers only verified, never-contacted, priority-1 institutions with a published address", () => {
    const list = eligible(parseContacts(CSV), new Set());
    expect(list.map((c) => c.institution)).toEqual(["Acme Exchange"]);
  });

  it("never offers an institution the village already drafted", () => {
    expect(eligible(parseContacts(CSV), new Set(["acme exchange"]))).toEqual([]);
  });

  it("looks the address up itself: a name not on the list gets nothing", () => {
    const list = eligible(parseContacts(CSV), new Set());
    expect(addressFor("acme exchange", list)?.email).toBe("compliance@acme.example");
    expect(addressFor("Beta Bank", list)).toBeNull();
    expect(addressFor("someone@evil.example", list)).toBeNull();
    expect(addressFor(null, list)).toBeNull();
  });

  it("builds a mailto link your mail app opens, encoded", () => {
    expect(mailto("a@b.example", "Hi & bye", "Line 1\nLine 2")).toBe("mailto:a%40b.example?subject=Hi%20%26%20bye&body=Line%201%0ALine%202");
  });
});

describe("selling products", () => {
  const offer = { name: "XRPL Exchange Screening Checklist", description: "A practical checklist for exchange compliance teams listing XRPL tokens.", amount_usd: 29, interval: "one_time" as const, delivery: "digital" as const };
  const product = "## Checklist\n\n" + "Check the issuer's freeze and clawback flags before listing. ".repeat(20);

  it("a digital product must come with its full text", () => {
    expect(check({ action: "propose", title: "Sell a screening checklist", body: "For exchanges.", offer }, []).ok).toBe(false);
    const r = check({ action: "propose", title: "Sell a screening checklist", body: "For exchanges.", offer, product }, []);
    expect(r.ok && !("noop" in r) && r.product).toBeTruthy();
  });

  it("refuses a thin product, and a digital subscription", () => {
    expect(check({ action: "propose", title: "t", body: "b", offer, product: "Too short." }, []).ok).toBe(false);
    expect(checkOffer({ ...offer, interval: "month" }).ok).toBe(false);
  });

  it("refuses a product that breaks a rule", () => {
    expect(check({ action: "propose", title: "t", body: "b", offer, product: product + " Our customers guarantee returns." }, []).ok).toBe(false);
  });

  it("treats an offer without a delivery type as a service you deliver", () => {
    const o = checkOffer({ name: "Treasury review", description: "A one-hour review of an XRP treasury's controls.", amount_usd: 300, interval: "one_time" });
    expect(o.ok && o.offer.delivery).toBe("service");
  });
});
