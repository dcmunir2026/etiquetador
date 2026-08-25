# Mockup views (gh-pages reference)

Each view below was extracted from `gh-pages/index.html` once.
Use these files as the source of truth when implementing a
feature — don't re-grep the original HTML each time.

| View | Issue(s) | Status |
| --- | --- | --- |
| [view-dimensions](view-dimensions.html) | 15 (UI dimension editor) + 18 (dimension CRUD) | ✗ not started (the wizard in the app is from a Figma screenshot, not this view) |
| [view-discrepancias](view-discrepancias.html) | 28 (inconsistencies worker) + 29 (discrepancy report) | ✗ not started |
| [view-kappa](view-kappa.html) | — (kappa — backlog) | ✗ not started |
| [view-login](view-login.html) | — (no issue — auth shell) | ✓ done (#3) |
| [view-paquetes](view-paquetes.html) | 23 (divide corpus into packages) + 24 (assign mirror pairs) + 30 (package grid) | ✗ not started |
| [view-reporte](view-reporte.html) | — (reporte — backlog) | ✗ not started |
| [view-roles](view-roles.html) | 5 (user invitation + roles) + 8 (user management per project) | ✓ done (#5, #8 simplified — no team grouping yet) |
| [view-segmentation](view-segmentation.html) | 17 (UI segmentation config) + 21 (worker segmentation) | ✗ not started |
| [view-tagging](view-tagging.html) | 25 (annotation screen) + 26 (offline draft) + 27 (keyboard shortcuts) | ✗ not started |
| [view-taxonomies](view-taxonomies.html) | 15 (UI dimension editor) + 18 (dimension CRUD) | ✓ done (#15, #18 — tax-card styling aligned) |
| [view-taxonomy-groups](view-taxonomy-groups.html) | — (no issue) | ~ partial (global catalog exists at /taxonomias but not the per-project assignment) |
| [view-upload](view-upload.html) | 19 (Excel import) | ✗ not started |
| [view-validacion](view-validacion.html) | — (validación cualitativa — backlog) | ✗ not started |

Re-run `python3 scripts/extract_mockup.py` to regenerate from a
newer `mockup/index.html` (pull it with
`git show origin/gh-pages:index.html > mockup/index.html`).
