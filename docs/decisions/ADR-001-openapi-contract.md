# ADR-001: OpenAPI 3.1 for the Go-to-Next.js API contract

**Date:** 2026-06-16
**Status:** accepted

## Context

The Go API and the Next.js frontend need an agreed contract before either side is built. The two realistic choices were OpenAPI 3.0 and OpenAPI 3.1.

The difference matters for one specific pattern used in the spec: nullable fields. The `grading` block in `MarketComparison` is null until a match completes, so it must be expressible as either null or a `MatchGrading` object.

In OpenAPI 3.0, nullable fields require the non-standard `nullable: true` extension, which is not part of JSON Schema and behaves inconsistently across code generators and validators. In OpenAPI 3.1, the spec fully aligns with JSON Schema draft 2020-12, and nullable fields are expressed as `oneOf: [{type: "null"}, {$ref: ...}]`, which all conformant tools handle correctly.

Tooling support for 3.1 (Redoc, Stoplight, most linters including Redocly CLI) is now mature enough for a greenfield project. TypeScript types generated from a 3.1 spec via tools like `openapi-typescript` handle the null union correctly without manual patches.

## Decision

Use OpenAPI 3.1 for the API contract at `docs/api/openapi.yaml`.

## Consequences

All validators and code generators used in the project must support OpenAPI 3.1. This rules out some older tools. If a specific tool turns out not to support 3.1, the workaround is to provide a 3.0-compatible shim for that tool only, not to downgrade the source spec. The source spec stays at 3.1.
