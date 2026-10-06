# 0002 — One shared Zod package is the API contract

**Status:** Accepted

## Context

The API and the app need to agree on request and response shapes, nutrition math and
the lab-marker catalogue. The usual options: duplicate TypeScript interfaces in both
repos (they drift), generate clients from OpenAPI (a build step and a generated blob
nobody reads), or share a package.

## Decision

`packages/shared` (`@sparshtomar/olive-shared`) holds Zod schemas and the pure domain
logic. The API validates requests with the schemas and generates its OpenAPI document
from them; the app validates responses with the same schemas and infers its types from
them. The package is published to npm with provenance; the app installs a version and
upgrades deliberately.

Zod rather than plain interfaces because a type disappears at runtime. A schema
rejects a malformed payload at the boundary, on both sides, with a message.

## Consequences

- There is exactly one definition of every DTO, and it is executable.
- A contract change is a visible version bump that both repos must opt into.
- The API docs cannot drift from validation, because they are the validation.
- The package must stay free of server- or React-only code.

## Revisit when

A third consumer appears (a web dashboard, a partner integration) with a different
release cadence — then OpenAPI-generated clients become worth their build step.
