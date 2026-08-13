# Backlog (post-MVP)

Items below are out of scope for the 4-week MVP. They will be
prioritized after the Sprint 2 demo.

## Validation

- **H14** Receive labeling files from two annotators
- **H15** Detect quantitative inconsistencies (full implementation,
  not MVP stub)
- **H16** Reject and resubmit on threshold breach
- **H17** Generate inconsistencies report (Word export)
- **H18** Select qualitative sample (random 1..k, % configurable)
- **H19** Validate labeling quality (manual screen)
- **H21** Compute Fleiss Kappa per dimension + global, send report
  via Gmail/Outlook/SMTP

## Consolidation

- **H20** Consolidate final dataset with traceability metadata
- Export formats: CSV, JSON, JSONL, Parquet
- Public API for LLM Judge consumption (T3 of the DCM proposal)

## XAI / explainability

- Trace per label: which annotator, which validator, which version,
  which timestamp, which evidence
- Evidence panel: textual citations + `[REP:...]` references
- XAI dashboard: per-decision justification
- Public explainability API (T4 of the DCM proposal)

## Observability

- Structured logging (pino)
- Error tracking (Sentry)
- Metrics + traces (OpenTelemetry → Grafana)
- Job monitoring (Bull Board)

## Security / compliance

- Audit log: who-did-what on every mutation
- Row-level data export restrictions per role
- Encryption at rest for uploaded files
- GDPR right-to-erasure support
