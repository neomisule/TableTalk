# Restaurant Voice Agent

A voice agent backend for restaurant phone reservations. It answers calls, books tables, answers menu/hours questions, and hands off to a human when needed — built to respond in under 2 seconds.

Runs fully in **mock mode**, no API keys needed, so you can try it out right away.

## Stack

- **Cloudflare Workers** — serverless, always-on hosting (no local machine or GPU needed)
- **Groq** — fast, cheap LLM inference
- **ElevenLabs Voice API** — speech-to-text and text-to-speech, billed per character (cheaper than a full managed voice pipeline)
- **Twilio** — not wired up yet; everything can be tested without it via a JSON endpoint

## How a call works

```
Caller → speech-to-text → intent routing → the right agent
(reservation / menu-hours / human handoff) → response check → text-to-speech
```

Five small agents each handle one job: figuring out what the caller wants, catching bad audio, running the reservation steps, answering questions from a knowledge base, and double-checking the final response before it's spoken.

Reservations follow a fixed step-by-step flow (party size → date → time → name → phone → confirm), so nothing gets skipped.

## Quick start

```bash
npm install
npm run dev          # starts the Worker at http://localhost:8787
npm run eval         # runs a sample conversation
```

Test a call manually:

```bash
curl -X POST http://localhost:8787/voice/event \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-123","transcript":"Table for 4 this Friday at 7pm","confidence":0.95,"timestamp":1700000000000}'
```

## Going to production

- **Real phone calls** → connect Twilio (see `src/telephony/TwilioPlaceholder.ts`)
- **Real voice** → add your `ELEVENLABS_API_KEY` in `wrangler.toml`
- **Persistent state** → swap the in-memory store for Cloudflare Durable Objects (see `src/state/SessionStore.ts`)

Full architecture, design rationale, and configuration details live in the codebase comments and the extended docs.
