# Nosprhite

A tiny sprite village of AI helpers that works on NOSHASHI while you're
away. It runs on your own computer, uses only free AI, and never acts
without you: everything it makes waits in your inbox for a click.

| Villager | Building | Job |
|---|---|---|
| Pip | Workload board | Orders your next five tasks from the open issues and recent commits |
| Fern | Idea lab | Proposes a product feature grounded in live ledger data |
| Coin | Market | Proposes an honest way to earn money, sometimes with a drafted Stripe offer |
| Bolt | Workshop | Reads one file in the repo and proposes one concrete fix |
| Owl | Critic's tower | Says which of the village's ideas is weakest or strongest |

Every job: read with read-only tools → draft → a critic pass → the guard
→ your inbox. One job every 30 minutes by default.

## Get the Mac app

1. Open this repository's **Releases** page and download `Nosprhite_…_universal.dmg`.
   (It is built for free by GitHub Actions every time `main` changes.)
2. Open the .dmg and drag **Nosprhite** to Applications.
3. The first time, **right-click Nosprhite › Open**, then **Open** again. macOS
   asks because the app is not signed with a paid Apple Developer certificate.
   If it still refuses, run this once in Terminal:
   `xattr -cr /Applications/Nosprhite.app`
4. Install **Ollama** from [ollama.com](https://ollama.com) and run
   `ollama pull qwen2.5:7b` (or `qwen2.5:14b` with 16 GB of memory or more).
5. Open Nosprhite, add your keys in **Settings** (steps 4 and 5 below), and flip
   the switch to **ON**.

## Or build it yourself (about 15 minutes, all free)

1. **Install the build tools** once: [Node.js 20+](https://nodejs.org) and
   [Rust](https://rustup.rs). On Windows also the
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
   (WebView2 and the C++ build tools); on Linux the WebKitGTK packages listed there.
2. **Install Ollama** from [ollama.com](https://ollama.com) and pull a model:
   ```
   ollama pull qwen2.5:7b      # 8 GB of memory is enough
   ollama pull qwen2.5:14b     # better, if you have 16 GB or more
   ```
3. **Run Nosprhite** from this folder:
   ```
   npm install
   npm run app            # opens the app
   npm run app:build      # or build an installer into src-tauri/target/release/bundle
   ```
4. In **Settings**, add a GitHub fine-grained token for `Ignosha/noshashi` with
   *Issues: read and write* and *Models: read*. That lets the village read the
   repo, file issues you approve, and fall back to GitHub Models' free tier
   when Ollama is not running.
5. Optional, for **Stripe**: add a *restricted* key (Stripe → Developers → API
   keys → Create restricted key) with **Write** on Products, Prices and Payment
   Links and **Read** on Balance and Payment Intents, and nothing else. Start
   with a test key (`rk_test_…`).

Keys are kept in your operating system's keychain (macOS Keychain, Windows
Credential Manager, Linux Secret Service), never in a file.

## Turning it off

Any of these stops it at once, including a request already in flight:
- the big **ON/OFF** switch at the top of the window;
- **Stop the agent** in the tray icon's menu;
- quitting the app.

It remembers whether you left it on or off.

## What it can do, honestly

- It runs on free models: a 7 to 14 billion parameter model on your computer,
  or GitHub Models' free tier (roughly 50 to 150 requests a day, about 8,000
  tokens per request). These are **not** on par with Claude. They do well at
  one focused task with the material in front of them, and poorly at long,
  many-step work, which is why each job is small and every answer is checked.
- Expect some ideas to be weak. Owl's reviews and the Dismiss button are there
  for that.
- It works while your computer is on and the app is open.

## What it can never do

Enforced in code (`src/agent/guard.ts`), not just asked of the model:
- move money, charge anyone, or create anything in Stripe on its own. A drafted
  offer becomes a product, price and payment link only when you press
  **Create payment link** and confirm. Prices must be whole dollars from $1 to
  $5,000, and no more than $1,000 a month for a subscription;
- write to GitHub on its own. Issues are filed only when you press
  **File on GitHub**;
- include secrets, email addresses or @-mentions, claim customers, SOC 2,
  signed builds or guarantees, or propose scraping, spam, fake reviews,
  sanctions or KYC evasion, or market manipulation;
- reach any host except Ollama on your computer, GitHub, GitHub Models, Stripe
  and noshashi.app (`src-tauri/capabilities/default.json`);
- read secret-shaped files from the repository.

`tests/structure.test.ts` fails if the agent loop ever gains a path to a
GitHub or Stripe write.

## Checks

```
npm test         # 32 tests: the guard, the fences, the village
npm run build    # type check and build the window
```
