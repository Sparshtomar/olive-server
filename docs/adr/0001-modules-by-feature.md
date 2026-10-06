# 0001 — Modules by feature, layered inside

**Status:** Accepted

## Context

The conventional Node layout groups code by kind: `controllers/`, `services/`,
`repositories/`, `models/`. It is familiar, and it is what most tutorials show. It also
means a change to "meals" touches four directories, and nothing stops `userController`
from importing `mealRepository` directly.

## Decision

Group by feature. Each module under `src/modules/<name>/` owns its routes (the
controllers), service, repository and mappers, and exposes a public API through
`index.ts`. Inside a module the layers are fixed — `routes → service → repository` —
and across modules only `index.ts` may be imported. Infrastructure (`db/`, `ai/`,
`lib/`, `config/`) sits below every module and may not import one. A single composition
root (`container.ts`) wires concrete classes together.

All of this is enforced by ESLint `no-restricted-imports` rules, not by convention.

## Consequences

- A feature is one folder; deleting or extracting it (to its own service, say) is a
  move, not an archaeology dig.
- The boundary rules can be linted because the boundary is a directory.
- Readers looking for a `controllers/` folder need a map: see `docs/ARCHITECTURE.md`.
- Cross-cutting concerns (auth, error shape) live in `plugins/`, outside any module.

## Revisit when

A module needs to be deployed or scaled independently of the others. The layout
already makes that a `git mv`; the trigger is operational, not structural.
