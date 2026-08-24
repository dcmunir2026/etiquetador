# Handoff — Etiquetador

> **Lee esto primero si acabas de llegar al repo.**
> Este documento es el contexto de continuidad del proyecto. Resume
> el estado, las decisiones, el modelo de datos y el siguiente paso.

---

## 1. ¿Qué es esto?

Plataforma **multi-proyecto de etiquetado de datos** para **Europa Press (EpData)**.
Permite a un equipo configurar taxonomías de sesgos (Sesgo de odio, Emotividad,
Género, etc.), asignarlas a proyectos, dividir corpus en paquetes, y anotar
fragmentos de respuestas JSONL de LLM Judge con acuerdo inter-anotador.

El sistema completo se planificó en `docs/ROADMAP.md` (4 semanas / 2 sprints).
**Deadline real: 1 mes** (comprimido).

---

## 2. Repositorio y ramas

| Rama | Para qué | Estado |
|---|---|---|
| **`main`** | App real Next.js 14 + Drizzle | ✅ funcional (4 páginas) |
| `gh-pages` | Mockup HTML (referencia visual) | ✅ mergeado (PR #43) |
| `mockup-dev` | Antigua rama de trabajo del mockup | ⚠️ deprecated |

**Reglas:**
- **No tocar `gh-pages`**: contiene el mockup. Cualquier cambio de UI se hace primero en `main` y, si queremos reflejarlo en el mockup, va por otro PR.
- **No tocar `mockup-dev`**: deprecated.

---

## 3. Stack

| Capa | Tecnología | Estado |
|---|---|---|
| Front + backend | Next.js 14 (App Router) + TypeScript | ✅ |
| BD local | better-sqlite3 (sin Docker en dev) | ✅ |
| BD prod | PostgreSQL + Drizzle (target) | ⏳ |
| ORM | Drizzle 0.45 | ✅ |
| Estilos | CSS variables (design tokens propios) | ✅ |
| Auth | Stub con cookie (Marta R. hardcoded) | ⏳ → Auth.js v5 |
| Workers | BullMQ + Redis | ⏳ no iniciado |
| Storage | MinIO (archivos Excel, exports) | ⏳ no iniciado |
| Búsqueda | Meilisearch | ⏳ no iniciado |
| Drafts offline | Dexie.js / idb (cliente) | ⏳ |

---

## 4. Estructura del monorepo

```
etiquetador/
├── apps/
│   └── web/                          # Next.js 14 (app + api routes)
│       └── src/
│           ├── app/
│           │   ├── (admin)/          # Route group: layout con sidebar
│           │   │   ├── layout.tsx
│           │   │   ├── page.tsx       # / (dashboard)
│           │   │   ├── proyectos/
│           │   │   ├── dimensiones/
│           │   │   └── taxonomias/
│           │   ├── api/active-project/
│           │   ├── layout.tsx
│           │   └── globals.css
│           ├── components/           # Sidebar, Topbar
│           ├── db/                   # Schema + client (inlined)
│           │   ├── schema.ts
│           │   └── client.ts
│           └── lib/
│               ├── auth.ts           # getCurrentUser() stub
│               └── db.ts             # re-exports
├── packages/
│   ├── db/                           # Schema canónico (Drizzle)
│   │   ├── src/index.ts              # Tablas + tipos
│   │   ├── src/client.ts             # Cliente de DB
│   │   ├── migrations/               # SQL generada
│   │   ├── seed.ts                   # Script de seed
│   │   └── drizzle.config.ts
│   ├── shared/                       # Tipos compartidos (vacío)
│   └── ui/                           # Componentes UI (vacío)
├── docs/
│   ├── ROADMAP.md                    # Sprints 1-2 + backlog
│   ├── ARCHITECTURE.md               # Clean Arch planeado
│   └── DECISIONS.md                  # Decisiones tomadas
├── docker-compose.yml                # Postgres + Redis + MinIO + Meilisearch
└── pnpm-workspace.yaml
```

---

## 5. Modelo de datos (refactor del mockup)

**Decisión clave:** las **dimensiones son GLOBALES**, no por proyecto. Esto
permite reutilizarlas (Sesgo de odio vive en 3 proyectos). Las **taxonomías**
son la nueva capa: agrupan dimensiones (N:M) y se asignan a proyectos.

```
users (1 superadmin: Marta R.)
  ↓ 1:N
projects (EpData 2026-Q3, Q2, Sintético v1, ODS 2026)
  ↓ N:M (vía project_taxonomies)
taxonomies (4 grupos: Sesgos sociodemo, Calidad, Aspectos formales, Toxicidad)
  ↓ N:M (vía taxonomy_dimensions)
dimensions (11 átomos: Sesgo odio, Emotividad, Género, Raza, Religión, ...)
  ↓ 1:N
dimension_values (Bajo / Medio / Alto, etc., por dimensión)
  ↓ FK
intensity_scales (6 globales: Booleano, Binario, 3-niveles, 5-niveles, Likert 1-7, Texto libre)
  ↓ 1:N
intensity_levels (Sí/No, Bajo/Medio/Alto, ...)
```

**12 tablas:**
`users`, `projects`, `project_members`, `intensity_scales`, `intensity_levels`,
`dimensions`, `dimension_values`, `taxonomies`, `taxonomy_dimensions`,
`project_taxonomies`, `segmentation_configs`, `audit_log`.

**Driver:** `better-sqlite3` para dev (sin Docker), SQL portable a Postgres para prod.

---

## 6. Convenciones y patrones establecidos

### IDs
Prefijo `t_<base36 timestamp>_<4 random chars>`. Evita `uuid()` para
portabilidad SQLite/Postgres. Generado por helper en `packages/db/src/index.ts`
(ahora mismo inline, mover a `packages/shared` cuando crezca).

### Auth stub
```ts
// apps/web/src/lib/auth.ts
export async function getCurrentUser(): Promise<User | null> {
  // 1) Lee cookie 'etq_active_user'
  // 2) Si no hay, devuelve el primer superadmin (dev convenience)
  // → Reemplazar con Auth.js v5 cuando se implemente
}
```

### Active project
Cookie `etq_active_project`. Endpoint: `POST /api/active-project` con
`{ projectId }`. Refresca el servidor (Server Action `router.refresh()`).

### Sidebar / Topbar
- 5 secciones: **Proyecto** / **Catálogo** / **Configuración** / **Etiquetado** / **Cierre**
- Items con candado (🔒) son los que requieren proyecto activo
- Switcher en topbar con dropdown de proyectos
- Botón "+ Nuevo proyecto" en topbar

### Naming
- `apps/web/src/db/` para schema inlined (workaround de webpack + workspace)
- `packages/db/src/` para schema canónico
- ⚠️ **Hay duplicación temporal** entre estos dos. Unificar cuando resolvamos el
  problema de webpack OOM con workspaces + native bindings.

### CSS / Design tokens
NO usamos Tailwind utility classes todavía. Usamos CSS variables en
`globals.css` que replican el mockup. Migrar a Tailwind completo es opcional.

---

## 7. Cómo correr localmente

```bash
git clone https://github.com/dcmunir2026/etiquetador.git
cd etiquetador
git checkout main

pnpm install

# Crear la DB con datos seed (solo la primera vez)
cd packages/db
DATABASE_URL=file:./etiquetador.db pnpm exec tsx seed.ts
cd ../..

# Arrancar el dev server
cd apps/web
DATABASE_URL=file:../../packages/db/etiquetador.db pnpm dev
# → http://localhost:3000
```

Sin Docker. Sin Postgres local. Todo en un `.db` de SQLite.

---

## 8. Páginas funcionales al commit `3b4b7d0`

| Ruta | Estado | Lee de BD | Acción que falta |
|---|---|---|---|
| `/` (dashboard) | ✅ | Sí | Real (todo desde BD) |
| `/proyectos` | ✅ | Sí | Acciones de crear/archivar |
| `/dimensiones` | ✅ | Sí | Wizard de creación (mockup #14-#19) |
| `/taxonomias` | ✅ | Sí | Wizard de taxonomía (mockup #36) |
| `/proyecto/taxonomias` | ⏳ | – | Asignar taxonomía al proyecto |
| `/proyecto/roles` | ⏳ | – | CRUD de roles |
| `/proyecto/paquetes` | ⏳ | – | H8: dividir corpus |
| `/proyecto/segmentacion` | ⏳ | – | H3+H4: segmentar |
| `/etiquetar` | ⏳ | – | H10-H12: etiquetar |
| `/discrepancias` | ⏳ | – | H15: detectar |
| `/validacion` | ⏳ | – | H18-H19 |
| `/reporte` | ⏳ | – | H17 |
| `/kappa` | ⏳ | – | H21 |

---

## 9. Próximos pasos (orden recomendado)

1. **Server Actions para CRUD de dimensiones** — replicar el wizard del mockup (#14-#19) con DB real. **H6, H7**.
2. **Wizard de creación de dimensión** (4 pasos) — modal/page con nombre, escala, valores, descripción. Persiste en BD.
3. **Asignar taxonomías a proyectos** desde `/proyecto/taxonomias` — replicar mockup vista de tabs.
4. **Auth.js v5** — reemplazar stub. Decidir si email+password o provider.
5. **Upload de Excel** (H1) + fragmentación (H3, H4) + paquetes (H8) + espejos (H9) + etiquetado (H10) — Sprint 2 completo.
6. **Discrepancias** (H15) + validación cualitativa (H18) + reporte (H17) + Fleiss (H21) — Sprint 3+.

---

## 10. Decisiones pendientes (necesitan input del usuario)

| Tema | Opciones | Cuándo se decide |
|---|---|---|
| Auth.js v5 vs Clerk | v5 (self-hosted, gratis) / Clerk (rápido, SaaS) | Sprint 1, issue #3 |
| Schema unificado | ¿Mover `apps/web/src/db/` a `packages/db/`? | Antes de Sprint 2 |
| Workers | BullMQ en Redis vs in-process simple | Sprint 2 |
| Excel parser | `xlsx` (SheetJS) vs `exceljs` | Sprint 2, issue #19 |
| Offline drafts | Dexie vs `idb` (vanilla) | Sprint 2, issue #26 |
| Fragmentación | librería `compromise` vs custom | Sprint 2 |

---

## 11. Convenciones de commit

Conventional Commits en español:
- `feat(scope): descripción`
- `refactor(scope): descripción`
- `chore: descripción`

Scope común: `(admin)`, `db`, `wizard`, `segmentation`, `packages`.

---

## 12. Cosas que NO hacer

- ❌ No tocar `gh-pages` (es el mockup publicado)
- ❌ No usar `pnpm` con workspaces nativos para `better-sqlite3` (causa OOM en webpack). Por eso el schema está duplicado en `apps/web/src/db/`.
- ❌ No usar server actions directamente desde client components sin `revalidatePath`
- ❌ No crear UI sin pasar por la pantalla de `view-dimensions` del mockup (es la referencia visual)

---

## 13. Cuando me haces una pregunta, este es el orden mental

1. ¿Está en las HU (H0-H21)? Si sí, cito la HU exacta.
2. ¿Está en `docs/ROADMAP.md` o `docs/ARCHITECTURE.md`? Si sí, cito.
3. ¿Es un refactor del mockup (que ya decidiste)? Si sí, sigo el modelo.
4. Si no: pregunto antes de inventar.
