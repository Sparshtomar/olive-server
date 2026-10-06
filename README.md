# Olive server

The API behind [Olive](https://github.com/Sparshtomar/olive-mobile), a personal AI health assistant. Snap, say or type what you ate; Olive works out the nutrition, tracks it against a goal, and connects it to your lab reports. If your LDL is high, Olive turns that into a daily saturated-fat budget and tracks it as you log.

The product thinking, the five core flows and the edge cases are in the [app's README](https://github.com/Sparshtomar/olive-mobile#readme). This repo is the backend and the shared domain package.

**Stack:** Fastify 5 · Drizzle ORM · PostgreSQL · Zod · Gemini or Groq · Vitest

```
olive-server/
├─ src/               the API
├─ test/              integration tests against Postgres, insight rules, architecture
├─ drizzle/           SQL migrations
└─ packages/shared/   @sparshtomar/olive-shared: schemas, nutrition math, lab-marker catalog
```

---

## Architecture

Layered per module, **routes → services → repositories**, wired in a single composition root (`src/container.ts`). Modules use each other only through their `index.ts` (services and types); repositories stay private to their module. Looking for `controllers/`, `models/`, DTOs? [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps every conventional layer to its file here, traces a request end to end, and holds the **scaling plan** with the trigger for each change. The reasoning behind the big calls - modules by feature, the shared Zod contract, rules over model output, synchronous AI, one Postgres, optional Redis - is in [docs/adr/](docs/adr/README.md).

```
src/modules/
  users/     profile + targets
  meals/     analyze (photo/voice/text), CRUD, photo serving
  reports/   analyze, CRUD, marker trends
  progress/  day summary, trends, streak, insights/ (rule engine)
  chat/      Ask Olive: conversations, turns with photos, answers grounded in the user's data
  demo/      demo-user generator
src/ai/
  types.ts   MealAnalyzer, ReportExtractor, HealthAssistant interfaces
  gemini/    structured-output client with model fallback
  groq/      vision + Whisper client; PDFs reduced to text first
  mock/      deterministic provider for keyless dev and tests
  prompts, schemas and mappers are shared by every provider
```

- **Dependency inversion:** services depend on `MealAnalyzer` / `ReportExtractor` interfaces, so the AI vendor is swappable in one file (`src/ai/index.ts`), and tests inject a fake.
- **Open/closed insights:** each insight is an `InsightRule` (a pure function of context); adding one doesn't touch the engine. Insights are rule-based on purpose: deterministic, tested, free, and they can't hallucinate about someone's health.
- **AI output is never trusted:** the model fills a loose schema, which is clamped and mapped, validated against the strict domain schema, and reviewed by the user before anything is saved.
- **Grounded chat:** every \"Ask Olive\" answer is built from the user's own profile, today's meals and lab markers, rendered to text by the service and quoted by the model - so it explains their numbers instead of inventing them ([ADR 0007](docs/adr/0007-grounded-assistant.md)).
- **Model fallback:** free-tier quotas are per model, so each provider falls through an ordered model list on 429/5xx/timeouts (Gemini: `gemini-3-flash-preview → gemini-2.5-flash → gemini-2.5-flash-lite`; Groq: `GROQ_MODELS`).
- **Files are sniffed by magic bytes**, not by extension or Content-Type. Per-user rate limits protect the AI quota.
- **One error shape** (`{ error: { code, message } }`) with stable codes the app maps to copy and recovery actions.
- **Idempotent writes:** a unique `(user_id, client_id)` means a retried or double-tapped save creates one meal.
- **OpenAPI docs at `/docs`**, generated from the same Zod schemas that validate requests, so they can't drift.
- **Hardened:** baseline security headers (`@fastify/helmet`), body and upload limits, per-user AI rate limits whose counters move to Redis when `REDIS_URL` is set (so a second instance is a config change - [ADR 0006](docs/adr/0006-optional-redis.md)).
- **Operable:** `/health` round-trips the database (503 within 2 s if it doesn't answer, so the platform stops routing there), every response carries an `x-request-id` that is honoured from the client or proxy and appears in the logs, and `SIGTERM` drains in-flight requests before the pool closes.

### Data model

`users` · `meals` (+ `meal_items` storing per-portion nutrients × quantity, and `meal_photos` kept separate so lists never load image bytes) · `reports` · `report_markers` (as printed, plus normalised key, canonical value and status).

### The shared package

`packages/shared` is published to npm as [`@sparshtomar/olive-shared`](https://www.npmjs.com/package/@sparshtomar/olive-shared). It holds what both sides must agree on: request and response schemas, nutrition targets, and the lab-marker catalog with unit conversion and diet focus. The API uses it from the workspace; the app installs a published version. That keeps one source of truth while letting each repo build and deploy on its own.

- Both consume the same built output (ESM + CJS + types). `npm install` builds it (`prepare` script).
- A contract change is a version bump in `packages/shared/package.json` plus a `shared-v<version>` tag. CI tests and publishes it with npm provenance ([release-shared.yml](.github/workflows/release-shared.yml)); the app then upgrades on purpose.

### Architecture rules (enforced, not just documented)

| Rule                                                                                                           | Enforced by                                                                 |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Modules use each other through `index.ts`; routes → service → repository; infrastructure never imports modules | ESLint `no-restricted-imports` ([eslint.config.mjs](eslint.config.mjs))     |
| The shared package is imported from its root only                                                              | ESLint                                                                      |
| No import cycles                                                                                               | ESLint `import/no-cycle`                                                    |
| No `any`, no `@ts-ignore`, no floating promises, no `console`, no file over 300 lines                          | ESLint + `strict` TypeScript                                                |
| Every module has an `index.ts` and `<module>.<role>.ts` files; no `helpers`/`utils` grab-bags                  | Architecture tests ([test/architecture.test.ts](test/architecture.test.ts)) |
| No unused files, exports or dependencies                                                                       | knip                                                                        |

Every rule runs on commit (lint-staged), on push (typecheck + knip) and in [CI](.github/workflows/ci.yml), which also runs the tests against Postgres and builds the server and the package. There are no baselines or grandfathered violations.

---

## Running locally

Requirements: Node 22+ (see `.nvmrc`), PostgreSQL 16 (Homebrew on 5432, or `npm run db:up` for Docker on 5433).

```bash
npm install                      # also builds packages/shared
cp .env.example .env             # set DATABASE_URL and AI_PROVIDER (gemini | groq | mock) with its key
npm run dev                      # http://localhost:4010, migrates on boot; API docs at /docs
npm run db:seed                  # adds a demo user (two weeks of meals, two reports) to DATABASE_URL
```

**No AI key?** Set `AI_PROVIDER=mock` and every flow works with deterministic fake analysis.

After changing `packages/shared`, run `npm run build:shared` so the API picks it up.

### Tests

```bash
npm test         # API integration tests (needs Postgres) + shared package tests
npm run check    # everything CI runs: format, lint (incl. architecture rules), types, dead code, tests
```

- **API:** integration tests through HTTP against a real Postgres with a fake AI: identity, idempotent saves, photo sniffing, reports, trends, chat grounding, demo seeding, OpenAPI. Plus the insight rules and the architecture tests.
- **shared:** nutrition math, marker matching, unit conversion, nutrition focus.

Tests use `TEST_DATABASE_URL` (default `postgres://olive:olive@localhost:5432/olive_test`). With Docker: `TEST_DATABASE_URL=postgres://olive:olive@localhost:5433/olive_test npm test`.

---

## Deploying

[render.yaml](render.yaml) deploys the API to Render; Postgres runs on Neon. A multi-stage [Dockerfile](Dockerfile) builds the same service for any container host (`docker build -t olive-server . && docker run -p 4010:4010 --env-file .env olive-server`). Set `DATABASE_URL` and the key for the provider `render.yaml` selects (`GROQ_API_KEY` today, or switch `AI_PROVIDER` and set `GEMINI_API_KEY`) in the Render dashboard. Migrations run at boot, so a deploy is one step. `/health` is the health check, and the app pings it on launch so a sleeping free-tier instance starts waking before the first real request.

## AI model choice

Two providers behind one port (`MealAnalyzer`, `ReportExtractor`, `HealthAssistant` in `src/ai/types.ts`); `AI_PROVIDER` picks one, `mock` runs without a key.

- **Gemini Flash** (AI Studio): one model handles images, audio and PDFs natively with JSON-schema output. The first choice when a key is available.
- **Groq** (free tier, no card): `qwen3.8-27b` reads images and returns JSON, Whisper transcribes voice notes, and digital PDFs are reduced to their text layer on the server first (`unpdf`); scanned PDFs get a clear "photograph the pages" message. Shipped because the Gemini project behind this app was suspended two days before submission - see [ADR 0008](docs/adr/0008-second-ai-provider.md).

Both clients fall through an ordered model list on rate limits, outages, timeouts and schema-invalid answers, and the model's output is clamped and validated before anyone sees it.

## What I'd do next

- Real auth: a JWT verifier in the `current-user` plugin; routes only read `request.user`, so nothing else changes.
- Move AI analysis to a job queue with status polling once traffic grows, instead of holding the request open for up to two minutes.
- Object storage (S3/R2) for meal photos instead of Postgres.
- Per-user reminders tuned to usual meal times, and a weekly email summary.
