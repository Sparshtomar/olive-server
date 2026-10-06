# 0004 - AI analysis is a synchronous request

**Status:** Accepted

## Context

Analysing a meal photo or a lab report takes 3–20 seconds. The textbook answer is a
job queue: enqueue, return 202, poll or push when done.

## Decision

Keep it a single request. The route awaits the model, with a per-model timeout and a
fallback chain (`gemini-3-flash-preview → gemini-2.5-flash → gemini-2.5-flash-lite`),
and returns the draft. The app shows a staged "thinking" screen for the duration.

## Consequences

- No queue, no worker, no job table, no polling endpoint, no "what if the app closes
  mid-job" state machine. Roughly a thousand lines that do not exist.
- The user waits on one screen, which is also where they review the result.
- A request holds a connection for up to ~20 s. At one instance and this traffic,
  that is not a constraint.
- Per-user rate limits protect the model quota instead of a queue depth doing so.

## Revisit when

Any of: p95 analysis latency exceeds ~10 s; a provider needs more than ~30 s (PDF
reports with many pages are the likely first case); or we want to analyse while the
app is backgrounded. Then: a `jobs` table, a worker on the same codebase, and a push
notification on completion.
