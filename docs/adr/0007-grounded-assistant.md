# 0007 - The assistant answers from the user's own data, through the structured client

**Status:** Accepted

## Context

"Ask Olive" is a chat that answers health questions. The naive version forwards the
question to a language model and shows what comes back. For a health product that is
the wrong default: the model knows nothing about _this_ user's cholesterol, and an
answer that sounds confident about numbers it has never seen is worse than no answer.

## Decision

The service builds the context, not the model. Before every turn `ChatService` renders
what Olive knows about the user as plain text - profile and daily targets, today's
meals and totals, the nutrition focus derived from reports, and every tracked lab
marker with its latest value, healthy range, status, trend and tip - and passes it with
the conversation history and any attached photo. The system prompt tells the model to
quote those numbers, to say when the data does not cover the question, and where the
line is between explaining a marker and practising medicine.

The reply is requested as JSON (`{ reply: string }`) through the same
`GeminiStructuredClient` used for meals and reports. Prose does not need a schema; the
client's model-fallback chain, timeouts and validation do.

History is capped at the last twelve turns in the prompt and stored in full.

## Consequences

- Answers reference real values ("your LDL was 136 mg/dL in June"), and the user can
  check them against the Reports tab.
- Adding a new source of truth (sleep, steps) is a line in `buildContext`, not a prompt
  rewrite.
- A failed model call saves nothing: the turn is written only after the answer exists.
- The mock provider reads the same context, so keyless development still produces
  answers that reflect the user's data.
- Context grows with the user's history; the marker list is bounded by the catalogue,
  the meal list by one day.

## Revisit when

Users want to ask about trends over months - then summarise the history server-side
(weekly aggregates) rather than pasting more rows. Or latency climbs past ~10 s -
then ADR 0004's queue applies here too.
