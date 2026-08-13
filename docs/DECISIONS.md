# Architecture Decision Records

## ADR-001: Monorepo with pnpm workspaces

**Date**: 2026-08-13
**Status**: Accepted

We use a single Git repository containing multiple `apps/` and `packages/`.
Justification: shared TypeScript types between UI, server actions, and
DB schema; simpler CI; fewer repositories to manage for a small team.

`apps/web` is the only deployable in the MVP. `packages/db` holds the
Drizzle schema. `packages/shared` holds Zod schemas and TS types.
`packages/ui` is reserved for future component extraction.

## ADR-002: Next.js 14 App Router for both UI and API

**Date**: 2026-08-13
**Status**: Accepted

Per project constraints, the backend is Next.js Server Actions and API
routes, not a separate service. Tradeoff: we lose some flexibility
around long-running jobs, but BullMQ inside the same Node process
covers that need for an MVP.

## ADR-003: PostgreSQL + Drizzle ORM

**Date**: 2026-08-13
**Status**: Accepted

Postgres gives us JSONB for ad-hoc configs and full-text search. Drizzle
is a typed SQL builder that integrates well with Next.js Server Actions
and avoids the runtime overhead of Prisma. We use `node-postgres`
directly under Drizzle for connection pooling.

## ADR-004: Configurable parameters as relational tables

**Date**: 2026-08-13
**Status**: Accepted

For the configurable dimensions, intensity scales, roles and permissions,
we use relational tables with foreign keys instead of JSONB blobs. This
makes the schema queryable, indexable, and constraint-enforceable at
the database level. JSONB is reserved for truly free-form data
(per-project settings that don't need joins).

## ADR-005: Offline drafts via IndexedDB, not SQLite

**Date**: 2026-08-13
**Status**: Accepted

The original proposal mentioned SQLite for local drafts. We chose
IndexedDB (via Dexie.js) because the labeling UI runs in a browser,
not a native app. SQLite would require an Electron or Tauri wrapper,
which is out of scope for the 4-week MVP.

## ADR-006: BullMQ for jobs, Redis for queue

**Date**: 2026-08-13
**Status**: Accepted

Excel ingestion, deduplication, segmentation and package comparison
are async jobs. BullMQ over Redis is the standard Node choice, has
good observability (Bull Board) and retries.

## ADR-007: Multi-tenancy at the query layer, not at the row level

**Date**: 2026-08-13
**Status**: Accepted

We use application-level filtering (`project_id = :current`) instead of
PostgreSQL Row-Level Security. RLS is more secure in theory but adds
operational complexity (policies, superuser escape hatches) that does
not pay off for a 4-week MVP with a small admin team.
