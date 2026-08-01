# TechVista — Restaurant Voice Agent

A production-ready voice agent backend for restaurant phone reservations. Built on **Cloudflare Workers** with **Groq LLM inference** and **ElevenLabs voice**, it handles incoming calls, guides callers through reservations, answers menu and hours questions, and routes human escalations — all with a target response time under 2 seconds.

The system runs fully in **mock mode** with no API keys required, making it easy to develop, test, and evaluate locally.

---

## Call Flow

```
Customer calls restaurant phone number
        │
        ▼
  [Phone Provider]  ← Twilio placeholder (not yet implemented)
  Captures audio, sends webhook to Worker
        │
        ▼
  [ElevenLabs STT]  ← Converts audio to text
  Returns transcript + confidence score
        │
        ▼
  [Cloudflare Worker]  ← src/index.ts
  POST /voice/event receives the VoiceEvent
        │
        ▼
  [TurnManagerAgent]  ← src/agents/TurnManagerAgent.ts
  Checks: low confidence? noisy audio? interruption?
  If bad audio → return clarification request immediately
        │
        ▼
  [RouterAgent]  ← src/agents/RouterAgent.ts
  Keyword matching (fast) → classify intent
  If ambiguous → LLM fallback classification
        │
        ├── reservation → [ReservationAgent]
        │                 Multi-step workflow: party size → date → time
        │                 → name → phone → confirm → done
        │
        ├── menu / hours_location → [KnowledgeAgent]
        │                           Answers from hardcoded knowledge base
        │
        └── human_handoff → Return transfer message immediately
        │
        ▼
  [ValidationAgent]  ← src/agents/ValidationAgent.ts
  Check: empty response? placeholder text? premature confirmation?
  Sanitize and return
        │
        ▼
  [ElevenLabs TTS]  ← Converts agent response text to speech audio
        │
        ▼
  Final AgentResponse returned (message + latency breakdown)
```

---

## Why ElevenLabs Voice API (not ElevenLabs Conversational AI)

ElevenLabs offers two products:
- **Conversational AI** — a fully managed voice pipeline. Charges **per minute** of call time (~$0.10/min). A 10-minute reservation call = $1.00.
- **Voice API** (what we use) — STT + TTS as individual API calls. Charges **per character** of text synthesized. Our agent responses average ~150 characters. At ~$0.0003/char, that's ~$0.05 per full reservation call — **3–5× cheaper**.

The trade-off: Conversational AI handles duplex audio and interruption detection automatically. Using the Voice API means we manage turn-taking ourselves (via `TurnManagerAgent`) and handle STT separately. More code, full control, lower cost.

---

## Why Groq (not Ollama, not OpenAI)

| | Groq | Ollama | OpenAI |
|---|---|---|---|
| Speed | ~500 tokens/sec | ~30-80 tokens/sec | ~50-100 tokens/sec |
| Requires GPU | No (cloud LPU) | Yes (local hardware) | No (cloud) |
| Free tier | Yes | Yes (but runs locally) | No |
| Works in Cloudflare Workers | Yes | No | Yes |
| Cost at scale | Low | Infrastructure cost | Higher |

**Ollama** runs models locally — it requires a persistent machine with a GPU. Cloudflare Workers are serverless (no persistent machine). You can't run Ollama in a Worker. **Groq** is a cloud inference API with custom LPU hardware that's dramatically faster than GPU inference, has a free tier, and works anywhere with an HTTP client.

**OpenAI** works but costs more. For restaurant reservation use cases, Groq's Qwen or Llama models perform comparably at a fraction of the price.

---

## Why Cloudflare Workers (not Cloudflare Tunnel)

**Cloudflare Tunnel** creates a public URL for a service running on your local machine. It requires:
- Your machine to be on 24/7
- Cloudflare Tunnel daemon running
- A stable home/office internet connection

**Cloudflare Workers** is a serverless edge compute platform:
- Runs in Cloudflare's global network (300+ cities)
- No local machine required
- Always-on, instant scale
- ~$0.50/million requests on the free plan
- Permanent public URL (`https://techvista.<account>.workers.dev`)

For a restaurant phone agent that must be available 24/7, Workers is the right choice. Tunnel is a development shortcut, not a production solution.

---

## Why Twilio is Not Implemented Yet

You can test **everything** — routing, reservation workflow, knowledge answers, evaluation — without Twilio. The `POST /voice/event` endpoint accepts the same JSON payload that a phone provider would send, so you can simulate calls from:
- `examples/sampleCall.ts` (Node.js script)
- `curl` or Postman
- The built-in evaluation suite (`POST /evaluate`)

Twilio adds the layer of real phone calls. When you're ready, see `src/telephony/TwilioPlaceholder.ts` for exact integration steps.

---

## Multi-Agent System

The system uses five specialized agents, each with a single responsibility:

**RouterAgent** (`src/agents/RouterAgent.ts`) — Classifies what the caller wants. First tries keyword matching (instant, ~0ms) against lists of reservation, menu, hours, and handoff keywords. If confidence is below the threshold (0.75), falls back to LLM classification. Returns intent + confidence + method used.

**TurnManagerAgent** (`src/agents/TurnManagerAgent.ts`) — Handles audio quality issues before any other agent runs. If transcription confidence is below threshold, it returns a clarification request immediately without spending LLM tokens. Also handles interruptions (caller spoke over agent) and multiple-speaker scenarios.

**ReservationAgent** (`src/agents/ReservationAgent.ts`) — Manages the structured reservation workflow. Uses `ReservationWorkflow` (code, not LLM) to determine what field to ask for next. Extracts field values with regex. Calls LLM only to phrase the next question naturally.

**KnowledgeAgent** (`src/agents/KnowledgeAgent.ts`) — Answers questions about menu, hours, location, and policies using a hardcoded knowledge base. Builds a focused prompt with only the relevant knowledge (not the whole KB), keeping responses to 1-2 sentences.

**ValidationAgent** (`src/agents/ValidationAgent.ts`) — Sanity-checks every response before it's spoken. Catches empty responses, unfilled template placeholders, premature confirmations, and overly long answers. Sanitizes rather than crashing.

The orchestrator in `src/agents/index.ts` coordinates all five agents in the correct order for each turn.

---

## State Tracking

Each call has a `SessionState` object stored in `src/state/SessionStore.ts`. It persists across all turns of the call:

- `transcriptHistory` — every message, timestamped, for debugging
- `reservation` — incrementally filled as the caller provides details
- `workflowStep` — current step in the reservation workflow
- `currentIntent` — last classified intent
- Confidence signals — `transcriptionConfidence`, `intentConfidence`, `noisyInput`, etc.

The store is currently **in-memory** (a JavaScript `Map`). For production, replace it with Cloudflare Durable Objects. See the large comment block in `src/state/SessionStore.ts` for migration options.

---

## Structured Workflow

The reservation workflow is a state machine, not an LLM decision:

```
ask_party_size → ask_date → ask_time → ask_name → ask_phone → confirm_details → completed
```

At each step, `ReservationWorkflow.getNextStep()` checks which field is missing and returns the appropriate step. `extractField()` uses regex patterns to parse the caller's response — no LLM needed for extraction. The LLM is called only to phrase the question naturally.

This design is **reliable** (deterministic — never skips a step) and **fast** (no extra LLM call for workflow decisions).

---

## Multilingual Support

The system supports 5 languages: English (`en`), Spanish (`es`), Tamil (`ta`), Telugu (`te`), Hindi (`hi`).

Language detection is currently a heuristic placeholder in `src/utils/language.ts` — it detects script characters (Devanagari for Hindi, Tamil script, Telugu script) and a few Spanish keywords. For production, replace with the `franc-min` library or use the language code returned by ElevenLabs STT.

The `SessionState` stores the resolved language per call. Agents currently respond in English regardless of detected language. To add full multilingual responses, add translated prompt templates to each agent.

---

## Noise and Unclear Speech Handling

The `TurnManagerAgent` handles poor audio **before** wasting LLM tokens:

1. **Low confidence** (below `LOW_CONFIDENCE_THRESHOLD=0.75`): immediately return "I didn't catch that, could you repeat?" The partial transcript is reflected back: "Did you say 'seven people'?"

2. **Noisy audio** (phone provider sets `noisyAudio: true`) with borderline confidence: return "I'm hearing some background noise, could you please repeat that?"

3. **Multiple speakers**: continue processing but log it. Common in restaurants where a party is discussing among themselves.

4. **Short transcripts** (fewer than 2 words) with low confidence: assume the caller didn't finish speaking and ask them to continue.

---

## Latency Measurement

Every request measures time at each stage separately:

| Stage | Typical range | Notes |
|---|---|---|
| Routing | 0–5ms | Keyword matching; LLM fallback adds 200–400ms |
| LLM inference | 150–600ms | Groq's LPU is very fast vs GPU |
| TTS synthesis | 200–500ms | ElevenLabs Turbo model |
| Validation | < 5ms | Pure code, no API calls |
| **Total** | **300–900ms** | Mock mode: ~350ms |

The `LATENCY_TARGET_MS=2000` config sets the acceptable limit. The evaluation suite scores latency on a linear scale: full score at or under 2000ms, zero score at 4000ms.

The "300–500ms target" mentioned in the architecture refers to **LLM response time only** (time-to-first-token). End-to-end (including TTS) is typically 500–1200ms in production.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start the local dev server (Wrangler)
npm run dev
# → Worker available at http://localhost:8787

# In a second terminal, run a sample conversation
npm run eval

# Check health
curl http://localhost:8787/health

# Send a test voice event
curl -X POST http://localhost:8787/voice/event \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "transcript": "I would like to book a table for 4 people this Friday at 7pm",
    "confidence": 0.95,
    "timestamp": 1700000000000
  }'

# Run TypeScript type checking
npm run typecheck
```

---

## Running Evaluations

```bash
# Via HTTP (while dev server is running)
curl -X POST http://localhost:8787/evaluate | python -m json.tool

# Via Jest unit tests (no server needed)
npm test
```

The evaluation suite runs 10 test cases covering: happy path reservation, party size changes, menu questions, hours queries, low confidence audio, noisy audio, human handoff, multiple speakers, Spanish language, and interruptions.

---

## Adding Twilio (When Ready)

File to edit: `src/telephony/TwilioPlaceholder.ts`

The file contains step-by-step instructions at the top. Short version:
1. `npm install twilio`
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` to `wrangler.toml`
3. Implement `TwilioProvider` class with real webhook parsing and TwiML responses
4. Add `POST /twilio/voice` and `POST /twilio/gather` routes in `src/index.ts`
5. Point Twilio webhook to your Worker URL

---

## Adding Real ElevenLabs Voice (When Ready)

Files:
- **STT**: `src/voice/ElevenLabsSTT.ts` — already implemented, just needs `ELEVENLABS_API_KEY`
- **TTS**: `src/voice/ElevenLabsTTS.ts` — already implemented, just needs `ELEVENLABS_API_KEY`

To activate:
```toml
# In wrangler.toml
[vars]
ELEVENLABS_API_KEY = "your_key_here"
ELEVENLABS_VOICE_ID = "Rachel"  # or your custom voice ID
MOCK_MODE = "false"
```

---

## Adding Persistent Storage (When Ready)

File to edit: `src/state/SessionStore.ts`

The file contains a large comment block explaining the options. The recommended path for Cloudflare Workers is **Durable Objects**:

1. Define a Durable Object class that stores session state
2. Bind it in `wrangler.toml` under `[[durable_objects.bindings]]`
3. Replace `SessionStore` methods to use `DurableObjectStub.storage.get/put`
4. Update `src/state/index.ts` to export the Durable Object namespace

The `SessionStore` interface (get/create/update/delete/list) stays the same — only the implementation changes.
#   T a b l e T a l k  
 