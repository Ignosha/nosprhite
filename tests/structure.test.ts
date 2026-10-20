/*
 * The agent loop must have no path to anything that writes. If someone
 * imports the GitHub or Stripe writers, or names a write command, into the
 * loop or its tools, this fails.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../src/agent/${p}`, import.meta.url), "utf8");

describe("the agent cannot act on its own", () => {
  for (const file of ["loop.ts", "tools.ts", "jobs.ts", "llm.ts"]) {
    it(`${file} imports no writer`, () => {
      const src = read(file);
      expect(src).not.toMatch(/from\s+["']\.\/(github|stripe)["']/);
      expect(src).not.toMatch(/fileIssue|createOffer|secret_set|secret_delete|mail_send|mail_save_draft/);
    });
  }

  it("the tools only ever GET", () => {
    const src = read("tools.ts");
    const methods = [...src.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  });

  it("the window's network is fenced to known hosts", () => {
    const caps = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
    const http = caps.permissions.find((p: { identifier?: string }) => p.identifier === "http:default");
    const hosts = http.allow.map((a: { url: string }) => new URL(a.url.replace("*", "")).host).sort();
    expect(hosts).toEqual(["127.0.0.1:11434", "api.github.com", "api.groq.com", "api.mistral.ai", "api.stripe.com", "generativelanguage.googleapis.com", "localhost:11434", "models.github.ai", "openrouter.ai", "www.noshashi.app"]);
  });
});
