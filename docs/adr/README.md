# Architecture decision records

One file per decision that shaped this codebase and would be expensive to reverse. Each
records the context at the time, what was decided, what it costs, and — most useful —
the **trigger** that would make us revisit it. A decision without a trigger is dogma.

| #    | Decision                                                                     | Status   |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 0001 | [Modules by feature, layered inside](0001-modules-by-feature.md)             | Accepted |
| 0002 | [One shared Zod package is the API contract](0002-shared-zod-contract.md)    | Accepted |
| 0003 | [Insights are rules, not model output](0003-rule-based-insights.md)          | Accepted |
| 0004 | [AI analysis is a synchronous request](0004-synchronous-ai.md)               | Accepted |
| 0005 | [One Postgres; no cache, no replica](0005-one-postgres.md)                   | Accepted |
| 0006 | [Redis is optional, and only for rate limiting](0006-optional-redis.md)      | Accepted |
| 0007 | [The assistant answers from the user's own data](0007-grounded-assistant.md) | Accepted |
| 0008 | [A second AI provider behind the same port](0008-second-ai-provider.md)      | Accepted |

Format: [Michael Nygard's](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions),
kept short. New decisions get the next number; superseded ones stay and point forward.
