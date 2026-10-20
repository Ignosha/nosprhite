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
4. Get a **free AI key** (2 minutes, no card): open
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in with
   Google, and press **Create API key**. For a second, very fast backup, also get one at
   [console.groq.com/keys](https://console.groq.com/keys).
5. Open Nosprhite › **Settings**, paste the key(s) under **Free AI**, press
   **Save**, then flip the switch to **ON**.

## Or build it yourself (about 15 minutes, all free)

1. **Install the build tools** once: [Node.js 20+](https://nodejs.org) and
   [Rust](https://rustup.rs). On Windows also the
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
   (WebView2 and the C++ build tools); on Linux the WebKitGTK packages listed there.
2. **Get a free AI key** as in step 4 above (Gemini, and optionally Groq).
3. **Run Nosprhite** from this folder:
   ```
   npm install
   npm run app            # opens the app
   npm run app:build      # or build an installer into src-tauri/target/release/bundle
   ```
4. In **Settings**, paste your free AI key(s) under **Free AI**. Then add a GitHub fine-grained token for `Ignosha/noshashi` with
   *Issues: read and write* and *Models: read*. That lets the village read the
   repo, file issues you approve, and use GitHub Models' free tier as one more backup.
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

## Which AI it uses

All free, used in this order; when one reaches its free daily limit the
village moves to the next:

| Provider | Free limit (roughly) | Key |
|---|---|---|
| Google Gemini (Flash) | ~1,500 requests a day | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Groq (gpt-oss-120b) | ~1,000 requests a day | [console.groq.com/keys](https://console.groq.com/keys) |
| OpenRouter free models | ~50 requests a day | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| GitHub Models | ~50 to 150 a day | your GitHub token |
| Ollama (optional) | your computer | none; only if it happens to be running |

The app asks each provider which models it has and picks its best free one,
so it keeps working when providers rename models. You can name a model in
Settings instead. Free limits change; the village stops a little short of them.

What to expect, honestly: Gemini Flash and gpt-oss-120b are far more capable
than a small model on your computer, and handle one focused job well. They are
still not Claude, and long, many-step work is not what the village asks of
them. Some ideas will be weak; Owl's reviews and the Dismiss button are there
for that. On the free tier, Google may use what is sent to improve its models.
The village only sends NOSHASHI's public code, public ledger data and its own
drafts, never your keys. It works while your computer is on and the app is open.

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
