# Roadmap

**Target MVP delivery: 4 weeks (2 sprints × 2 weeks).**

| Sprint | Weeks | Focus | User stories |
|---|---|---|---|
| **S1** | W1–W2 | Multi-project core + auth + roles | H0, partial H6, partial H7 |
| **S2** | W3–W4 | Config + ingest + labeling MVP | H1, H2, H6, H7, H8, H9, H10, H11, H12, partial H15 |

Full backlog (S3+) — quantitative validation, qualitative validation, Kappa,
XAI, exports — is documented in [BACKLOG.md](./BACKLOG.md) and will be
prioritized after the MVP demo.

## Sprint 1 — Multi-project core

**Goal**: a super admin can create projects, invite users, assign roles,
and switch between projects. Auth works. Schema is multi-tenant.

### Issues (planned)

1. **#1** Set up Next.js 14 app with App Router, TypeScript, Tailwind
2. **#2** Set up Drizzle ORM with PostgreSQL multi-tenant schema
3. **#3** Set up Auth.js (NextAuth v5) with email + password
4. **#4** Database schema: `projects`, `users`, `roles`, `permissions`,
   `project_users`
5. **#5** Server Actions: create / edit / archive project
6. **#6** Server Actions: invite user + assign to project with role
7. **#7** UI: project list (central admin)
8. **#8** UI: project creation form
9. **#9** UI: user list per project + role assignment
10. **#10** UI: switcher between projects (top bar)
11. **#11** Audit log table + basic middleware
12. **#12** Docker Compose verified for local dev
13. **#13** CI: GitHub Actions green on push to main

### Definition of Done (Sprint 1)

- `pnpm dev` boots Postgres + Redis + MinIO + Meilisearch + Next.js
- Sign up, log in, log out works
- A super admin can create a project, invite 2 users, assign them
  different roles
- A regular user sees only their assigned projects
- Switching projects works without re-login
- All TypeScript strict, all tests green, CI green

## Sprint 2 — Configurable labeling MVP

**Goal**: a project admin can configure the project's dimensions and
intensity scales; ingest an Excel; divide into mirror packages; an
annotator can log in, open a fragment, label it on the configured
dimensions, and submit the package.

### Issues (planned)

14. **#14** Database schema: `dimensions`, `dimension_values`,
    `intensity_scales`, `intensity_levels`, `segmentation_configs`
15. **#15** UI: dimension editor (name, description, scale, categories)
16. **#16** UI: intensity scale editor (2/3/5/Likert/free)
17. **#17** UI: segmentation config (tokens / words / sentences / paragraphs)
18. **#18** Server Actions: CRUD on dimensions, scales, segmentation
19. **#19** Excel import endpoint (`.xlsx`, `.csv`) + column mapping
20. **#20** Worker: deduplication by configurable pivot column
21. **#21** Worker: segmentation (respects sentence/paragraph boundaries)
22. **#22** UI: ingest dashboard (file upload, mapping, preview, dedupe stats)
23. **#23** Server Actions: divide corpus into packages
24. **#24** Server Actions: assign mirror package pairs
25. **#25** UI: annotation screen (fragment + context + configured dimensions)
26. **#26** UI: local draft via IndexedDB (Dexie.js)
27. **#27** UI: keyboard shortcuts (←/→, S, Enter)
28. **#28** Server Actions: submit package, create immutable snapshot (v1, v2…)
29. **#29** Worker: detect inconsistencies between mirror packages
30. **#30** UI: discrepancy report per dimension
31. **#31** UI: package grid + per-fragment status
32. **#32** Tests: unit (Vitest) for segmentation + dedupe + Fleiss stub
33. **#33** Tests: e2e (Playwright) for full labeling flow
34. **#34** Docs: user guide for super admin + annotator

### Definition of Done (Sprint 2)

- A project admin can configure 5+ dimensions, each with its own scale
- A 1.000-row Excel can be ingested, deduped, segmented
- Mirror packages can be created and assigned
- An annotator can label 50 fragments, close the browser, reopen,
  continue from the draft
- Submitting creates a versioned snapshot
- Discrepancies between two mirror annotators are detected and listed

## Out of MVP (Sprint 3+)

- Qualitative validation (H18, H19) + sample selection
- Fleiss Kappa (H21) with full statistical library
- Reject-and-resubmit workflow with threshold (H16)
- Reporting + Word export (H17)
- Consolidation + final dataset (H20)
- API for LLM Judge consumption
- XAI module (T4 of the DCM proposal)
