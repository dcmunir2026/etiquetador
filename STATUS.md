# Status — Etiquetador DCM

> **Snapshot del estado del proyecto.** Se regenera en cada hito.
> Para contexto permanente (arquitectura, convenciones, decisiones), ver `HANDOFF.md`.
> Para el plan de sprints, ver `docs/ROADMAP.md`.

**Última actualización:** 2026-08-25
**Rama actual:** `main`
**Rama en curso:** `feature/dimension-crud` (PR #47, en review)
**Próximo sprint objetivo:** Sprint 2 (config + ingest + labeling MVP)

---

## 1. Estado de PRs

| PR | Issue(s) | Descripción | Estado |
|---|---|---|---|
| [#44](https://github.com/dcmunir2026/etiquetador/pull/44) | #3 | Auth.js v5 (NextAuth 5.0.0-beta.32) + bcryptjs, login/signup, middleware, JWT en cookie httpOnly | ✅ mergeado |
| [#45](https://github.com/dcmunir2026/etiquetador/pull/45) | #4 | Server actions para project CRUD con Zod, RBAC superadmin, slug auto, audit_log | ✅ mergeado |
| [#46](https://github.com/dcmunir2026/etiquetador/pull/46) | #5 | Invite users / change role / remove member; UI `/proyecto/roles` | ✅ mergeado |
| [#47](https://github.com/dcmunir2026/etiquetador/pull/47) | #15, #18 | Dimension editor (UI) + create/update/archive server actions | 🟡 en review |

**Total: 4 PRs mergeados, 1 en review. 41 tests unitarios pasando, 0 fallando.**

## 2. Estado del GitHub Project

Board: [Etiquetador — Roadmap](https://github.com/users/dcmunir2026/projects/1)

| Workflow | Issues |
|---|---|
| Done | #1 (scaffold), #2 (schema), #3 (auth), #4 (project CRUD), #5 (invite + roles) |
| **In review** | **#15 (dimension UI), #18 (dimension CRUD)** — PR #47 |
| Backlog | #6–#14, #16, #17, #19–#42 (36 issues) |

## 3. Lo que está hecho

### Funcionalidad de la app

- **Auth completo:** email + password, signup, logout, middleware que gatea todo excepto `/login`, `/signup`, `/api/auth/*`. Credenciales seed: `marta@etiquetador.local` / `marta1234` (cambiar antes de prod).
- **CRUD de proyectos:** crear / archivar desde `/proyectos`. Modal "Nuevo proyecto" con validación en vivo, vista separada de activos/archivados.
- **Gestión de miembros por proyecto:** en `/proyecto/roles?projectId=…` — invitación por email (crea el user si no existe), cambio de rol inline, retirada. Constraint: no se puede eliminar al último projectadmin.
- **Catálogo de dimensiones (lectura + nueva + editar):** `/dimensiones` muestra las 11 dimensiones seed en grid; `/dimensiones/nueva` y `/dimensiones/[id]/editar` con form completo (name, kind, color picker con 11 swatches `tk-*`, scale selector con preview de valores, descripciones corta y larga). Al crear, los `dimension_values` se copian del `intensity_scale` elegido.

### Auditoría

- Toda mutación (proyecto, membresía, dimensión) escribe una fila en `audit_log` con `actorId`, `projectId` (o `null` para dimensiones), `action` (`project.create`, `dimension.archive`, etc.), `targetType`, `targetId`, `metadata` (JSON).
- La tabla `audit_log` está en el schema y operativa — no hay UI para verla aún (issue futura).

### Tests

```
$ pnpm test
 ✓ src/lib/slug.test.ts                              (9 tests)
 ✓ src/app/(admin)/proyectos/actions.test.ts         (10 tests)
 ✓ src/app/(admin)/proyecto/roles/actions.test.ts    (7 tests)
 ✓ src/app/(admin)/dimensiones/actions/actions.test.ts (15 tests)
 ↓ src/app/(admin)/proyectos/actions.integration.test.ts (skipped)
 ↓ src/app/(admin)/proyecto/roles/actions.integration.test.ts (skipped)
 ↓ src/app/(admin)/dimensiones/actions/actions.integration.test.ts (skipped)
 Test Files  4 passed | 3 skipped
      Tests  41 passed | 48 skipped (89)
```

Las suites `.integration.test.ts` están scaffolded (RBAC, audit log, new-vs-existing user, slug uniqueness) pero **skipped** porque falta el helper de test DB. Plantilla lista para cuando se monte.

## 4. Decisiones tomadas en esta tanda

| Tema | Decisión | Por qué |
|---|---|---|
| Auth | Auth.js v5 (no Clerk) | Self-hosted, gratis, sin vendor lock-in |
| Hashing | bcryptjs (no argon2) | Pure JS, no requiere compilación nativa, suficiente para el prototipo |
| Validación | Zod en server actions | Mismo schema reusado en client (preview de errores) |
| Auth en client components | `DIMENSION_KINDS` movido a `@/lib/dimension-kinds.ts` (puro, sin drizzle) | drizzle no se tree-shakea bien en el bundle del browser y rompía el render |
| IDs | `t_<base36-ts>_<4rand>` (del HANDOFF, no cambiado) | — |
| DB dev | better-sqlite3 (del HANDOFF, no cambiado) | — |
| Branching | Una feature branch por bloque, PR contra `main` | — |

## 5. Tech debt conocido

| # | Tema | Impacto | Cuándo tocarlo |
|---|---|---|---|
| 1 | Schema duplicado en `packages/db/src/index.ts` y `apps/web/src/db/schema.ts` | Cualquier cambio de schema hay que replicarlo a mano. El HANDOFF ya lo advertía. | Cuando un cambio toque ambos — o al migrar a Postgres. |
| 2 | Tests de integración (RBAC, audit log) skipped | No hay verificación automática de la rama de mutación; cualquier refactor del server action puede romper la lógica de seguridad sin que CI lo detecte. | Antes de empezar Sprint 2 (ya hay ~48 tests esperando). |
| 3 | Email magic-link no implementado | Las invitaciones crean el user con `passwordHash: "pending:<uuid>"` — el invitado no puede hacer login hasta que reciba el magic link (que no existe). | Cuando se implemente el sistema de email. Por ahora, la invitadora le pasa la contraseña en persona o se hace un reset manual. |
| 4 | Color de dimensión no se persiste en BD | El picker de `tk-*` funciona en la UI pero al recargar se pierde; el `dimensions.color` no existe como columna. | Cuando se quiera exportar/visualizar el color en la UI de tagging. Add `dimensions.color text` nullable. |
| 5 | No hay UI para `audit_log` | Se escribe pero no se lee. | Cuando se quiera mostrar "quién hizo qué" en la UI. |
| 6 | Wizard 4-pasos del mockup #14-#19 → form single-page | El mockup tiene un wizard pero la implementación es un solo form con scroll. Funcionalmente equivalente, visualmente distinto. | Si se necesita el wizard visual para una demo, fácil de añadir (estado local + 4 pantallas). |
| 7 | Sin CI | No hay GitHub Actions corriendo typecheck/test/lint en push. Issue #12. | Antes de cualquier release. |
| 8 | Sin Docker Compose para dev | El `docker-compose.yml` está en el repo pero no se usa (BD en SQLite local). | Si en algún momento se quiere homologar dev con prod (Postgres), o para que un nuevo dev clone+`docker compose up`+`pnpm dev`. |

## 6. Cómo arrancar (nuevo dev / nueva sesión)

```bash
git clone https://github.com/dcmunir2026/etiquetador.git
cd etiquetador
git checkout main

pnpm install

# DB + seed (solo la primera vez; idempotente)
cd packages/db
DATABASE_URL=file:./etiquetador.db pnpm exec tsx seed.ts
cd ../..

# Dev server
cd apps/web
DATABASE_URL=file:../../packages/db/etiquetador.db pnpm dev
# → http://localhost:3000

# Login
# marta@etiquetador.local  /  marta1234
```

Para clonar solo la rama en review:
```bash
git fetch origin feature/dimension-crud
git checkout feature/dimension-crud
```

## 7. Próximos pasos recomendados (Sprint 2, en orden deDependencies)

1. **#17 — UI segmentation config** (pequeño). Define cómo fragmentar el corpus; necesario para #19 y #21. Cubre `segmentation_configs` que ya existe en el schema.
2. **#19 — Excel import endpoint** (grande). Parser `.xlsx`/`.csv` con column mapping. Depende de #17 si queremos elegir segmentación al importar.
3. **#16 — UI intensity scale editor** (pequeño). Crear escalas custom (las 6 actuales son globales y no editables).
4. **#20, #21, #22, #23, #24, #25, #26, #27, #28** — el resto de Sprint 2 según `docs/ROADMAP.md`.

**Tests pendientes antes de seguir:** montar el helper de DB de test (test/integration.tsx) y bajar los `describe.skip` para que cubramos RBAC + audit log automáticamente.

## 8. Convenciones rápidas (recordatorio)

- Conventional Commits en español: `feat(scope):`, `refactor(scope):`, `chore:`, `fix:`, `test:`
- Scopes comunes: `(admin)`, `db`, `wizard`, `auth`, `roles`, `dimensions`
- Server actions en `app/(admin)/<area>/actions.ts`; schemas extraídos a `app/(admin)/<area>/actions/schemas.ts` para poder testearlos sin DB.
- Enums compartidos entre client y server: van en `lib/<name>.ts`, NO en `db/schema.ts` (la lección de la última tanda).
- Cada mutación escribe `audit_log` con metadata JSON-stringified.

---

*Fin del snapshot. Regenerar cuando se cierre el siguiente PR.*
