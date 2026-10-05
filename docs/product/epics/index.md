# Epics

An epic is a slice of product big enough to be worth a milestone conversation, and small
enough that one person can hold it. It belongs to exactly one milestone.

One file per epic. Copy `../../_templates/epic.md`, name it `EPIC001-<slug>.md`, link it
here, and record the path so the dashboard can open it:

```bash
./pm epic title="<name>" milestone=M0 doc_path=docs/product/epics/EPIC001-<slug>.md
```

Status lives in `project.db`, never in this file:

```bash
./pm tree
./pm q "SELECT code, title, status, milestone FROM work_item WHERE level=0 ORDER BY code"
```

| Code | Epic | Milestone | Doc |
|---|---|---|---|
| | | | |
