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
| **`main`** | App real Next.js 14 + Drizzle | ✅ las 17 vistas del mockup, contra BD |
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
| BD local | PostgreSQL 16 vía docker-compose (etiquetador-postgres:5433) | ✅ |
| BD prod | PostgreSQL + Drizzle (target) | ⏳ |
| ORM | Drizzle 0.45 | ✅ |
| Estilos | CSS variables (design tokens propios) | ✅ |
| Métricas | Fleiss kappa + discrepancias, calculadas en vivo | ✅ |
| Segmentación | Implementación propia, sin dependencias | ✅ |
| Parser de corpus | CSV/TSV propio; `.xlsx` pendiente | 🟡 |
| Auth | Auth.js v5 (Credentials, JWT) | ✅ |
| Email | Resend (magic-link en invitaciones) | ✅ |
| Workers | BullMQ + Redis | ⏳ no iniciado |
| Storage | MinIO (archivos Excel, exports) | ⏳ no iniciado |
| Búsqueda | Meilisearch | ⏳ no iniciado |
| Drafts offline | Dexie.js / idb (cliente) | ⏳ |

---

## 4. Estructura del monorepo

```
etiquetador/
├── apps/
│   └── web/src/
│       ├── app/
│       │   ├── (app)/
│       │   │   ├── layout.tsx        # Shell: sidebar + topbar
│       │   │   ├── page.tsx          # ruta raíz (acepta ?view=)
│       │   │   ├── [...slug]/        # rutas con nombre (/dimensiones, …)
│       │   │   └── render-view.tsx   # carga datos y renderiza la vista
│       │   ├── actions/
│       │   │   ├── catalog.ts        # dimensiones, escalas, taxonomías
│       │   │   ├── workflow.ts       # corpus, equipos, paquetes, anotar, validar
│       │   │   └── reads.ts          # lecturas bajo demanda (modales)
│       │   ├── api/active-project/
│       │   └── globals.css           # design tokens del mockup
│       ├── components/
│       │   ├── Shell / Sidebar / Topbar
│       │   └── views/                # una por pantalla + shared.tsx
│       ├── db/                       # schema + client (inlined)
│       └── lib/
│           ├── cascade.ts            # skip logic
│           ├── metrics.ts            # Fleiss kappa, discrepancias
│           ├── segmentation.ts       # partido de textos
│           ├── csv.ts                # parser CSV/TSV propio
│           ├── queries.ts            # read models por vista
│           ├── views.ts              # tabla ruta ↔ vista (fuente única)
│           └── auth.ts               # stub
├── packages/
│   ├── db/
│   │   ├── src/index.ts              # schema canónico (espejo del de web)
│   │   ├── init.ts                   # crea y siembra el catálogo
│   │   └── init-workflow.ts          # crea y siembra el flujo de trabajo
│   ├── shared/                       # vacío
│   └── ui/                           # vacío
└── docs/
```

⚠️ `apps/web/src/db/schema.ts` y `packages/db/src/index.ts` son **idénticos
a propósito** (workaround de webpack con bindings nativos en workspaces).
Si tocas uno, copia el otro.

---

## 5. Modelo de datos

**Decisión clave:** las **dimensiones son GLOBALES**, no por proyecto. Esto
permite reutilizarlas. Las **taxonomías** agrupan dimensiones (N:M) y se
asignan a proyectos.

```
users → projects → taxonomies → dimensions → dimension_values
                                     ↓
                            dimension_dependencies  (skip logic)
```

**23 tablas.** Catálogo (12, de `init.ts`):
`users`, `projects`, `project_members`, `intensity_scales`, `intensity_levels`,
`dimensions`, `dimension_values`, `taxonomies`, `taxonomy_dimensions`,
`project_taxonomies`, `segmentation_configs`, `audit_log`.

Flujo de trabajo (11, de `init-workflow.ts`):
`dimension_dependencies`, `corpus_uploads`, `fragments`, `teams`,
`team_members`, `packages`, `package_fragments`, `package_assignments`,
`annotations`, `qual_validations`, `qual_corrections`.

### Dependencias entre dimensiones (skip logic)

Una dimensión puede declarar **una** dependencia: se muestra solo cuando su
padre fue respondido con uno de los valores listados. La cascada se propaga:
si el padre queda saltado, el hijo también.

Un salto se guarda **explícitamente** (`annotations.skipped = 1`, `value NULL`),
no como fila ausente. Es deliberado: al medir acuerdo, «no se preguntó» es un
resultado comparable, y distinguirlo de «sin responder» es lo que permite
calcular Kappa sobre la cascada.

El motor vive en `apps/web/src/lib/cascade.ts` y es el mismo en cliente
(pantalla de etiquetado, grafo) y servidor (al guardar). La server action
**poda** las respuestas antes de escribir, así que nunca se persiste la
respuesta de una rama que dejó de aplicar.

### Métricas: todo se calcula, nada se almacena

No hay agregados persistidos. Discrepancias y Kappa se recalculan desde
`annotations` en cada petición (`apps/web/src/lib/metrics.ts`). Dos matices
que costaron entenderse y conviene no revertir:

- **Tasa de error = por valoración**, no por fragmento. El porcentaje de
  *fragmentos con algún desacuerdo* se satura: con 16 dimensiones roza el
  100% aunque el acuerdo real sea bueno. El umbral (12%) se aplica sobre la
  proporción de pares (fragmento × dimensión) en desacuerdo.
- **Kappa global = media ponderada de los kappas por dimensión.** Agrupar
  todas las dimensiones en un solo cálculo mezcla espacios de categorías
  distintos, hunde el acuerdo esperado por azar y devuelve un valor
  artificialmente alto (medimos 0,98 donde las dimensiones individuales
  estaban entre 0,30 y 0,82).

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

### Enrutado

Las rutas con nombre (`/dimensiones`, `/proyecto/roles`, `/etiquetar`…) las
sirve un catch-all, `app/(app)/[...slug]/page.tsx`, que traduce la ruta a una
vista con la tabla de **`src/lib/views.ts`**. `/` también acepta `?view=`.
Ambas entradas delegan en `app/(app)/render-view.tsx`, así que una pantalla se
comporta igual llegues por donde llegues.

`src/lib/views.ts` es la **única** fuente de la correspondencia ruta ↔ vista;
la importan tanto el Shell (que empuja rutas al pulsar el menú) como el
catch-all. Si añades una entrada al Sidebar, añade su ruta ahí: hay un test
(`src/lib/__tests__/views.test.ts`) que falla si un ítem del menú no tiene
ruta. Existe porque ya pasó: el Sidebar empujaba `/dimensiones` mientras la app
solo servía `/`, y todos los enlaces menos el dashboard daban 404.

### CSS / Design tokens
NO usamos Tailwind utility classes todavía. Usamos CSS variables en
`globals.css` que replican el mockup. Migrar a Tailwind completo es opcional.

---

## 7. Cómo correr localmente

**Node 22 o superior es obligatorio** (`engines: node >= 22`). Hay un
`.nvmrc` en la raíz. Postgres corre en Docker.

```bash
nvm use            # lee .nvmrc → Node 22
pnpm install

# Arrancar Postgres (solo la primera vez, o si el contenedor está caído)
docker compose up -d postgres

# Crear las tablas y sembrar datos (solo la primera vez)
cd packages/db
pnpm db:push                       # crea el esquema en Postgres
DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm init
DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm init:workflow
DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm seed:passwords
cd ../..

pnpm dev           # → http://localhost:3000
```

`apps/web/.env` ya apunta al Postgres local con la contraseña `etiquetador_dev`.
Si reinicias el contenedor, los datos persisten en el volumen `postgres_data`.

`init-workflow.ts` es idempotente — vacía y regenera solo las tablas de
flujo, respetando el catálogo. Usa un PRNG con semilla fija, así que los
datos son reproducibles. Genera 200 fragmentos, 4 equipos y ~7.800
anotaciones con desacuerdo calibrado por dimensión (hay un mapa
`DIFFICULTY` para que las métricas discriminen en vez de salir todas planas).

### Gotcha conocido: `pnpm install` falla por esbuild

El repo resuelve varias versiones de esbuild. Sus `bin/esbuild` empiezan
siendo shims idénticos y pnpm los deduplica con hardlinks al store; cuando el
postinstall de una versión sobrescribe el suyo *in place*, machaca el de otra
a través del hardlink compartido. El síntoma es:

```
esbuild postinstall: Error: Expected "0.28.2" but got "0.25.12"
```

y aborta la instalación entera. Solución:

```bash
pnpm install --ignore-scripts
cp node_modules/.pnpm/@esbuild+darwin-arm64@0.28.2/node_modules/@esbuild/darwin-arm64/bin/esbuild /tmp/eb
mv -f /tmp/eb node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild
```

Arreglo de fondo pendiente: fijar una sola versión de esbuild, o declarar
`pnpm.neverBuiltDependencies`.

## 8. Estado de las vistas

Las 17 vistas del mockup (`gh-pages`) están implementadas contra BD real.
La navegación es una sola página con `?view=`; el enrutado de datos vive en
`apps/web/src/app/(app)/page.tsx`, que carga solo lo que cada vista necesita.

| Vista | Lee de BD | Escribe |
|---|---|---|
| `dashboard` | ✅ proyectos, avance, Kappa | ✅ crear proyecto (Topbar) |
| `upload` | ✅ cargas previas | ✅ CSV/TSV → fragmentos segmentados |
| `taxonomies` (Dimensiones) | ✅ | ✅ wizard 5 pasos, archivar/restaurar |
| `taxonomy-groups` (Taxonomías) | ✅ | ✅ crear, editar dimensiones, archivar |
| `dimensions` (Taxonomías del proyecto) | ✅ | ✅ asignar/desasignar |
| `roles` | ✅ | ✅ invitar (vía magic link + email), rol, equipos y miembros |
| `paquetes` | ✅ | ✅ dividir corpus y asignar |
| `segmentation` | ✅ | ✅ guardar config (+ preview en vivo) |
| `tagging` | ✅ | ✅ anotar en cascada, enviar paquete |
| `discrepancias` | ✅ calculado | — |
| `discrepancias-equipos` | ✅ calculado | — (solo lectura, por diseño) |
| `graph-deps` | ✅ calculado | — |
| `quant-validation` | ✅ calculado | ✅ devolver paquete al equipo |
| `validacion` | ✅ | ✅ muestra, aprobar, corregir etiquetas |
| `reporte` | ✅ calculado | — |
| `kappa` | ✅ calculado | — |
| `login` | — | — (Auth.js v5 con credenciales) |
| `/invite/[token]` | ✅ lookup del token | ✅ crea contraseña + auto-sign-in |

**Sin implementar, y es deliberado:**
- **Parser de `.xlsx`.** La carga acepta CSV/TSV con parser propio
  (`lib/csv.ts`). Para Excel falta decidir SheetJS vs exceljs (§10). La vista
  lo dice explícitamente al soltar un `.xlsx`.
- **Exportar a Word y envío por email** en `reporte` y `kappa`: los
  formularios están, la acción no. Falta decidir proveedor.
- **Auth real.** Sigue el stub por cookie; `login` no autentica.

## 9. Próximos pasos (orden recomendado)

1. **Auth.js v5** — sustituir el stub de cookie. Es lo único que bloquea un
   despliegue real: hoy cualquiera es Marta R.
2. **Parser de Excel** — decidir SheetJS vs exceljs y conectar `.xlsx` en
   `UploadView` (el resto del pipeline de carga ya funciona).
3. **Exportador de reporte** a Word + envío por email.
4. **Unificar el schema duplicado** entre `apps/web/src/db/` y
   `packages/db/src/` (hoy son idénticos y hay que tocar los dos a la vez).
5. **Paginación** en las vistas que hoy listan todo: `tagging` carga bien,
   pero `discrepancias` trunca a 60 filas y las tablas de catálogo no paginan.
6. **Migraciones reales** con drizzle-kit: hoy el esquema se crea por SQL
   directo en `init.ts` / `init-workflow.ts`, lo cual no es versionable.

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
- ❌ El esquema está duplicado en `apps/web/src/db/schema.ts` y `packages/db/src/index.ts` (Next.js no resuelve bien el path desde `@etiquetador/db`). Si modificas uno, copia al otro.
- ❌ No usar server actions directamente desde client components sin `revalidatePath`
- ❌ No crear UI sin mirar antes el mockup de `gh-pages` (sigue siendo la referencia visual)
- ❌ No persistir agregados de acuerdo: se calculan desde `annotations` (ver §5)
- ❌ No usar Node 20: `engines` exige Node 22
- ❌ No lanzar `pnpm build` con el dev server corriendo: comparten `.next` y
  lo corrompen (todas las rutas pasan a 500 con `MODULE_NOT_FOUND` de
  `_document.js`). Si pasa: parar el dev server, `rm -rf apps/web/.next`, reiniciar.

---

## 13. Cuando me haces una pregunta, este es el orden mental

1. ¿Está en las HU (H0-H21)? Si sí, cito la HU exacta.
2. ¿Está en `docs/ROADMAP.md` o `docs/ARCHITECTURE.md`? Si sí, cito.
3. ¿Es un refactor del mockup (que ya decidiste)? Si sí, sigo el modelo.
4. Si no: pregunto antes de inventar.
