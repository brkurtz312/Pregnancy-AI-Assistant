---
name: API spec codegen source of truth
description: lib/api-zod and api-client-react are generated from lib/api-spec/openapi.yaml — never hand-edit generated files.
---

Rule: any request/response field change must be made in `lib/api-spec/openapi.yaml`, then `pnpm --filter @workspace/api-spec run codegen` regenerates `lib/api-zod` and the react client.

**Why:** a field (contraction `watchRecordId`) was once hand-patched into the generated zod file; the next regen silently dropped it and broke api-server typecheck. Generated output is wiped on every codegen run.

**How to apply:** before adding/altering an API body field, edit the yaml schema, run codegen, then update server route + clients. Also: the repo intentionally has NO drizzle migration files — schema changes go through `pnpm --filter @workspace/db run push` (post-merge.sh runs it; Replit applies prod schema on publish). Prove new columns/indexes with a real-Postgres information_schema/pg_indexes test (see api-server tests/rate-limits-table-schema.test.ts pattern) since mocked route tests can't catch a missing column.
