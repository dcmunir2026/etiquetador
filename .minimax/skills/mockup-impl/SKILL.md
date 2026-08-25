---
name: mockup-impl
description: |
  Implement Etiquetador features that already have a mockup. Use when the
  user asks to build / fix / adjust a view that exists in
  `mockup/views/`, or asks to attack a GitHub Project issue that maps to a
  view (see `references/view-issue-map.md`). Triggers: "implementa #N",
  "haz la vista de X", "ajusta el wizard", "deja view-dimensions como el
  mockup", or any phrasing that combines a feature with a reference to
  the mockup. Do NOT use for back-end / DB / infra work, or for fixes
  that don't touch a view.
---

# mockup-impl — implement a feature against the extracted mockup

## Sources of truth (in this order)

1. `mockup/views/INDEX.md` — view ↔ issue ↔ current-implementation map.
2. `mockup/views/view-<name>.html` — the target view's HTML, already
   extracted from the gh-pages monolith by the `chore/mockup-extract`
   branch (PR #48).
3. `mockup/overlays/<name>-overlay.html` — modals that live as siblings
   to the view, not inside it.
4. `mockup/css/view-shared.css` + `view-styles.css` + `overlay-styles.css`
   — the global + component + modal CSS, split by bucket.
5. `references/view-issue-map.md` — which view to read for which issue,
   when `mockup/views/INDEX.md` is not enough.

The 3,115-line `mockup/index.html` is **not** a source of truth at
runtime — it is the regenerate-on-demand artifact of
`scripts/extract_mockup.py`. Re-grepping it is the anti-pattern this
skill exists to prevent.

## Procedure — 9 steps, gate at step 5

1. **Locate the view.** `grep -nE '<view-name>|<issue-number>' mockup/views/INDEX.md`
   (or use the map in `references/view-issue-map.md`). Identify the
   view file(s) + the overlay file if it's a modal-driven feature.

2. **Read only that view + its CSS.** Open the view HTML, the
   overlay (if any), and the relevant CSS bucket. Do **not** open
   other views even if they look related — they will be a separate
   ticket. **Do not re-grep `mockup/index.html`**, the 3,115-line
   monolith — it exists only as a regenerate target for
   `scripts/extract_mockup.py`.

3. **Diff against current code.** For each UI element in the mockup
   that the user wants, find or mark the corresponding code:
   - Route: `apps/web/src/app/(admin)/<route>/page.tsx`
   - Components: `apps/web/src/app/(admin)/<route>/_components/*`
   - Server actions: `<route>/actions/*`
   - Schema: `apps/web/src/db/schema.ts`, `packages/db/src/schema.ts`
   - CSS: `apps/web/src/app/globals.css` (or per-component CSS modules)
   Note explicitly: **existing**, **missing**, **partial**, **drift**.

4. **Plan in 4 lines max, in user-facing terms:**
   - Route + URL the user will visit.
   - New files (one line for the batch) + server actions (names only).
   - **Already there** vs. **new** (so the user sees re-use, not greenfield).
   - Mockup ↔ code gaps you will NOT close in this PR (and why).
   *(Branch name lives in the commit / PR header — not here.)*

5. **⏸ PAUSE. Show the plan, wait for user OK.**
   Do not start editing. If the user says "go" or corrects the plan,
   proceed. If they add scope, fold it in and re-show.

6. **Implement.** After each file:
   - Visual check: open the dev server route, compare structure to the
     mockup HTML.
   - Schema check: if you touched a Zod schema, add a unit test in the
     matching `actions.test.ts` (the project pattern is colocated
     Vitest).

7. **Verify all of:** `pnpm -F web typecheck` (clean) · `pnpm -F web test`
   (all green) · `curl -b <jar> http://localhost:3000/<route>` returns
   200 (or 307 to /login, expected) · re-curl the page and grep for at
   least one mockup class that proves the new component is wired.

8. **Commit + push + open PR.** One topic per commit. PR body must list
   the issues closed (`Closes #N`), the view file used as source of
   truth, and a screenshot or curl snippet of the rendered page.

9. **Report back to the user** with: PR link, files changed, the
   mockup-vs-code diff that was closed, the gaps intentionally left
   open.

## Anti-patterns (each is a rework trap seen in the project)

- ❌ Re-grepping `mockup/index.html` instead of `mockup/views/...`.
- ❌ Re-implementing an existing component "from scratch" because the
  current code looked unfamiliar.
- ❌ Skipping step 3 (the diff) and coding from memory of the mockup.
- ❌ Skipping step 5 (the pause) and presenting a finished PR that
  needs rework.
- ❌ Bundling multiple views into one PR. Each view = one PR.
- ❌ Changing CSS class names that match the mockup (e.g. `tax-card`).
  Future agents grep for those names.
- ❌ Inventing a database column the user hasn't approved. Flag
  schema drift as a question, not a silent change.

## Failure handling

- **Step 1 has no match** → the issue isn't yet in `mockup/views/INDEX.md`.
  Ask the user to confirm which view (or "none — build from spec only"),
  then add the missing row to INDEX.md before proceeding.
- **Step 3 reveals scope larger than one PR** → propose slicing the
  work into 2-3 PRs, get user OK, do them serially.
- **Step 6 reveals a structural mismatch with the mockup** → stop,
  surface the mismatch to the user with the diff. Do not silently
  re-shape the mockup or the code.
- **Step 7 fails** → fix before opening the PR; never push a red build.
