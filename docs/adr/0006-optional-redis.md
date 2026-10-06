# 0006 — Redis is optional, and only for rate limiting

**Status:** Accepted

## Context

Per-user rate limits protect the AI quota. `@fastify/rate-limit` keeps counters in
process memory by default, which is exact for one instance and wrong for two: each
instance would grant the full allowance.

## Decision

The rate-limit store is pluggable by configuration. When `REDIS_URL` is set the
counters live in Redis and are shared across instances; when it is not, they stay in
memory. Nothing else uses Redis (see ADR 0005), and the application code does not
know which store is active.

## Consequences

- Horizontal scaling is a config change, not a code change.
- Local development and the single free-tier instance need no Redis at all.
- The seam is tested by construction: the same app boots with either store.

## Revisit when

A second use for Redis appears that is not a cache — e.g. a job queue (ADR 0004). A
cache is not a reason; ADR 0005 covers why.
