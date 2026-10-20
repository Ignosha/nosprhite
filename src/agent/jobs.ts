/*
 * The villagers and their jobs. One job per cycle, in turn, so every kind of
 * work gets done and no single kind floods the inbox.
 */
import type { Kind } from "./guard";

export type Job = {
  id: Kind;
  villager: string;
  building: "board" | "lab" | "market" | "workshop" | "tower";
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
    goal: "Propose one new product feature for NOSHASHI that a compliance officer, auditor, treasury or XRPL issuer would value. Ground it in something the ledger really shows. Say who it is for, what problem it solves, what it would read from the ledger, and the smallest version worth building.",
    firstLook: [{ tool: "noshashi_api", args: { path: "/api/book-health" } }, { tool: "read_file", args: { path: "CHANGELOG.md" } }],
  },
  {
    id: "revenue",
    villager: "Coin",
    building: "market",
    goal: "Propose one honest way for NOSHASHI to earn money that fits its plans (Free, Pro $749/seat/month, Institutional $4,000/month, Enterprise $10,000/month, Strategic $20,833/month, API check packs from $450). Say who pays, why they would, and what Joshua must do. If a simple one-off product fits (a report, a review, a pack), include an \"offer\" with name, description, amount_usd (whole dollars) and interval (one_time, month or year).",
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
];

export function nextJob(previous: number): { job: Job; index: number } {
  const index = (previous + 1) % JOBS.length;
  return { job: JOBS[index], index };
}
