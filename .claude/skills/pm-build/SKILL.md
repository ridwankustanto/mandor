---
name: pm-build
description: Phase 5, Build. Break approved stories into tasks and sub-tasks, implement them, and let the git hook keep the tree honest. Use after /pm-design, when the user says "/pm-build", "start implementing", "break this into tasks", "what should I work on", or asks to build an approved story.
---

# /pm-build: tasks that stay true without anyone maintaining them

## 0. Where the code lives

Run `./pm q "SELECT code_path FROM project"`. If it is empty, ask with a form:

- **Nested `code/` (recommended):** its own git repo inside this folder, ignored by this
  repo. `git init code` (or clone an existing repo into `code/`), init the stack there,
  then `./pm link code`. That installs the commit hook, writes a block into its
  `CLAUDE.md`, gives it the session briefing and adds `/code/` to `.gitignore`.
- **Elsewhere:** an existing repo that must stay where it is. `./pm link <path>`, same
  result with absolute paths.
- **This repo:** commit code here directly. Fine for something tiny that will never split.

Never scaffold a stack the user has not chosen.

The code repo imports `standards/tokens.css`, copied or referenced by path, whichever
the stack prefers. Tokens never get retyped by hand.

## 1. Plan the epic before any task starts

**Lite mode** has no spec phase, so there is no tree yet. Make a thin one now: one
milestone, one epic per thing the user will notice, two to five stories under each.
Five minutes, not a phase. The edit pass needs epics to walk through. Lite skips the plan
gate below, but still fills the data model and interfaces before writing code.

**Full mode:** only epics that passed their design gate. Check first:

```bash
./pm tree
./pm gate list
```

The spec said what and why. The plan says how, once per epic, before code. It lands in
the epic's area TRD, `docs/engineering/trd/<area>.md`, not in a new document.

1. **Check the standards first.** Read `standards/guardrails.md` and `point-of-view.md`.
   Name any part of this epic that would break one, and either change the approach or
   write down why the exception is worth it.
2. **Data model from the stories.** Entities, fields, validation rules and state changes,
   each row naming the story that needs it. A table no story asks for does not get built.
3. **Interfaces.** Every endpoint, message, command or UI to backend contract this epic
   adds, agreed now. With both sides fixed, tasks on either side can run at once.
4. **Unknowns become ADRs.** Anything the plan cannot decide yet (a library, a limit, a
   storage choice) is researched now and written as an ADR, decision, why and
   alternatives, before code depends on it.
5. **Prove it end to end.** Fill that section of the epic doc: setup, the command or user
   action, what you should see. `/pm-edit` and `/pm-ship` run these steps.
6. **Check the standards again** against the finished plan. Designing the data model is
   where shortcuts sneak in.

Show the plan, then:

```bash
./pm gate open plan EPIC001
./pm gate approve plan --subject EPIC001 "<the one decision that shapes it>"
```

`./pm check` fails while any task under an epic is in progress without an approved plan.

## 2. Break stories into tasks

Then break each story down. A task is a unit of build work under exactly one story.

```bash
./pm task title="<verb first, one outcome>" parent=STORY001 type=impl owner=agent
./pm sub  title="<a slice of that task>" parent=TASK004
./pm set TASK004 blocked_by=TASK002
```

Types: `design`, `impl`, `test`, `infra`, `docs`, `fix`.

Rules for a good breakdown:

- One outcome per task. If the title needs "and", it is two tasks.
- Sub-tasks only when a task genuinely splits. Do not manufacture a third level.
- Every screen state from the inventory is covered by a task or explicitly deferred.
  Empty, loading and error states are tasks, not afterthoughts.
- Infra and test tasks exist from the start. They are not a phase at the end.
- `blocked_by` gets filled when it is real, so the board can show the critical path.
- A `constraint` story with `priority=wont` gets no tasks. It is a non-goal.
- Every other story in an active milestone gets at least one task. `./pm check` names the
  ones nothing builds.

## 3. Work

```bash
./pm set TASK004 status=in_progress
./pm context TASK004
```

`./pm context` prints the point of view, the chain from this task up to its epic, the
screens and their states, and the guardrails. Build from that, every task, even the
small ones. It is how standards reach the code at the moment they matter instead of
being a document the agent may or may not have read.

Then implement, in the code repo.

Climb the ladder, stopping at the first rung that holds: does this need to exist, does the codebase already
have it, does the stdlib or the platform cover it, is it one line, only then write it.
Reuse components from the design system and layouts from `standards/patterns/`. Never
build a second Button. Every color, size and radius comes from `tokens.css`.

Non-trivial logic leaves one runnable check behind. Not a suite, one check that fails if
the logic breaks.

## 4. Commit with the work item code

Put the code in the message and the post-commit hook does the rest: it stamps the sha and
moves the item to `review`.

```
feat: render the inbox empty state TASK004
```

That replaces "remember to update the board". Instructions get skipped, hooks do not.

## 5. Close upward, never downward

A parent cannot be closed while a child is open. `./pm check` fails on it, and that is
deliberate: it is the most common way a board starts lying.

```bash
./pm set SUB001 status=done
./pm set TASK004 status=done
./pm set STORY001 status=done      # only once every task under it is settled
```

`done` means built. `verified` is a separate claim, it belongs to `/pm-ship`, and it needs
a passing test run naming the story. Do not skip ahead to it, `./pm check` will catch it.

## 6. Decisions made while building

Implementation forces choices that design never surfaced. When one is load bearing, write
an ADR at the moment it is made, not at the end of the week:

```bash
./pm add adr title="<decision>" status=accepted decision="<what>" \
  why="<what forced it>" alternatives="<rejected, and why>" \
  doc_path=docs/engineering/adr/NNNN-<slug>.md
```

Also update the relevant `docs/engineering/trd/<area>.md`. One area file per subsystem, so
this stays a small edit rather than a rewrite of one enormous document.

Deliberate shortcuts get a `ponytail:` comment (or whatever tag your team greps for) naming the ceiling and the upgrade path,
and a line in the area TRD's deferred section.

## Ask when the build contradicts the spec

If implementation reveals the story is wrong, that is a change, not a detour. Say so and
run `/pm-change`. Do not quietly build the thing you think is better.

## Close the milestone

Built is not done. Closing here moves the project to `/pm-edit`, not to ship.

```bash
./pm check
./pm gate open build M0
./pm gate approve build --subject M0 "M0 tasks done and reviewed"
./pm set M0 status=done
./pm gate approve build "M0 built"
./pm phase next                      # lands on edit
```
