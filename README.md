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
| Wren | Post office | Writes an outreach email about NOSHASHI to one verified institution, for you to send |

## Selling, inside and outside crypto

- **Digital products.** Coin writes a whole product (a guide, checklist, template
  pack or report, in any market) with a price. Press **Publish & sell**: the product
  goes in a secret Gist on your GitHub and Stripe gets a payment link whose
  thank-you page shows buyers the download link. After that it sells itself;
  nobody has to send anything. (A secret Gist is unlisted, but anyone with the
  link can read it, so a buyer could share it. That is the trade-off of free.)
- **Services.** Setup, reviews or consulting, with a payment link. You deliver these.
- **Outreach.** Wren only writes to institutions in NOSHASHI's outreach list whose
  published address has been verified and who have never been contacted. The
  model names the institution; the app looks up the address. **Open in Mail**
  opens the email in your mail app with your signature; nothing is sent until
  you press Send. Add your postal address to the signature first (US law).
- **Ideas.** Fern proposes products for any market, preferring ones that run on
  their own once built.

## Updates

Nosprhite checks for a new version when it opens and every six hours, and shows
**Install and restart** when one is ready. Updates are signed: the app refuses
any update not signed with the project's key. Two one-time steps switch this on:

1. Repository **Settings › Secrets and variables › Actions › New repository
   secret**: name `TAURI_SIGNING_PRIVATE_KEY`, value: the contents of the
   `nosprhite-updater.key` file you were given. Keep a copy somewhere safe; if
   it is lost, future versions cannot update older installs.
2. Repository **Settings › General › Danger zone › Change visibility › Public**,
   so the app can read new releases without a password. Nothing secret is in
   the code: your keys live in your Mac's keychain, never in the repository.
   (Public repositories also get unlimited free build minutes.)

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
   [console.groq.com/keys](https://console.groq.com/keys), sign up, and press
   **Create API Key**. Your GitHub token (step 4 below) also works as a free AI,
   and a free [Mistral key](https://console.mistral.ai/api-keys) makes a good backup.
5. Open Nosprhite › **Settings**, paste the key(s) under **Free AI**, press
   **Save**, then flip the switch to **ON**.

## Or build it yourself (about 15 minutes, all free)

1. **Install the build tools** once: [Node.js 20+](https://nodejs.org) and
   [Rust](https://rustup.rs). On Windows also the
   [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
   (WebView2 and the C++ build tools); on Linux the WebKitGTK packages listed there.
2. **Get a free AI key** as in step 4 above (Groq, and optionally Mistral).
3. **Run Nosprhite** from this folder:
   ```
   npm install
   npm run app            # opens the app
   npm run app:build      # or build an installer into src-tauri/target/release/bundle
   ```
4. In **Settings**, paste your free AI key(s) under **Free AI**. Then add a GitHub fine-grained token for `Ignosha/noshashi` with
   *Contents: read* and *Issues: read and write*, plus the account permissions
   *Models: read* and *Gists: read and write*. That lets the village read the repo,
   file issues you approve, publish products you sell, and use GitHub Models' free
   tier as one more backup.
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
| Groq (gpt-oss-120b) | ~1,000 requests a day | [console.groq.com/keys](https://console.groq.com/keys) |
| Mistral (its largest free model) | set per account; see its Limits page | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| GitHub Models | ~50 to 150 a day | your GitHub token |
| OpenRouter free models | ~50 requests a day | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| Google Gemini (optional) | ~1,500 a day, where available | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Ollama (optional) | your computer | none; only if it happens to be running |

The app asks each provider which models it has and picks its best free one,
so it keeps working when providers rename models. You can name a model in
Settings instead. Free limits change; the village stops a little short of them.

What to expect, honestly: gpt-oss-120b, Mistral Large and Gemini Flash are far more capable
than a small model on your computer, and handle one focused job well. They are
still not Claude, and long, many-step work is not what the village asks of
them. Some ideas will be weak; Owl's reviews and the Dismiss button are there
for that. On their free tiers, Mistral and Google may use what is sent to improve their models.
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
- reach any host except the free AI providers above (Groq, Mistral, GitHub Models,
  OpenRouter, Gemini, Ollama on your computer), GitHub, Stripe and noshashi.app (`src-tauri/capabilities/default.json`);
- read secret-shaped files from the repository.

`tests/structure.test.ts` fails if the agent loop ever gains a path to a
GitHub or Stripe write.

## Checks

```
npm test         # 46 tests: the guard, the fences, the village
npm run build    # type check and build the window
```
