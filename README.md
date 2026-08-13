# Etiquetador

**Multi-project data labeling platform with centralized administration.**

Each project can define its own categories, segmentation rules, intensity scales, roles, and validation flows. The platform ships with a central admin to manage all projects, users and global settings.

## Status

**Pre-alpha** — under active development. Target MVP: 4 weeks (2 sprints of 2 weeks each).

## Architecture

- **Frontend + Backend**: Next.js 14 (App Router, Server Components, Server Actions) with TypeScript
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Auth**: Auth.js (NextAuth v5) with email/password + magic link
- **Offline draft**: IndexedDB (Dexie.js) on the browser
- **Tests**: Vitest (unit) + Playwright (e2e)
- **CI/CD**: GitHub Actions
- **Container**: Docker Compose for local development

## Repository layout (monorepo)

```
etiquetador/
├── apps/
│   └── web/         # Next.js 14 — UI + API routes + server actions
├── packages/
│   ├── db/          # Drizzle schema + migrations
│   ├── shared/      # Shared TypeScript types and Zod schemas
│   └── ui/          # Reusable React components
├── docker-compose.yml
├── .github/
│   └── workflows/
├── docs/
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   └── DECISIONS.md
└── README.md
```

## Quickstart (local development)

```bash
# 1. Install pnpm if not present
npm i -g pnpm@9

# 2. Install dependencies
pnpm install

# 3. Start Postgres + Redis + MinIO + Meilisearch
docker compose up -d

# 4. Copy env
cp apps/web/.env.example apps/web/.env

# 5. Run migrations
pnpm --filter @etiquetador/db migrate

# 6. Start the app
pnpm --filter @etiquetador/web dev
```

App: http://localhost:3000

## License

**Proprietary.** All rights reserved. See `LICENSE`.

## Contact

Maintained by the DCM team.
