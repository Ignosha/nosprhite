import { describe, it, expect } from "vitest";
import { safePath, safeApi } from "../src/agent/tools";
import { pickModel } from "../src/agent/llm";
import { keyMode, form } from "../src/agent/stripe";
import { nextJob, JOBS } from "../src/agent/jobs";
import { step, findPath, walkable, doorTile, BUILDINGS } from "../src/world";

describe("tool fences", () => {
  it("reads ordinary repo files and nothing secret-shaped", () => {
    expect(safePath("src/lib/roadmap.ts")).toBe(true);
    for (const p of ["../etc/passwd", ".env", "config/.env.local", "keys/server.pem", "node_modules/x/index.js", "secrets.json", ""]) expect(safePath(p)).toBe(false);
  });
  it("reads only NOSHASHI's public read-only endpoints", () => {
    expect(safeApi("/api/book-health")).toBe(true);
    expect(safeApi("/api/book?currency=USD&issuer=rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B")).toBe(true);
    expect(safeApi("/api/create-checkout-session")).toBe(false);
    expect(safeApi("/api/contact")).toBe(false);
  });
});

describe("engines pick the best free model each provider lists", () => {
  it("Gemini: the newest full Flash, not Lite, image or audio models", () => {
    expect(pickModel("gemini", ["models/gemini-2.5-flash", "models/gemini-3-flash", "models/gemini-3-flash-lite", "models/gemini-3-flash-image", "models/gemini-2.5-pro"])).toBe("gemini-3-flash");
    expect(pickModel("gemini", ["models/gemini-2.5-flash-lite", "models/text-embedding-004"])).toBe("gemini-2.5-flash-lite");
  });
  it("Groq: gpt-oss-120b first, never speech or guard models", () => {
    expect(pickModel("groq", ["whisper-large-v3", "meta-llama/llama-guard-4-12b", "qwen/qwen3-32b", "openai/gpt-oss-120b"])).toBe("openai/gpt-oss-120b");
    expect(pickModel("groq", ["whisper-large-v3", "qwen/qwen3-32b"])).toBe("qwen/qwen3-32b");
  });
  it("Mistral: its largest general model, never embeddings or OCR", () => {
    expect(pickModel("mistral", ["mistral-embed", "mistral-ocr-latest", "mistral-small-latest", "mistral-large-latest"])).toBe("mistral-large-latest");
    expect(pickModel("mistral", ["mistral-embed", "mistral-small-latest"])).toBe("mistral-small-latest");
  });
  it("OpenRouter: only free models", () => {
    expect(pickModel("openrouter", ["openai/gpt-4o", "deepseek/deepseek-chat-v3:free", "meta-llama/llama-3.3-70b-instruct:free"])).toBe("deepseek/deepseek-chat-v3:free");
    expect(pickModel("openrouter", ["openai/gpt-4o"])).toBeNull();
  });
});

describe("stripe helpers", () => {
  it("knows test from live and refuses publishable keys", () => {
    expect(keyMode("rk_test_123")).toBe("test");
    expect(keyMode("rk_live_123")).toBe("live");
    expect(keyMode("pk_live_123")).toBe("invalid");
    expect(keyMode(null)).toBe("invalid");
  });
  it("form-encodes Stripe's bracket parameters", () => {
    expect(form({ "line_items[0][price]": "price_1", unit_amount: 45000 })).toBe("line_items%5B0%5D%5Bprice%5D=price_1&unit_amount=45000");
  });
});

describe("jobs and the village", () => {
  it("takes every job in turn", () => {
    let i = -1;
    const seen = new Set<string>();
    for (let k = 0; k < JOBS.length; k++) ({ index: i } = nextJob(i)), seen.add(JOBS[i].id);
    expect(seen.size).toBe(JOBS.length);
  });
  it("walks a villager to its building and stops there", () => {
    let v = { x: 0, y: 0 };
    let arrived = false;
    for (let n = 0; n < 1000 && !arrived; n++) ({ arrived, ...v } = { ...step(v, { x: 3, y: 4 }, 0.5) });
    expect(v).toEqual({ x: 3, y: 4 });
  });

  it("finds a walkable path from every door to every other door", () => {
    for (const a of BUILDINGS) {
      for (const b of BUILDINGS) {
        if (a === b) continue;
        const path = findPath(doorTile(a), doorTile(b));
        const last = path[path.length - 1];
        expect(last).toEqual(doorTile(b));
        for (const [x, y] of path.slice(0, -1)) expect(walkable(x, y)).toBe(true);
      }
    }
  });
  it("never walks through a building", () => {
    expect(walkable(10, 8)).toBe(false); // inside the tower
    expect(walkable(...doorTile(BUILDINGS[0]))).toBe(true);
  });
});
