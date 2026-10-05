---
status: draft
updated: YYYY-MM-DD
---

# <Project Name>

Helicopter view. Everything here fits on one screen. Detail lives one level down in
[`epics/`](epics/index.md) and [`stories/`](stories/index.md), and status lives in `project.db`.

Filled by `/pm-new`, kept honest by `/pm-change`.

## Objective

<One or two sentences. What this is, for whom. Written after the agent restated it and
you confirmed the restatement, so it should read as settled rather than exploratory.>

## Success signal

<Observable and specific. An event that either happens or does not, or a number with a
direction and a timeframe. Not "users like it".>

## Non-goals

The three things this deliberately does not do. In `/pm-spec` these become `constraint`
stories with `priority=wont`. Nobody builds them, and they are what scope creep gets
measured against.

- <non-goal>
- <non-goal>
- <non-goal>

## Users

| Who | Situation they are in | What they do today instead |
|---|---|---|
| | | |

## Epics

Current list, generated from the database. Do not hand maintain the statuses here.

```bash
./pm tree
./pm q "SELECT code, title, status, milestone FROM work_item WHERE level=0 ORDER BY code"
```

| Code | Epic | Milestone | One line |
|---|---|---|---|
| | | | |

## Constraints

Platform, brand, compliance, budget, timeline. The things that were true before we
started and will still be true if we change our minds about everything else.

- <constraint>

## Where to go next

- How it looks: [`standards/design-system.md`](../../standards/design-system.md), and the [point of view](../../standards/point-of-view.md) it serves
- How it is built: [`../engineering/architecture.md`](../engineering/architecture.md)
- Why it is built that way: [`../engineering/adr/`](../engineering/adr/index.md)
- How we work: [`../method.md`](../method.md)
