<h1 align="center">Doctor Hunt AI Backend</h1>

<p align="center">
  The Node.js/Express backend that powers <a href="https://github.com/DevExplorerr/Doctor-Hunt">Doctor Hunt</a>'s<br>
  AI-assisted features: preliminary symptom triage and medical document analysis.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express" alt="Express 5">
  <img src="https://img.shields.io/badge/Hosted_on-Render-46E3B7" alt="Render">
  <img src="https://img.shields.io/badge/AI-Qwen_(Alibaba_Model_Studio)-6C4AB6" alt="Qwen AI">
</p>

---

## Overview

This backend is the AI gateway for the [Doctor Hunt](https://github.com/DevExplorerr/Doctor-Hunt) Flutter application. It exposes a small JSON REST API with two AI-powered services:

- **Symptom triage chat** — a multi-turn, session-based conversation that helps a patient describe their symptoms in **English or Urdu**, asks structured follow-up questions, screens for emergency symptoms, and finishes by recommending one of 10 medical specialties. It performs **preliminary triage only — it is not a diagnostic system.**
- **Medical document decoding** — analyzes an image of a prescription, lab report, or other medical document and returns a structured, plain-language breakdown (medications, lab findings, warnings, confidence, disclaimer). It is an **explanation tool, not a doctor.**

It exists as a separate service so that:

- **AI credentials never ship inside the mobile app** — the provider API key lives only in this backend's environment.
- **Prompting, validation, and rate limiting are centralized** — the app always receives strictly structured, validated JSON regardless of what the AI model returns.

The Flutter app communicates with it over plain HTTPS JSON requests (no SDK, no auth headers). The production base URL is compiled into the app and can be overridden at build time (see [Connecting the Flutter App](#connecting-the-flutter-app)).

## Features

- AI-assisted symptom triage conversation (multi-turn, session-scoped)
- English and Urdu conversation modes
- Conversation reset endpoint
- AI medical document analysis (prescriptions, lab reports, general medical documents)
- Strict AI response validation and normalization with safe fallbacks (both services)
- Request validation with field-level error messages
- Per-key rate limiting (10 requests/minute)
- Centralized error handling with sanitized client responses
- CORS enabled
- `/health` liveness endpoint (does not touch the AI provider)
- Render-ready: binds `0.0.0.0`, respects the injected `PORT`

## Architecture

```text
Doctor Hunt Flutter App
          │
          │  HTTPS · JSON
          ▼
Doctor Hunt AI Backend (Express)
          │
          ├── POST /api/triage/chat ──► Triage Service ──► Conversation Store (in-memory)
          │                                   │
          ├── POST /api/triage/reset          │
          │                                   ▼
          └── POST /api/decoder/analyze ─► Decoder Service
                                              │
                                              ▼
                                    Qwen Service (src/services/qwen.js)
                                              │
                                              │  Bearer-auth HTTPS
                                              ▼
                              Alibaba Cloud Model Studio
                              (Qwen text + vision models)
```

## API

**Production base URL:** `https://doctor-hunt-ai.onrender.com`

| Method | Endpoint               | Purpose                                             |
| ------ | ---------------------- | --------------------------------------------------- |
| `GET`  | `/health`              | Liveness probe — confirms the service process is up |
| `GET`  | `/`                    | Informational root — confirms the API is running    |
| `POST` | `/api/triage/chat`     | Send one message in a symptom-triage conversation   |
| `POST` | `/api/triage/reset`    | Delete a triage session and its history             |
| `POST` | `/api/decoder/analyze` | Analyze a medical document image                    |

All `POST` endpoints expect `Content-Type: application/json`. Successful responses use the envelope `{ "success": true, ... }`; errors use `{ "success": false, "error": "<CODE>", "message": "..." }`.

---

### `GET /health`

Liveness probe intended for platform health checks (Render). It never calls the AI provider, so a third-party outage cannot make the service appear unhealthy.

```json
{ "success": true, "status": "ok" }
```

| Status | Meaning            |
| ------ | ------------------ |
| `200`  | Service is running |

### `GET /`

Informational root endpoint.

```json
{ "success": true, "message": "Doctor Hunt AI backend is running." }
```

| Status | Meaning            |
| ------ | ------------------ |
| `200`  | Service is running |

---

### `POST /api/triage/chat`

Sends one user message and returns the AI's triage response for the current turn. Sessions are created automatically on the first message.

**Request body**

| Field       | Type   | Required | Rules                                                        |
| ----------- | ------ | -------- | ------------------------------------------------------------ |
| `sessionId` | string | Yes      | Client-generated session identifier (the app uses a UUID v4) |
| `message`   | string | Yes      | 1–2000 characters                                            |
| `language`  | string | No       | `"en"` (default) or `"ur"`                                   |

```json
{
  "sessionId": "b3f1c2d4-0000-4000-8000-0123456789ab",
  "message": "I have a sharp pain in my lower back since yesterday",
  "language": "en"
}
```

**Success response (`200`)**

```json
{
  "success": true,
  "data": {
    "sessionId": "b3f1c2d4-0000-4000-8000-0123456789ab",
    "language": "en",
    "stage": "collecting",
    "aiMessage": "You mentioned a sharp pain in your lower back…",
    "urgency": "normal",
    "specialty": null,
    "followUpQuestions": [
      {
        "id": "pain_location",
        "question": "Where exactly is the pain?",
        "answerType": "single_choice",
        "options": ["Upper back", "Middle back", "Lower back", "Not sure"]
      }
    ],
    "triage": null,
    "homeCare": null
  }
}
```

Key fields:

- `stage` — `"collecting"` or `"complete"`
- `urgency` — `"normal"`, `"elevated"`, `"urgent"`, or `"emergency"`
- `specialty` — `null` while collecting; one of the 10 taxonomy specialties when complete
- `followUpQuestions` — up to 2 structured questions (`single_choice` with 2–5 options, or `free_text`); always `[]` when complete
- `triage` — `{ "symptomSummary": [...], "redFlags": [...] }` when complete, otherwise `null`
- `homeCare` — general home-care guidance string when complete, otherwise `null`

**Errors**

| Status | Code               | When                                                                                                                                                       |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `INVALID_REQUEST`  | Missing/invalid `sessionId`, missing/empty/over-length `message`, or `language` not `"en"`/`"ur"` — returns `messages: [...]` with each validation failure |
| `429`  | `RATE_LIMITED`     | More than 10 requests/minute for this `sessionId`                                                                                                          |
| `502`  | `AI_SERVICE_ERROR` | The AI provider returned an empty response                                                                                                                 |
| `500`  | `INTERNAL_ERROR`   | Unexpected server error (sanitized message)                                                                                                                |

---

### `POST /api/triage/reset`

Deletes a triage session and its conversation history.

**Request body**

| Field       | Type   | Required |
| ----------- | ------ | -------- |
| `sessionId` | string | Yes      |

**Success response (`200`)**

```json
{ "success": true, "message": "Session reset successfully." }
```

**Errors**

| Status | Code                | When                                                               |
| ------ | ------------------- | ------------------------------------------------------------------ |
| `400`  | `INVALID_REQUEST`   | `sessionId` missing or not a string                                |
| `404`  | `SESSION_NOT_FOUND` | No active session for this ID (unknown, already reset, or expired) |

> This endpoint is not rate-limited. Resetting simply deletes in-memory state.

---

### `POST /api/decoder/analyze`

Analyzes a medical document image and returns a structured, plain-language breakdown. Rate-limited **per IP** (requests carry no session ID).

**Request body**

| Field      | Type   | Required | Rules                                                   |
| ---------- | ------ | -------- | ------------------------------------------------------- |
| `imageUrl` | string | Yes      | A valid, publicly reachable `http://` or `https://` URL |

```json
{
  "imageUrl": "https://res.cloudinary.com/example/image/upload/v123/prescription.jpg"
}
```

The backend only validates the URL format — it does not host or upload files. In the Doctor Hunt app, the client uploads the document to Cloudinary and passes the resulting URL.

**Success response (`200`)**

```json
{
  "success": true,
  "data": {
    "documentType": "prescription",
    "summary": "The document is a prescription listing two medications…",
    "medications": [
      {
        "name": "Amoxicillin",
        "purpose": "An antibiotic used to treat bacterial infections",
        "dosage": "500 mg",
        "frequency": "Three times a day",
        "duration": "7 days",
        "instructions": "Take with food"
      }
    ],
    "labFindings": [],
    "keyFindings": ["Two medications were identified on the prescription."],
    "warnings": [
      "Consult your doctor or pharmacist for proper interpretation."
    ],
    "disclaimer": "This analysis is for informational purposes only…",
    "confidence": "high",
    "readabilityNotes": ""
  }
}
```

Normalized fields:

- `documentType` — `"prescription"`, `"lab_report"`, or `"medical_document"`
- `medications` — entries with `name`, `purpose`, `dosage`, `frequency`, `duration`, `instructions` (unreadable fields are empty strings)
- `labFindings` — entries with `testName`, `value`, `unit`, `referenceRange`, `interpretation`, `isOutOfRange`
- `confidence` — `"high"`, `"medium"`, or `"low"`
- `readabilityNotes` — image-quality / legibility notes

**Errors**

| Status | Code              | When                                                                                                   |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `400`  | `INVALID_REQUEST` | `imageUrl` missing, not a string, empty, or not a valid HTTP(S) URL                                    |
| `429`  | `RATE_LIMITED`    | More than 10 requests/minute from this IP                                                              |
| `502`  | `ANALYSIS_FAILED` | The AI provider errored or returned an empty/malformed response (generic message, no upstream details) |
| `500`  | `INTERNAL_ERROR`  | Unexpected server error (sanitized message)                                                            |

## AI Integration

- **Provider** — Alibaba Cloud **Model Studio**, called through its OpenAI-compatible chat-completions endpoint (`ALIBABA_ENDPOINT`) with bearer-token authentication (`ALIBABA_API_KEY`). No AI SDK is used — requests are plain HTTPS `POST` calls via Node's built-in `fetch`.
- **Models** — configurable via environment variables, with code-level defaults:
  - `ALIBABA_MODEL` → `qwen-plus` (default) for symptom triage
  - `ALIBABA_VISION_MODEL` → `qwen-vl-plus` (default) for document analysis
- **Request construction**
  - _Triage:_ the system prompt (built per language, en/ur) plus the stored conversation history. Temperature `0.3`, and structured-output mode (`response_format: json_object`) when `ALIBABA_JSON_MODE` is enabled (default).
  - _Decoder:_ the decoder system prompt plus one user message containing the image URL and an instruction to analyze it. Temperature `0.3`, always structured-output mode.
- **Response processing** — the raw model content is stripped of any markdown code fences, parsed as JSON, then run through a strict validator/normalizer that repairs or drops invalid items (e.g., at most 2 follow-up questions, specialties restricted to the 10-value taxonomy, `single_choice` questions downgraded to `free_text` if they have fewer than 2 usable options). If parsing fails, a safe fallback response is returned instead of an error.
- **Error handling** — there is **no automatic retry**. Upstream HTTP errors are thrown; the decoder route maps them to a generic `502`; an empty triage response maps to `502 AI_SERVICE_ERROR`; anything unexpected reaches the centralized error handler as a sanitized `500`. Upstream error bodies never reach the client.
- **Limitations**
  - Sessions and rate-limit counters are **in-memory** — they reset on every restart/redeploy.
  - Conversation history is capped at 20 messages (system prompts preserved).
  - Triage conversations are capped at 8 turns, after which completion is forced.
  - Structured JSON output mode requires a model that supports it (the defaults do).

## Medical Document Analysis

```text
Flutter App
    ↓  (document uploaded to Cloudinary by the app)
POST /api/decoder/analyze { imageUrl }
    ↓
Route validation            (imageUrl must be a valid HTTP(S) URL)
    ↓
Decoder Service             (system prompt + image URL + instruction)
    ↓
Qwen vision model           (ALIBABA_VISION_MODEL, default qwen-vl-plus)
    ↓
Response validation         (fences stripped, JSON parsed, fields normalized)
    ↓
JSON response               (documentType, summary, medications, labFindings,
    ↓                        keyFindings, warnings, disclaimer, confidence)
Flutter App                 (renders the result; copy / PDF export happen client-side)
```

The analysis classifies the document as a `prescription`, `lab_report`, or `medical_document`. The prompt enforces conservative OCR behavior: unreadable names/dosages are left empty and flagged in `readabilityNotes` rather than guessed, reference ranges are never invented, and a medical disclaimer is always included. See the API section above for the exact response shape.

## Triage / Symptom Checker

This is an **AI-assisted preliminary triage** service — it helps users identify the appropriate _type of doctor_; it does not diagnose diseases, prescribe medication, or name specific doctors (these constraints are enforced in the system prompt).

- **Starting a conversation** — the client generates a `sessionId` (UUID) and sends its first message to `/api/triage/chat`. The backend creates the session, stores the language-appropriate system prompt, and returns the first AI turn.
- **Continuing** — each subsequent call sends the next user message with the same `sessionId`. The full stored history is replayed to the model on every turn.
- **Conversation state** — held in memory per session: message history (capped at 20 messages), turn count, and language. **Sessions expire after 30 minutes of inactivity** and are then treated as unknown (`404` on reset, recreated on next chat).
- **Completion** — when the AI has enough information it sets `stage: "complete"` with a specialty recommendation, a symptom summary, red flags, and home-care guidance. If 8 turns are reached without completion, the backend forces completion and falls back to `"General Physician"` when information is insufficient.
- **Emergency behavior** — potentially life-threatening symptoms set `urgency: "emergency"` and the AI message advises seeking immediate emergency care; emergency detection always takes priority over specialty routing.
- **Specialty taxonomy** — recommendations are restricted to exactly 10 specialties (the same list the app's doctor database uses): Dermatologist, Dentist, General Physician, Surgeon, Orthopedic, Psychologist, Gynecologist, Neurologist, Pediatrician, Cardiologist. `"General Physician"` is the safe default.
- **Languages** — `"en"` or `"ur"`. In Urdu mode the user-facing text (`aiMessage`, questions, `homeCare`) is written in Urdu while JSON keys and specialty names remain in English.
- **Reset** — `POST /api/triage/reset` deletes the session; a later chat with the same ID starts fresh.
- **Validation & errors** — requests are validated before any AI call (`400` with field-level messages); AI output is validated/normalized (or replaced with a safe fallback); provider failures surface as `502`/`500` with sanitized messages.

## Technology Stack

| Layer       | Technology            | Notes                                                                      |
| ----------- | --------------------- | -------------------------------------------------------------------------- |
| Runtime     | Node.js 18+           | Uses the built-in global `fetch`; CommonJS modules                         |
| Framework   | Express ^5.2.1        | Routing, JSON body parsing                                                 |
| AI client   | None (native `fetch`) | Plain HTTPS calls to the OpenAI-compatible endpoint — no AI SDK dependency |
| Config      | dotenv ^17.4.2        | `.env`-based configuration                                                 |
| Middleware  | cors ^2.8.6           | CORS enabled (allow-all)                                                   |
| Dev tooling | nodemon ^3.1.14       | Auto-restart for local development                                         |

These are the only dependencies declared in `package.json` (plus the express-internal transitive packages in `package-lock.json`). There is no database, ORM, or AI SDK.

## Project Structure

```text
doctor_hunt_ai/
├── src/
│   ├── config/index.js        # Environment-driven settings (models, limits, temperature)
│   ├── middleware/
│   │   ├── errorHandler.js    # Centralized, sanitized error responses
│   │   └── rateLimiter.js     # In-memory per-key rate limiting (10 req/min)
│   ├── prompts/
│   │   ├── systemPrompt.js    # Triage system prompt builder (en/ur)
│   │   ├── decoderPrompt.js   # Document-decoder system prompt
│   │   └── specialtyTaxonomy.js  # The 10 valid specialties + routing guidance
│   ├── routes/
│   │   ├── triage.js          # POST /api/triage/chat, /api/triage/reset
│   │   └── decoder.js         # POST /api/decoder/analyze
│   ├── services/
│   │   ├── qwen.js            # AI provider HTTP client (shared by both features)
│   │   ├── triageService.js   # Conversation orchestration
│   │   ├── decoderService.js  # Document analysis + response normalization
│   │   └── conversationStore.js # In-memory session store (history, expiry, turns)
│   ├── validators/
│   │   └── responseValidator.js # Request validation + AI response repair/normalization
│   └── server.js              # Express app, /health, /, route mounting, 0.0.0.0 listen
├── .env.example               # Environment variable template (placeholders only)
├── .env                       # Local secrets — gitignored, NEVER commit
├── .gitignore                 # Ignores node_modules/ and .env
└── package.json               # Scripts and dependencies
```

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. Placeholders only — never commit real credentials.

```env
ALIBABA_API_KEY=your_alibaba_api_key
ALIBABA_ENDPOINT=https://your-model-studio-endpoint.example.com/compatible-mode/v1/chat/completions
ALIBABA_MODEL=qwen-plus
ALIBABA_VISION_MODEL=qwen-vl-plus
ALIBABA_JSON_MODE=true
PORT=3000
```

| Variable               | Required | Default        | Purpose                                                     |
| ---------------------- | -------- | -------------- | ----------------------------------------------------------- |
| `ALIBABA_API_KEY`      | Yes      | —              | Bearer token for the Model Studio API (server-side only)    |
| `ALIBABA_ENDPOINT`     | Yes      | —              | OpenAI-compatible chat-completions endpoint URL             |
| `ALIBABA_MODEL`        | No       | `qwen-plus`    | Text model for symptom triage                               |
| `ALIBABA_VISION_MODEL` | No       | `qwen-vl-plus` | Vision model for document analysis                          |
| `ALIBABA_JSON_MODE`    | No       | `true`         | Structured JSON output mode for triage (`false` to disable) |
| `PORT`                 | No       | `3000`         | Listen port (injected by Render in production)              |

> **Never commit `.env` or API credentials.** The `.gitignore` already excludes `.env`.

## Local Development

```bash
git clone https://github.com/DevExplorerr/Doctor-Hunt-AI.git
cd Doctor-Hunt-AI
npm install

# Create your local config from the template
cp .env.example .env   # then fill in real values

npm start              # runs: node src/server.js
```

The server listens on `0.0.0.0` at `PORT` (default `3000`): <http://localhost:3000>

For auto-restart on file changes, use the included dev dependency:

```bash
npx nodemon src/server.js
```

## Connecting the Flutter App

The [Doctor Hunt](https://github.com/DevExplorerr/Doctor-Hunt) app reads the backend base URL at compile time via `String.fromEnvironment`:

- **Default (production):** `https://doctor-hunt-ai.onrender.com` — a plain `flutter run` uses this.
- **Override** with a `--dart-define` flag, e.g. to point at your local backend:

```bash
flutter run --dart-define=DOCTOR_HUNT_AI_BASE_URL=http://<your-LAN-IP>:3000
```

Use your machine's LAN IP (not `localhost`) when running the app on a physical device; the app's Android manifest already permits cleartext HTTP for local development.

## Error Handling

All errors flow through a centralized Express error handler that logs the message server-side and returns a sanitized JSON envelope to the client — no stack traces, no upstream provider errors, no internal details.

| Scenario                                                 | Status | Body                                                                                   |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| Invalid request body (validation failure)                | `400`  | `INVALID_REQUEST` + field-level `messages` (triage chat) or a `message` (other routes) |
| Unknown/expired triage session on reset                  | `404`  | `SESSION_NOT_FOUND`                                                                    |
| Too many requests                                        | `429`  | `RATE_LIMITED`                                                                         |
| AI provider error or empty/malformed AI output (decoder) | `502`  | `ANALYSIS_FAILED` (generic message)                                                    |
| AI provider returned nothing (triage)                    | `502`  | `AI_SERVICE_ERROR`                                                                     |
| Anything unexpected                                      | `500`  | `INTERNAL_ERROR` (generic message)                                                     |

Malformed JSON bodies are rejected by the JSON body parser before reaching the routes. If an AI response cannot be parsed, the triage service substitutes a safe fallback response instead of failing the request.

## Rate Limiting / Security

- **Rate limiting** — in-memory limiter, **10 requests per minute**:
  - `/api/triage/chat` is keyed by `sessionId`
  - `/api/decoder/analyze` is keyed by client IP
  - `/api/triage/reset` is not rate-limited
  - Counters reset on restart/redeploy
- **CORS** — enabled for all origins (the Flutter mobile client does not rely on CORS; there are no cookies or credentials)
- **Request validation** — every route validates its input before any AI call
- **Secrets via environment** — the AI API key is read from `ALIBABA_API_KEY` and never returned in responses
- **Error sanitization** — upstream provider errors are never forwarded to clients
- **HTTPS in production** — the service is served over HTTPS by Render

> **This API is not authenticated.** Endpoints are public and protected only by validation and rate limiting, which is the current intended deployment model for the mobile app.

> Never commit `.env` or API credentials.

## Production Deployment

The backend is hosted on [Render](https://render.com):

| Setting           | Value                                 |
| ----------------- | ------------------------------------- |
| Production URL    | `https://doctor-hunt-ai.onrender.com` |
| Build command     | `npm install`                         |
| Start command     | `npm start` (`node src/server.js`)    |
| Health check path | `/health`                             |
| `PORT`            | Injected automatically by Render      |

Required Render environment variables: `ALIBABA_API_KEY`, `ALIBABA_ENDPOINT` (plus optional model overrides — see [Environment Variables](#environment-variables)).

Notes:

- There is no `render.yaml`/`Procfile` in the repository — deployment is configured in the Render dashboard.
- The server binds to `0.0.0.0` (required by Render's proxy) and exposes `/health` as a lightweight liveness probe that does not call the AI provider, so third-party outages never trigger platform restarts.
- Conversation sessions and rate-limit counters are in-memory and reset on every redeploy.

## Health Check

```text
GET /health
```

```json
{ "success": true, "status": "ok" }
```

A `200` response indicates the Node process is alive and serving requests. It deliberately does **not** verify AI-provider connectivity — the probe exists so platform health checks reflect only the service's own liveness.

## Development & Verification

```bash
npm install    # install dependencies
npm start      # start the server (node src/server.js)
```

There is no test suite or lint configuration in this project (`npm test` is the npm placeholder). Verify a running instance manually:

```bash
# Liveness
curl http://localhost:3000/health

# Root info
curl http://localhost:3000/

# Triage chat (first turn)
curl -X POST http://localhost:3000/api/triage/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-1","message":"I have a headache since yesterday","language":"en"}'

# Reset the session
curl -X POST http://localhost:3000/api/triage/reset \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-1"}'

# Document analysis (any reachable image URL)
curl -X POST http://localhost:3000/api/decoder/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/prescription.jpg"}'
```

## Security Notes

- Keep API keys in environment variables — never in source code.
- Never commit `.env`; it is gitignored on purpose.
- Never expose AI provider credentials to the Flutter application — all AI calls must go through this backend.
- Use HTTPS in production (Render provides this).
- Do not expose debug/test endpoints in production.
- The error handler logs error messages server-side only; do not add logging of user health text or document contents.
- Keep CORS/rate-limit configuration appropriate for the deployment — the current allow-all CORS is acceptable for a cookie-less mobile API but should be reviewed if browser clients are added.

## Production API Reference

```text
GET  /health                → liveness probe
GET  /                      → service info
POST /api/triage/chat       → one triage conversation turn
POST /api/triage/reset      → delete a triage session
POST /api/decoder/analyze   → analyze a medical document image
```

## License

This repository has no standalone `LICENSE` file; `package.json` declares the `ISC` license. Contact the author before reusing the code if you need clarified terms.

## Author

**DevExplorerr** — [GitHub](https://github.com/DevExplorerr)

Related project: [Doctor Hunt](https://github.com/DevExplorerr/Doctor-Hunt) (Flutter application)
