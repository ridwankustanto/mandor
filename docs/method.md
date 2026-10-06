# Method

Nine phases. Each one is a command, a structured output, and a gate. The gate is a row
in `project.db` with a name attached to it, not a feeling that we probably discussed it.

```
intent -> discover -> spec -> flows -> design -> build -> edit -> ship -> learn
   |                                                                        |
   +---------------------- change requests ---------------------------------+

lite:  intent -> build -> edit -> ship -> learn
```

The loop is not a line. `learn` feeds the next `intent`, and a change request can enter
at any point without pretending the earlier phases never happened.

## The phases

| Phase | Command | Question it answers | Gate closes when |
|---|---|---|---|
| intent | `/pm-new` | What are we building and how will we know it worked | The agent restates the objective and you confirm it |
| discover | `/pm-discover` | What already exists, what is hard, what could kill this | You accept the risk register and the adopt/avoid list |
| spec | `/pm-spec` | What epics and stories, in what order | You approve the breakdown and the M0 cut line |
| flows | `/pm-flows` | How it behaves, including every state | Flows and state inventory reviewed, per epic |
| design | `/pm-design` | What it looks like | Design system approved, then each screen approved |
| build | `/pm-build` | Does it work | Each epic's plan approved, then milestone tasks done and reviewed |
| edit | `/pm-edit` | Is it good, or only done | Every delivered epic played as a user, fixed, approved by a named editor |
| ship | `/pm-ship` | Is it safe to release | Checks green, deployed, smoke tested |
| learn | `/pm-feedback` | What did reality say | Every feedback item triaged |

`/pm-change` runs at any point and belongs to no phase.
`/pm-status` answers where things stand and never changes anything.

## Gates are hard blocks

`./pm phase next` refuses to advance while the current phase has an unapproved gate. The
agent is told to refuse too, and to name the gate rather than working around it.

You can always override, and the override is recorded:

```bash
./pm gate skip design "shipping the internal preview, will redo the checkout screen after"
```

Skipping is allowed. Skipping invisibly is not. The dashboard shows every skip.

## Traceability is the whole point

Work is one tree, and everything else hangs off it.

```
milestone M0
  L0 epic EPIC001 -> Flow -> Screen -> Design approval
       |
       +-> L1 story STORY001 -> Test run -> verified
              |
              +-> L2 task TASK001 -> Commit
                     |
                     +-> L3 sub-task SUB001
       |
       +-> ADR

Feedback -> Change request -> updates stories, TRD, ADRs, screens
```

A milestone groups one or more epics, because a milestone is a target, not a bucket of
tasks. Only epics and stories get documents; tasks carry a description.

Every node has an ID, a status and a parent, so questions like these are one query rather
than an afternoon of reading:

- Is STORY004 actually shipped, and what verified it
- Which screens still have no approval
- What did we decide about auth, and what did we reject
- Which epic attracts the most bug reports

`./pm check` enforces the links that matter: no work item without a parent, no epic
outside a milestone, no epic nobody broke down, no parent closed above an open child, no
story marked verified without a passing test naming it, no stale screen approval, no open
gate on the current phase.

## What is deliberately not here

No sprints, no velocity, no story points, no time tracking, no Jira sync, no server, no
web write path. If this ever needs a running backend, it went wrong.

## Why an edit phase

The quality filter used to be spread through the process: twenty ideas, staff one, poke
and prune it as it grows. With AI we can build all twenty in a week, so the filter moves
to after the build, where saying no is harder. Someone has to own it. `/pm-edit` is that
someone's job: play it as a user, write the fix list, push it to complete, then let an
adversarial critic attack it against `standards/point-of-view.md`.

`./pm check` fails once the project is past edit if a delivered epic has no approved edit
gate. Tests prove it works. The edit pass proves it is good.

## Standards are a folder, not a section

`standards/` holds the point of view, the tokens, the patterns and the guardrails. It is
separate from `docs/` because it is not prose about the product, it is the thing every
agent building the product must apply, including one working inside the code repo.
`./pm link` points that repo at it, and `./pm context <CODE>` serves the parts that
matter for one task at the moment the task starts.

## Two rules of thumb

**Small project.** Use lite: `./pm init "<name>" --lite`, or `./pm mode lite` later. It
keeps the point of view and the edit pass, and drops discover, spec, flows and design.
Right for a one or two session build, a prototype, an internal tool for one person.
`./pm mode full` upgrades when it turns into a real product.

**Existing project.** Run `/pm-new` to capture intent, then `/pm-spec` to reverse engineer
epics and stories from what already exists, then start using gates from the current phase
forward. Do not backfill history you do not have.
