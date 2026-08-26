# AGENTS.md — instrucciones para el agente AI

Reglas de proyecto, convenciones y tech debt que el agente debe respetar en cada feature. Si una regla choca con una instrucción explícita del usuario, gana el usuario.

## Proyecto

Plataforma multi-proyecto de etiquetado de datos con LLM Judge para EpData (Europa Press).
Stack: Next.js 14 (App Router) + Auth.js v5 + Drizzle ORM. DB dev: better-sqlite3. DB prod target: PostgreSQL (migración en curso, ver §DB).
Repo canónico: `github.com/dcmunir2026/etiquetador`. Mockup en rama `gh-pages`, extraído a `mockup/views/` (PR #48). Skill de implementación: `.minimax/skills/mockup-impl/SKILL.md`.

## Convenciones de código

- **Conventional Commits en español** (`feat(dimensiones): …`, `fix(roles): …`).
- **IDs** con prefijo `t_<base36-ts>_<4rand>`. Nunca `uuid`.
- **Imports client-safe**: si un componente es `'use client'`, no importar de `@/db/schema` (Drizzle no tree-shakea en el bundle del browser → "Element type is invalid"). Usar los enums puros en `lib/<area>-kinds.ts`.
- **Zod en server actions**, schemas en `app/(admin)/<area>/actions/schemas.ts`. Tests de schema (Vitest, sin DB) en `actions.test.ts` junto al schema.
- **Audit log** en cada mutación: `audit_log` con `actorId`, `projectId` (nullable si global), `action`, `targetType`, `targetId`, `metadata` (JSON stringified).
- **RBAC** helpers según área: `requireSuperAdmin` para globales (dimensions, taxonomies, scales, users), `requireProjectManager(projectId)` para per-project (roles, taxonomías de proyecto, segmentación). Ambos viven junto a las acciones; refactor a `lib/` cuando se repitan en ≥3 features.

## Soft delete (regla de oro)

**"Eliminar" es siempre lógico = `status = 'archived'`. Nunca borrar filas.**

- Aplicar al crear cualquier acción "delete"/"archive": debe escribir `status = 'archived'` + audit row con `previousStatus: 'active'`.
- El esquema de todas las entidades globales y per-project debe tener `status: 'active' | 'archived'` (text + check en app layer). Si una entidad nueva no lo tiene, añadirlo en el mismo PR.
- Los listados de la UI filtran `status = 'active'` por defecto; ofrecer filtro "archivadas" / "todas" cuando tenga sentido.
- Hard delete solo permitido si: (a) el usuario lo pide explícitamente, (b) se documenta en el commit, (c) audit log registra `action: 'force.delete'`.

## DB (SQLite → Postgres)

- **Hoy:** `better-sqlite3` en `apps/web/src/db/client.ts`. `DATABASE_URL=file:../../packages/db/etiquetador.db`.
- **Target:** PostgreSQL. La migración está planificada (Sprint siguiente). Cliente actual es SQLite-only.
- **Duplicación de schema** (`apps/web/src/db/schema.ts` ↔ `packages/db/src/index.ts`) es tech debt documentado en HANDOFF — workaround para webpack OOM con `better-sqlite3` native. Se consolida al migrar a Postgres.
- **Tipos**: el schema actual es SQLite-flavored (`text` con `{ enum: [...] }`, `integer` con `mode: 'timestamp'`). Al migrar, switch a `pgTable` + `pgEnum` + `timestamp` con `withTimezone`. Drizzle abstrae el 90% — revisar diff caso por caso.

## Stack visual / componentes

- CSS principal en `apps/web/src/app/globals.css`. Clases nuevas en modales/wizards prefieren los nombres del mockup (`.tax-card`, `.scale-card`, `.wizard-step*`, etc.) para que futuros agentes grep-encontreable.
- Modal portal pattern: `createPortal(..., document.body)` + `useEffect` para lock de `body.overflow` y listener de Escape. Lo usa `DimensionWizardModal`, `TaxonomyForm`, `AssignToProjectModal`. Reusar el patrón, no reinventar.
- Tablas: `<table className="table">` con `thead/tbody` y celdas `<span className="pname/psub">` para nombre + descripción. El estilo está en globals.css.

## Tech debt vivo (no atacar sin pedir)

- `dimensions.color` no es columna DB (STATUS.md). El form lo acepta pero no persiste.
- 32 integration tests saltados (necesitan helper de DB en memoria).
- Email magic-link invites (placeholders `pending:<uuid>` en passwordHash).
- No `audit_log` UI.
- Email real para invites (de momento solo username+password).
- Página standalone `/escalas` para browse/edit de escalas.

## Workflow

1. Localizar el view en `mockup/views/INDEX.md` (skill `mockup-impl` paso 1).
2. Leer el view + CSS asociado.
3. Diff contra código (columnas already / partial / missing / drift).
4. Plan ≤ 4 líneas, user-facing.
5. **Pausar y mostrar al usuario** antes de tocar código.
6. Implementar con verificación tras cada archivo.
7. `pnpm -F web typecheck` + `pnpm -F web test`.
8. Commit en `feature/<topic>` o `chore/<topic>`, push, abrir PR contra `main`.
9. Reportar al usuario con diff mockup↔código cerrado y gaps abiertos.

El usuario es el único developer del repo (perfil confirmado). PRs cortos, él hace el merge. Sin ceremonias de equipo.
