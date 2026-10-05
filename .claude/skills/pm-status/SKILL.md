---
name: pm-status
description: Answer "where are we at" from project.db in a few lines, and say what the next action is. Use when the user says "/pm-status", "where are we", "what's the state", "what should I do next", or at the start of a session on an existing project.
---

# /pm-status: where are we, and what is next

Read state, never guess it. Run these three, in order:

```bash
./pm status
./pm tree
./pm gate list
./pm check
```

Then answer in this shape, five lines or fewer:

1. **Phase**, and whether its gate is clear or open
2. **Milestone burn**, tasks done over total for the active milestone
3. **What is blocked**, and by what
4. **What check found**, if anything
5. **The single next action**, named as a command

## When check fails

Say which invariant broke and what fixes it. Do not offer to work around it.

- Work item with no parent: it belongs to nothing, re-parent it or cut it
- Epic in no milestone: it has no target, so nobody knows when it matters
- Epic with no stories: nobody broke it down
- Parent closed above an open child: the board is lying, reopen the parent
- Story verified with no passing test naming it: the claim is not earned
- Stale screen: a change invalidated its approval, it needs a design pass
- Open gate on the current phase: name the gate, name who approves it

## When the user asks something the tables cannot answer

Ask with `AskUserQuestion` rather than inferring. Status is the one place where a
confident wrong answer costs the most, because everything downstream is planned on it.

## Session start on an existing project

Run this before anything else, then read only the docs relevant to what the user is
asking about. Do not bulk load `docs/`. The database tells you where things stand, the
docs tell you why, and you only need the why for the part you are touching.
