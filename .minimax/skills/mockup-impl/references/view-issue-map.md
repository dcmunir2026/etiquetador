# View ↔ Issue map (companion to `mockup/views/INDEX.md`)

`mockup/views/INDEX.md` is the canonical, ever-updated map. This file
exists for two cases INDEX.md doesn't cover well:

1. The agent is unsure which view corresponds to a feature name that
   the user uses differently than the GH issue title.
2. The agent needs to know the implementation state of a view **at a
   glance**, without grepping the code.

## Quick reference (snapshot, may drift — INDEX.md wins)

| View file | Issue(s) | State (as of last merge to main) |
|---|---|---|
| `view-login.html` | #3 | merged (PR #44) |
| `view-dimensions.html` | #15, #16, #18 | merged in PR #47 (in review) |
| `view-taxonomies.html`, `view-taxonomy-groups.html` | — | not yet started |
| `view-roles.html` | #5, #8 | merged in PR #46 |
| `view-projects.html` (in `view-proyectos` group) | #4, #6, #7 | merged in PR #45 |
| `view-upload.html` | #19 | not yet started |
| `view-segmentation.html` | #17 | not yet started |
| `view-tagging.html` | #25, #26 | not yet started |
| `view-paquetes.html` | #23, #24, #30 | not yet started |
| `view-discrepancias.html` | #28, #29 | not yet started |
| `view-validacion.html` | #39 | not yet started |
| `view-reporte.html`, `view-kappa.html` | #40, #41 | not yet started |
| `overlays/tax-wizard-overlay.html` | (#15 modal) | merged in PR #47 |
| `overlays/custom-scale-overlay.html` | (#16 modal) | merged in PR #47 |
| `overlays/dimension-picker-overlay.html` | per-project dim assignment | not yet started |

## If the view is "not yet started"

The mockup is the contract. The user expects the implementation to
match it. If the user asks for a view that is "not yet started", this
is a green-field implementation — follow steps 1-5 of the skill
particularly strictly, because there is no existing code to diff
against and it's tempting to invent a different design.

## If a view is partially implemented (drift)

When the user says "ajusta X para que quede como el mockup", run the
diff in step 3 of the skill and propose a **list of deltas**, not a
re-write. Drift fixes are usually 1-3 files, not whole rewrites.

## When INDEX.md and this file disagree

INDEX.md is the source. Update this file to match.
