# Architecture

## High-level

```
┌────────────────────────────────────────────────────────────┐
│                      Browser (Next.js)                      │
│  - React Server Components for read paths                   │
│  - Client Components for editor + draft                    │
│  - IndexedDB (Dexie) for offline drafts                     │
└──────────────────────┬─────────────────────────────────────┘
                       │ Server Actions / API routes
                       ▼
┌────────────────────────────────────────────────────────────┐
│                   Next.js 14 (Node 20)                      │
│  - Server Actions (mutations, auth-checked)                 │
│  - API routes (REST for external integrations)              │
│  - BullMQ workers (ingest, segmentation, comparison)        │
│  - Auth.js v5 (session)                                     │
└──────┬──────────────┬──────────────┬─────────────┬─────────┘
       │              │              │             │
       ▼              ▼              ▼             ▼
   PostgreSQL      Redis          MinIO       Meilisearch
   (Drizzle)    (BullMQ jobs)   (files)    (full-text search)
```

## Multi-tenancy

Every domain table has a `project_id` foreign key. The session contains the
active `project_id`; all queries are scoped by it. Super admins can
override the scope via an explicit "view as project" admin mode.

Row-Level Security is **not** used (over-engineering for an MVP). All
queries go through repository functions that always include
`project_id = :current_project_id` in the `WHERE` clause.

## Configurable parameters per project

These live as relational tables (not JSONB) so they are queryable,
indexable and constraint-enforceable:

- `dimension` (id, project_id, name, description, scale_id, kind)
- `dimension_value` (id, dimension_id, label, value, order)
- `intensity_scale` (id, project_id, name, kind: 'binary'|'3-level'|…)
- `intensity_level` (id, scale_id, label, value, order)
- `segmentation_config` (id, project_id, unit, max_chunk_size, overlap)
- `role` (id, project_id, name, is_system)
- `permission` (id, role_id, action, resource)

## Auth

- Auth.js v5 with Credentials + Email provider
- Session is JWT, stored in httpOnly cookie
- Session payload: `{ userId, activeProjectId, roles: [{projectId, roleId}] }`
- Switching project updates the session via a Server Action

## Offline drafts

The labeling UI uses Dexie.js to persist every label change locally.
On reconnect (or page reload), the local draft is replayed to the
server via a single bulk upsert. This is simpler than CRDT and good
enough for an annotator working alone on a package.

## Why Next.js for backend

Per the project constraints (Next SSR, monorepo), we use:

- Server Actions for typed RPC from UI to backend
- API routes only for external consumers (LLM Judge, integrations)
- Drizzle directly inside Server Actions (no separate API service)

This keeps the deployable to a single Node process + Postgres + Redis.
For 4-week MVP, this is the right tradeoff.
