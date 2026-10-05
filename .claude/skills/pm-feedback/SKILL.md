---
name: pm-feedback
description: Phase 7, Learn. Pull post-release signal from GitHub issues and other channels into the feedback table, then triage every item into a change request, a new story, a fix task, or wontfix with a reason. Use when the user says "/pm-feedback", "check the issues", "what are users saying", "triage feedback", or after a release.
---

# /pm-feedback: close the loop back into the backlog

Shipping opens the next turn. Signal that stays in a GitHub tab is not signal.

## 1. Pull

```bash
gh issue list --state open --limit 100 \
  --json number,title,body,labels,createdAt,author
```

Import each one. `external_id` is what keeps re-runs from duplicating:

```bash
./pm add feedback source=github external_id=<number> kind=<bug|request|praise|confusion> \
  title="<title>" body="<first 500 chars>" status=new
```

Other channels are equally valid signal, and get the same treatment:
`source=telegram`, `source=support`, `source=user` for something said directly,
`source=analytics` for a metric that moved.

Before importing, check what is already there:

```bash
./pm q "SELECT external_id FROM feedback WHERE source='github'"
```

## 2. Triage, every item, no backlog of untriaged

Each item lands in exactly one of four places.

| Read | Action |
|---|---|
| The product does not do what it promised | a `fix` task under the owning story |
| A new thing the product should do | a new story under the right epic, via `/pm-spec` |
| The product should work differently than specified | `/pm-change`, because the spec is what is wrong |
| Not for us, or not now | `wontfix` with a written reason |

```bash
./pm set FB003 status=linked item=STORY002
./pm task title="fix: <thing>" parent=STORY002 type=fix
./pm set FB007 status=wontfix
```

The reason for a `wontfix` goes in the GitHub issue reply too, not just the database.
Someone wrote that issue.

## 3. Look for the pattern, not just the items

Five issues about the same screen are not five bugs, they are one design problem.
Before closing triage, ask:

- Which epic or screen collects the most feedback
- Which story is being contradicted by real usage
- What did the risk register in `/pm-discover` predict, and did it land

A pattern becomes a change request, not five tasks.

## 4. Feed the next turn

Confirmed patterns become the next milestone's intent. Say this explicitly to the user
with a form: here is what the signal says, here are two or three things we could do next,
which one. Their call, informed by evidence rather than by whoever complained loudest.

```bash
./pm add milestone name="<next outcome>" goal="<what is true when this lands>" status=planned
```

## Rule

Never close feedback silently and never let `status=new` accumulate. Run:

```bash
./pm q "SELECT count(*) AS untriaged FROM feedback WHERE status='new'"
```

`./pm status` surfaces that count, and a growing number there means the loop is broken.
