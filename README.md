# Cumometer

A SillyTavern extension that measures, with a straight face, how many litres a character spills over a whole roleplay.

Расширение для SillyTavern, которое с каменным лицом считает, сколько литров чар сливает за всю ролку.

## How it works / Как работает

1. **Regex trigger.** Every AI message is scanned with RU/EN patterns (`src/detect.js`). No match means no request.
2. **OOC model.** On a match, a separate small model receives the character card, the last few messages and the running total. It decides whether it actually happened and estimates the volume. It also writes a dry one-line OOC remark.
   - Human baseline is 2–6 ml.
   - The model adapts to the lore. In **omegaverse** (detected from the card and the scene), alphas in rut and knotting produce absurd volumes.
   - The prompt is tuned slightly absurd: exaggeration is allowed only when the text hints at excess.
3. **Offline fallback.** With no model configured, or if the call fails, a heuristic estimate is used.
4. Results are stored per chat in chat metadata, keyed by message text. Swipes, edits and deletions are handled automatically.

## Regex triggers / Регексы

Triggers are designed and verified with [ACE-SKILL](https://github.com/evrytests-maker/ace-skill) (`key-regex-test` workflow):
JavaScript semantics, Unicode letter boundaries on both sides (JS `\b` does not work for Cyrillic), and for every pattern
explicit positive, negative and near-miss cases in `tests/trigger-contracts.json` (`cum laude`, `закончил`, `кончик`,
`Семенов`, `tied the knot`, `железнодорожный узел` …).

```bash
npm test                                        # node:test, no dependencies
node tests/ace-check.mjs /path/to/ace-skill     # cross-check with the ACE CLI (run `npm ci` there first)
```

### End-to-end in real SillyTavern

`tests/e2e/` drives a real SillyTavern build with Playwright (39 checks: install, settings UI, regex → OOC call,
omegaverse context, swipes/deletes, reload persistence, offline fallback, sealed leaderboard submit, Liquid Glass on/off, jar overflow).

```bash
node tests/e2e/mockllm.mjs /tmp/llm.log &                 # OpenAI-compatible mock (RP + OOC), :5100
node tests/e2e/fakeboard.mjs "$PWD/leaderboard" &          # real Vercel handlers + in-memory Upstash, :5200
# SillyTavern on :8000 with this repo copied to data/default-user/extensions/Cumometer,
# Chat Completion source = Custom, URL http://127.0.0.1:5100/v1
node tests/e2e/e2e.mjs /tmp                                 # expects /tmp/llm.log
```

## Install / Установка

Extensions → Install extension → `https://github.com/evrytests-maker/Omega-pizdec-big-dick`

## OOC model / OOC-модель

Settings → Cumometer → OOC model:

| API format | Endpoint example | Model example |
|---|---|---|
| OpenAI-compatible | `https://openrouter.ai/api/v1` | `google/gemini-2.5-flash-lite` |
| OpenAI-compatible | `https://api.openai.com/v1` | any small chat model |
| OpenAI-compatible | `https://api.groq.com/openai/v1` | any Groq model |
| OpenAI-compatible | `http://127.0.0.1:11434/v1` (Ollama), `http://127.0.0.1:1234/v1` (LM Studio) | local model |
| Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-5-5` |

The endpoint is free-form, so proxies and gateways work. The request is sent from the browser, so the endpoint must allow CORS; OpenRouter, OpenAI, Anthropic and local servers do.

The API key is kept in the browser's `localStorage`, **not** in SillyTavern settings, so other extensions can't read it from there.

## Leaderboard / Лидерборд

Nothing is sent until you press **Submit**. A submission carries exactly two things you chose: your **jar volume** and your
**nickname** — plus a timestamp (anti-replay) and a one-way fingerprint of your local key (SHA-256), which keeps the
nickname yours. The key itself never leaves the browser; the server stores only a hash of the fingerprint.

The payload is **sealed** to the leaderboard's public key: ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM (WebCrypto).
On the wire there is only `{ v, epk, iv, ct }`; only the server holding `BOARD_PRIVATE_KEY` can read it. Tampered
ciphertext is rejected, a captured envelope can't be replayed over a newer result, and a nickname belongs to whoever
claimed it first.

Deploy the site + API (`leaderboard/`) to Vercel:

1. In Vercel: **Add New → Project → Import** this repo. **Root Directory** = `leaderboard`, framework preset **Other**,
   no build command.
2. **Storage → Marketplace → Upstash Redis → Create → Connect to project** (adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Generate the key pair: `node leaderboard/scripts/genkey.mjs` and add the printed line as the environment variable
   **`BOARD_PRIVATE_KEY`** (Settings → Environment Variables). Keep it secret; rotating it just changes the public key
   the extension fetches.
4. **Redeploy**, then paste the project URL into SillyTavern → Cumometer → Leaderboard → Server URL.

API:
- `GET /api/key` → `{ v: 1, key: <public JWK> }`
- `POST /api/submit` `{ v, epk, iv, ct }` → `{ rank }` (one request per 30 s; `409 nick_taken` if the nickname is someone else's)
- `GET /api/top?limit=50&me=<fingerprint>` → `{ rows: [{ rank, nick, ml }], me, stats: { players, totalMl } }`
- `/` — the public leaderboard page (plain static files, RU/EN, light/dark).

Preview locally without Vercel: `node tests/e2e/fakeboard.mjs "$PWD/leaderboard"` → http://127.0.0.1:5200
(real handlers, in-memory Redis, auto-generated key).

## Appearance

**The jar.** The card shows the volume as a glass jar of milky liquid with a moving surface. Jar size is a setting
(0.5 / 1 / **3** / 10 L; default is the classic three-litre jar). When a measurement goes past the brim the jar overflows,
slowly and viscously: a lumpy dome bulges over the rim, drips crawl down the glass and swell into beads, a strand sags
under the jar and splats into a lumpy puddle. The full jar moves to the shelf, a fresh jar fills with the remainder, and
sticky streaks linger on the glass for a few seconds. The pill carries a mini jar with the current level.

**Liquid Glass** (on by default): refraction of the backdrop through an SVG displacement filter (Chromium), specular rim
and a highlight that follows the pointer. Safari/Firefox fall back to frosted glass. Turn it off for the classic frosted look.
