/*
 * The villagers and their jobs. One job per cycle, in turn, so every kind of
 * work gets done and no single kind floods the inbox.
 */
import type { Kind } from "./guard";

export type Job = {
  id: Kind;
  villager: string;
  building: "board" | "lab" | "market" | "workshop" | "tower" | "post";
  goal: string;
  firstLook: Array<{ tool: string; args: Record<string, unknown> }>;
};

export const JOBS: Job[] = [
  {
    id: "workload",
    villager: "Pip",
    building: "board",
    goal: "Look at the open issues and recent commits and write the workload board: the five most important things Joshua should do next, in order, each with one line on why and how long it takes. Include anything blocked and what unblocks it.",
    firstLook: [{ tool: "list_issues", args: {} }, { tool: "recent_commits", args: {} }],
  },
  {
    id: "idea",
    villager: "Fern",
    building: "lab",
    goal: "Propose one new product Joshua could build and sell. It may be a NOSHASHI feature for compliance officers, auditors, treasuries or XRPL issuers, grounded in something the ledger really shows, OR a small software tool for any other market (small businesses, creators, finance teams, developers). Prefer things that can run and sell on their own once built, with no ongoing manual work. Say who it is for, what problem it solves, how it would make money, and the smallest version worth building.",
    firstLook: [{ tool: "noshashi_api", args: { path: "/api/book-health" } }, { tool: "read_file", args: { path: "CHANGELOG.md" } }],
  },
  {
    id: "revenue",
    villager: "Coin",
    building: "market",
    goal: `Propose one honest way to earn money, in any market, not only crypto. Best of all is a DIGITAL PRODUCT you write yourself, right now, in full: a practical guide, a checklist, a template pack or a short report that a specific buyer would pay for (for example: an XRPL compliance checklist for exchanges, a guide to auditing crypto treasuries, a small-business AI automation playbook, a founder's sales-email template pack). For a digital product, include "product" with the COMPLETE text in Markdown (at least 800 words, genuinely useful, no filler, no invented statistics) and an "offer" with name, description, amount_usd (whole dollars, usually 9 to 99), interval "one_time" and delivery "digital"; once Joshua approves, buyers receive it automatically. Alternatively propose a SERVICE Joshua can deliver (setup, review, consulting) with an offer whose delivery is "service". Or a way to sell NOSHASHI's plans (Free, Pro $749/seat/month, Institutional $4,000/month, Enterprise $10,000/month, Strategic $20,833/month). Say who pays and why.`,
    firstLook: [{ tool: "read_file", args: { path: "src/lib/billing/catalog.ts" } }],
  },
  {
    id: "improvement",
    villager: "Bolt",
    building: "workshop",
    goal: "Pick one file in the NOSHASHI repository, read it, and propose one concrete improvement: a bug, a missing test, an unclear message or a simplification. Quote the lines and write the change out so a person can apply it.",
    firstLook: [{ tool: "list_dir", args: { path: "api/_lib" } }],
  },
  {
    id: "review",
    villager: "Owl",
    building: "tower",
    goal: "Read the ideas the village already has (listed below) and the open issues. Name the weakest idea and why, or the strongest and what its first step is. Be blunt and specific.",
    firstLook: [{ tool: "list_issues", args: {} }],
  },
  {
    id: "outreach",
    villager: "Wren",
    building: "post",
    goal: "Write one first email about NOSHASHI to ONE institution from the eligible list below. Lead with a measurement the reader can check (a figure you read with noshashi_api, with its ledger index and date, and the disclosure that the 10% band is a chosen parameter and AMM pools are excluded). Say who it is for in the first line. Under 150 words, plain text, one link (https://www.noshashi.app), one ask (a 20-minute call or a reply). Never ask for their data. Do not sign it; the signature is added for you. Answer with recipient (the institution name exactly as listed), subject, title and body.",
    firstLook: [{ tool: "noshashi_api", args: { path: "/api/book-health" } }],
  },
];

export function nextJob(previous: number): { job: Job; index: number } {
  const index = (previous + 1) % JOBS.length;
  return { job: JOBS[index], index };
}
