---
name: pm-change
description: The change valve. Any time an epic or story is added, cut or reshaped after its gate was approved, this computes the blast radius, shows it, and then updates the TRD, writes or supersedes an ADR, re-parents or cuts work items, and flags stale screen approvals. Use whenever scope changes mid-flight, when the user says "/pm-change", "actually let's also", "drop that feature", "change the flow", or when implementation contradicts the spec.
---

# /pm-change: absorb the change, keep the docs true

The product will change during design and during implementation. That is the process
working, not failing. What breaks a project is absorbing the change into the code while
the docs quietly go stale.

Run this the moment the shape of the product changes after its gate was approved.

## 1. Open the change

```bash
./pm add change_request origin=<design|build|feedback|user> \
  description="<what changes, in one sentence>"
```

Origin matters. A change that comes from feedback is evidence, a change that comes from
implementation is usually a spec bug, and a change that comes from the user mid-design is
taste. They are handled the same way but they mean different things over time.

## 2. Compute the blast radius

Do not guess it. Query it.

```bash
./pm tree EPIC001
./pm q "WITH RECURSIVE t(code) AS (SELECT 'EPIC001' UNION ALL
        SELECT w.code FROM work_item w JOIN t ON w.parent=t.code)
        SELECT w.code,w.level,w.title,w.status,w.doc_path FROM work_item w JOIN t ON w.code=t.code"
./pm q "SELECT code,name,design_status,doc_path FROM screen WHERE item='EPIC001'"
./pm q "SELECT code,title,status,doc_path FROM adr WHERE status='accepted'"
./pm q "SELECT code,title FROM feedback WHERE item='EPIC001'"
```

The recursive query is the point: a change to an epic reaches every story, task and
sub-task under it. Walking the tree by hand is how a task gets left pointing at something
that no longer exists.

Then read the docs that reference it: the feature PRD, the area TRD, any ADR whose
decision assumed the old shape.

Assemble the impact as a list the user can actually check:

- Stories now wrong, newly needed, or no longer worth building
- Epics affected, added, or cut, and any task under them that is now pointless
- Screens whose approval no longer matches the product
- Tasks to reopen, cut, or add
- ADRs that are now wrong and need superseding
- TRD sections that describe something that is no longer true

## 3. Show it before touching anything

Present the impact, then ask with `AskUserQuestion`: apply all of it, apply part of it,
or reject the change. Include the cost honestly, especially the screens that lose their
approval. A user who learns after the fact that three approved screens went stale will
stop trusting the system, and then it is dead.

```bash
./pm set CR001 impact_json='{"epics":["EPIC001"],"stories":["STORY004"],"screens":["SCR003"],"adrs":["ADR0004"]}'
```

## 4. Apply

In this order, so nothing is left dangling.

**Work tree.** Add, cut, or re-scope. A cut item is `status=cut`, never deleted, so the
history of what we decided not to do survives.

```bash
./pm story title="<new outcome>" parent=EPIC001 kind=functional source=CR001
./pm set STORY004 status=cut description="superseded by CR001"
```

A story cannot change level. If a story turns out to be a whole epic, cut it and create
the epic, and say so in the change request. Silent re-shaping is how a tree stops matching
the product.

**Epics.** Status, milestone, scope. Update that epic's own doc, and the docs of the
stories under it. Do not rewrite the product overview, that is exactly why these are
separate files.

**Screens.** Any approved screen whose behaviour changed goes stale, not silently approved:

```bash
./pm set SCR003 design_status=stale
```

`./pm check` will now fail until that screen is redesigned and reapproved. That is the point.

**ADRs.** A decision that is now wrong is never edited in place. Write a new one and
supersede the old, so the history of why survives.

```bash
./pm add adr title="<new decision>" status=accepted supersedes=ADR0004 \
  decision="<what>" why="<what changed>" alternatives="<what was reconsidered>" \
  doc_path=docs/engineering/adr/0007-<slug>.md
./pm set ADR0004 status=superseded
```

**TRD.** Edit the affected `docs/engineering/trd/<area>.md` in place. Area files exist so
this is a small honest edit rather than an intimidating rewrite that gets postponed.

**Tasks.** Reopen, cut, or add. Cut tasks are set to `done` only if they were actually
done, otherwise record the cut in the change request.

## 5. Close

```bash
./pm set CR001 status=applied applied_at=<iso date>
./pm check
```

Commit with the change code in the message so the history ties together.

## The rule

A doc that no longer matches the product is worse than no doc, because someone will
trust it. If you cannot update the docs in the same pass as the change, say so out loud
rather than leaving them wrong.
