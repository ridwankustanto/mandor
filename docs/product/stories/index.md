# Stories

A story is what a user gets. It is also the level tests speak about: a story reaches
`verified` only when a passing test run names it.

One file per story. Copy `../../_templates/story.md`, name it `STORY001-<slug>.md`:

```bash
./pm story title="<outcome>" parent=EPIC001 kind=functional \
  doc_path=docs/product/stories/STORY001-<slug>.md
```

Tasks and sub-tasks under a story do not get their own files. They carry a `description`
in the database, because a file per task is three hundred stubs nobody reads.

```bash
./pm ls story
./pm q "SELECT code, title, status, parent FROM work_item WHERE level=1 ORDER BY code"
```

| Code | Story | Epic | Kind | Doc |
|---|---|---|---|---|
| | | | | |
