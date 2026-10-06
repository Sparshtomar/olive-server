# 0005 - One Postgres; no cache, no read replica

**Status:** Accepted

## Context

A "production" architecture diagram usually has a cache in front of the database and
a read replica beside it. Both were considered.

## Decision

One Postgres (Neon in production), reads and writes on the same connection pool, no
application cache. Day summaries, trends and insights are computed per request from
indexed queries scoped to one user.

## Why not a cache

Every read is per-user and small; the hot path is one indexed query per screen. A
cache would save single-digit milliseconds and add a second service, a second
credential, cache invalidation on every meal write, and a class of "stale total"
bugs. The _client_ already caches: TanStack Query persists responses on the device.

## Why not a replica

Replication lag creates the one bug a food logger cannot have: log a meal, the Today
screen re-reads from the replica, the meal is not there. Correct read-your-writes
routing is real work. The free tier also offers no replica, so it would be a
configuration seam with nothing behind it.

## Consequences

- One moving part. Backups, migrations and local development stay trivial.
- The database is the ceiling. For a personal health log that ceiling is far away.

## Revisit when

- `/days/:date` p95 exceeds ~300 ms → materialise per-day totals on write (a table,
  not a cache: no invalidation problem).
- Sustained read load saturates the primary → replica for _analytics-style_ reads
  only (trends, insights), never for the screen that follows a write.
- A second API instance → see ADR 0006.
