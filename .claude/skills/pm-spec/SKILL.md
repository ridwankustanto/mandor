---
name: pm-spec
description: Phase 2, Spec. Turn intent and research into the work tree, epics and stories under milestones, one doc per epic and per story, and refuse to close while an epic has no stories or sits in no milestone. Use after /pm-discover, when the user says "/pm-spec", "break this down", "define the epics", "what are the stories", or "plan the milestones".
---

# /pm-spec: build the work tree

This is the phase that kills drift. Two rules, both enforced by `./pm check`:

**Every epic belongs to a milestone. Every epic that is past backlog has stories.**

## 1. Milestones first

A milestone is a target, not a bucket. It groups one or more epics and it is done when
something is true for a user, not when a task count hits zero.

```bash
./pm add milestone name="<outcome>" goal="<what is true when this lands>" status=active
```

M0 is the smallest thing that is real. Ask the user to confirm the M0 cut line with a
form, offering two or three cut lines and what each one buys and costs. This is the most
consequential call in the phase, so do not make it alone.

## 2. Epics

An epic is a slice of product big enough to be worth a milestone conversation and small
enough that one person can hold it. It is not a layer, not a component, not a sprint.

```bash
./pm epic title="<slice of product>" milestone=M0 area="<area>" priority=must \
  doc_path=docs/product/epics/EPIC001-<slug>.md
```

Copy `docs/_templates/epic.md` to that path. Keep `docs/product/epics/index.md` current.

## 3. Stories

A story is what a user gets, stated as an outcome. It is also the level tests speak
about, so write it as something that is either true or false about the shipped product.

```bash
./pm story title="A user can capture a note in under two seconds" parent=EPIC001 \
  kind=functional priority=must doc_path=docs/product/stories/STORY001-<slug>.md
```

Three kinds, and all three are real stories:

- `functional`, the product does something
- `nonfunctional`, a budget or quality bar it must hold
- `constraint`, something it must never do

Non-goals are `constraint` stories with `priority=wont`. Nobody builds them. They exist so
scope creep gets caught, and `./pm check` knows not to expect tasks under them.

Copy `docs/_templates/story.md` per story. Tasks come in `/pm-build`, not here.

Every `functional` story gets an independent test: one line saying how it can be checked
on its own and what that alone delivers. If a story only makes sense once two others ship,
it is not a story yet, merge or reslice it. Acceptance lines are Given, When, Then.

Stories say what and why, never how. No framework, library, table or endpoint names. Those
belong to the plan in `/pm-build`, and a spec that names them has already made a decision
nobody approved.

## 4. Clarify, with a budget

Scan each epic and its stories against these categories, and mark each clear, partial or
missing: scope and behaviour, data and entities, interaction flow, integrations, edge cases
and failure, constraints and tradeoffs, terminology, what done looks like, leftover
placeholders.

Then ask, **at most five questions per epic, one at a time**, with `AskUserQuestion`.
Highest impact first: scope, then security and privacy, then experience, then technical.
Put your recommended option first and say in one line why the answer matters. Write each
answer into the doc as soon as it comes back, not at the end.

Everything else gets a sensible default from you, written under **Assumptions** in the
epic doc, so the user can read every guess in one place and overturn it. A question that
did not make the cut is an assumption, not a silent gap. An open question that survives
the budget stays under Open questions and blocks the gate.

## 5. Read the intent back into the tree

Every objective, success signal and non-goal captured in `/pm-new`, and every finding from
`/pm-discover` that changed scope, has to land somewhere in this tree. Walk them one by
one. Anything that fits nowhere is either a missing epic or was never real, and that is a
question for the user, not a judgement call for you.

Do not quietly invent an epic to absorb a stray objective. Ask with a form.

## 6. Fill the architecture helicopter view

`docs/engineering/architecture.md`: the shape of the system, who owns which state, and the
areas that will each get a TRD file later. Stay short. Detail belongs in
`docs/engineering/trd/<area>.md`.

## 7. Grade it before you ask for approval

Before you show the tree, grade every epic doc and its stories against this list. Rewrite
what fails and grade again, at most three rounds. Whatever still fails goes to the user
with the gate, named, not buried.

- [ ] No implementation details: no framework, library, table or endpoint names
- [ ] Every acceptance line is observable and testable, no adjectives
- [ ] Every functional story has an independent test
- [ ] Edge cases are named, including first run, failure halfway, and two at once
- [ ] Scope says what is out, not just what is in
- [ ] Every guess is written under Assumptions
- [ ] No open question left, or the ones left are the user's call and listed

Put the result in the gate note, for example "7/7 on all epics" or "EPIC003 fails edge
cases, accepted because ...".

## Close the gate

```bash
./pm tree            # read it back, out loud, before you approve anything
./pm check           # epics with no milestone or no stories surface here
./pm gate approve spec "epic and story breakdown approved, M0 is <cut line>"
./pm phase next
```

If `./pm check` fails, fix it. Do not approve around it.
