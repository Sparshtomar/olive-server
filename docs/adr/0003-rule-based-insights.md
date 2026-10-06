# 0003 — Insights are rules, not model output

**Status:** Accepted

## Context

"Olive noticed…" cards summarise a user's week. The obvious implementation is to send
the week to the language model and show what comes back.

## Decision

Insights are produced by a rule engine: each insight is an `InsightRule`, a pure
function of a `Context` (the week's totals, targets, marker statuses) that returns an
insight or nothing. The engine runs every rule and ranks the results. Adding an insight
is adding a file; the engine does not change.

## Consequences

- Deterministic and unit-tested; the same week always yields the same cards.
- Free and instant — no quota, no latency, works offline from cached data.
- Cannot hallucinate about someone's health. Every sentence was written by a person.
- Less varied than generated prose. Rules need to be written; they do not emerge.

## Revisit when

Users ask follow-up questions ("why is my sugar high this week?"). A conversational
layer could then sit _on top of_ the rule output, grounded in it, rather than replace it.
