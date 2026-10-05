# Docs

Prose lives here. State lives in `project.db`. Rules live in `CLAUDE.md`.

The split matters: markdown is good at *why* and bad at *status*. A database is good at
*status* and bad at *why*. Nothing is stored in both.

## Map

| Path | Answers | Shape |
|---|---|---|
| [`method.md`](method.md) | How we build, phase by phase | one file |
| [`product/overview.md`](product/overview.md) | What the product is | one file, stays short |
| [`product/epics/`](product/epics/index.md) | What each slice of product is for | one file per epic |
| [`product/stories/`](product/stories/index.md) | What a user gets, and what verifies it | one file per story |
| [`product/screens/`](product/screens/index.md) | What each screen shows and when | one file per screen |
| [`../standards/`](../standards/point-of-view.md) | Who we are, how it looks, the rules every agent applies | point of view, design system, tokens, patterns, guardrails |
| [`engineering/architecture.md`](engineering/architecture.md) | How the system is shaped | one file, stays short |
| [`engineering/trd/`](engineering/trd/index.md) | How each area is built | one file per area |
| [`engineering/adr/`](engineering/adr/index.md) | Why we decided what we decided | one file per decision |
| [`_templates/`](_templates/) | Starting points for the above | copy, do not edit in place |

Application code is not in here. It lives in `../code/`, its own git repo, linked with
`./pm link code`. This directory only describes it.

## The work tree

Work is one tree, four levels deep, and only the top two get documents.

```
milestone M0
  L0 epic     EPIC001   a slice of product        doc: product/epics/
    L1 story  STORY001  what a user gets          doc: product/stories/
      L2 task     TASK001   a unit of build work      description field
        L3 sub-task SUB001    a slice of a task         description field
```

Tasks and sub-tasks carry a `description` in the database rather than a file. A file per
task is three hundred stubs nobody reads.

## Why the directories

A single `prd.md` works for about a month. Then it is 900 lines, every agent session pays
to load the whole product to work on one corner, and nobody edits it because the edit
feels like a project.

One file per epic, per story, per area, per decision keeps every edit small enough to
actually happen. The two helicopter files stay short on purpose and link down.

If a focused file passes roughly 300 lines, split it and say so.

## Front matter

Every focused doc opens with a block so tooling can find it:

```
---
code: STORY001
parent: EPIC001
status: done
updated: 2026-08-14
---
```

## Where state lives instead

Anything with a status, a link, or a timestamp is in `project.db`. Ask it:

```bash
./pm status
./pm tree
./pm q "SELECT code, title, design_status FROM screen WHERE item='EPIC001'"
```

Never copy a status into a markdown file. It will be wrong within a week. The dashboard
renders every file here, so a doc that links to the database beats a doc that repeats it.
