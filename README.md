# Olive server

The API behind [Olive](https://github.com/Sparshtomar/olive-mobile), a personal AI health assistant. Snap, say or type what you ate; Olive works out the nutrition, tracks it against a goal, and connects it to your lab reports. If your LDL is high, Olive turns that into a daily saturated-fat budget and tracks it as you log.

The product thinking, the four core flows and the edge cases are in the [app's README](https://github.com/Sparshtomar/olive-mobile#readme). This repo is the backend and the shared domain package.

**Stack:** Fastify 5 · Drizzle ORM · PostgreSQL · Zod · Gemini · Vitest

```
olive-server/
├─ src/               the API
├─ test/              integration tests against Postgres, insight rules, architecture
├─ drizzle/           SQL migrations
└─ packages/shared/   @sparshtomar/olive-shared: schemas, nutrition math, lab-marker catalog
```

---

## Architecture

Layered per module, **routes → services → repositories**, wired in a single composition root (`src/container.ts`). Modules use each other only through their `index.ts` (services and types); repositories stay private to their module.

```
src/modules/
  users/     profile + targets
  meals/     analyze (photo/voice/text), CRUD, photo serving
  reports/   analyze, CRUD, marker trends
  progress/  day summary, trends, streak, insights/ (rule engine)
  demo/      demo-user generator
src/ai/
  types.ts   MealAnalyzer, ReportExtractor interfaces
  gemini/    structured-output client with model fallback, prompts, mappers
  mock/      deterministic provider for keyless dev and tests
```

- **Dependency inversion:** services depend on `MealAnalyzer` / `ReportExtractor` interfaces, so the AI vendor is swappable in one file (`src/ai/index.ts`), and tests inject a fake.
- **Open/closed insights:** each insight is an `InsightRule` (a pure function of context); adding one doesn't touch the engine. Insights are rule-based on purpose: deterministic, tested, free, and they can't hallucinate about someone's health.
- **AI output is never trusted:** the model fills a loose schema, which is clamped and mapped, validated against the strict domain schema, and reviewed by the user before anything is saved.
- **Model fallback:** Gemini free-tier quotas are per model, so requests fall through `gemini-3-flash-preview → gemini-2.5-flash → gemini-2.5-flash-lite` on 429/5xx/timeouts.
- **Files are sniffed by magic bytes**, not by extension or Content-Type. Per-user rate limits protect the AI quota.
- **One error shape** (`{ error: { code, message } }`) with stable codes the app maps to copy and recovery actions.
- **Idempotent writes:** a unique `(user_id, client_id)` means a retried or double-tapped save creates one meal.
- **OpenAPI docs at `/docs`**, generated from the same Zod schemas that validate requests, so they can't drift.

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
cp .env.example .env             # set DATABASE_URL; GEMINI_API_KEY, or AI_PROVIDER=mock
npm run dev                      # http://localhost:4010, migrates on boot; API docs at /docs
```

**No Gemini key?** Set `AI_PROVIDER=mock` and every flow works with deterministic fake analysis.

After changing `packages/shared`, run `npm run build:shared` so the API picks it up.

### Tests

```bash
npm test         # API integration tests (needs Postgres) + shared package tests
npm run check    # everything CI runs: format, lint (incl. architecture rules), types, dead code, tests
```

- **API:** integration tests through HTTP against a real Postgres with a fake AI: identity, idempotent saves, photo sniffing, reports, trends, demo seeding, OpenAPI. Plus the insight rules and the architecture tests.
- **shared:** nutrition math, marker matching, unit conversion, nutrition focus.

Tests use `TEST_DATABASE_URL` (default `postgres://olive:olive@localhost:5432/olive_test`). With Docker: `TEST_DATABASE_URL=postgres://olive:olive@localhost:5433/olive_test npm test`.

---

## Deploying

[render.yaml](render.yaml) deploys the API to Render; Postgres runs on Neon. Set `DATABASE_URL` and `GEMINI_API_KEY` in the Render dashboard. Migrations run at boot, so a deploy is one step. `/health` is the health check, and the app pings it on launch so a sleeping free-tier instance starts waking before the first real request.

## AI model choice

**Gemini Flash** (free tier via Google AI Studio): one model handles images, audio and PDFs natively, supports JSON-schema structured output, and has the highest free limits among multimodal models. Groq was the alternative (faster) but needs separate vision and speech models and can't read PDFs directly.

## What I'd do next

- Real auth: a JWT verifier in the `current-user` plugin; routes only read `request.user`, so nothing else changes.
- Move AI analysis to a job queue with status polling once traffic grows, instead of holding the request open for up to two minutes.
- Object storage (S3/R2) for meal photos instead of Postgres.
- Per-user reminders tuned to usual meal times, and a weekly email summary.
