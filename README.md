# Cumometer

A SillyTavern extension that measures, with a straight face, how many litres a character spills over a whole roleplay.

Расширение для SillyTavern, которое с каменным лицом считает, сколько литров чар сливает за всю ролку.

## How it works / Как работает

1. **Regex trigger.** Every AI message is scanned with RU/EN patterns (`src/detect.js`). No match means no request.
2. **OOC model.** On a match, a separate small model receives the character card, the last few messages and the running total. It decides whether it actually happened and estimates the volume. It also writes a dry one-line OOC remark.
   - Human baseline is 2–6 ml.
   - The model adapts to the lore. In **omegaverse** (detected from the card and the scene), alphas in rut and knotting produce absurd volumes.
   - The **Absurdity** slider (0–10) controls how far it may exaggerate.
3. **Offline fallback.** With no model configured, or if the call fails, a heuristic estimate is used.
4. Results are stored per chat in chat metadata, keyed by message text. Swipes, edits and deletions are handled automatically.

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

On first run the extension generates a random local key (UUID). Nothing is sent until you press **Submit**. Each submission sends only your nickname, your total, and your top character with its volume. The server stores just a SHA-256 hash of the key.

Deploy the server (`leaderboard/`) to Vercel:

1. Import the repo into Vercel and set **Root Directory** = `leaderboard`.
2. Storage → Marketplace → **Upstash Redis** → connect to the project (it adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Redeploy, then paste the project URL into Settings → Cumometer → Leaderboard → Server URL.

API:
- `POST /api/submit` `{ userKey, nickname, ml, topChar, topCharMl }` → `{ rank }` (one request per 30 s per key)
- `GET /api/top?limit=50&me=<userKey>` → `{ rows, me }`
- `/` is the public leaderboard page.
