# Decisions

One file per decision, numbered, immutable once accepted. Copy `../../_templates/adr.md`.

A decision that turns out wrong is never edited. Write a new ADR, mark the old one
superseded, and keep both. The record of why we once thought otherwise is the value.

```bash
./pm q "SELECT code, title, status, supersedes FROM adr ORDER BY code"
```

| ADR | Decision | Status |
|---|---|---|
| | | |
