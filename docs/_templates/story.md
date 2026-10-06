---
code: STORY000
parent: EPIC000
kind: functional
status: backlog
updated: YYYY-MM-DD
---

# STORY000 <What a user can do, stated as an outcome>

Title the outcome, not the work. "A user can find a note by its text", not "Build the
search index". The second one is a task, and it hangs under this.

Parent: [EPIC000](../epics/EPIC000-<slug>.md)

## The claim

One sentence that is either true or false about the shipped product. This is the thing a
test will speak about when this story reaches `verified`.

## Independent test

How this story can be checked on its own, and what that alone delivers. If it only makes
sense once another story ships, reslice it.

<check it by doing X, and it delivers Y>

## Acceptance

What has to hold for this to be done. Each line observable, no adjectives, no
implementation names.

- [ ] **Given** <state>, **when** <action>, **then** <observable outcome>
- [ ] **Given** <state>, **when** <action>, **then** <observable outcome>
- [ ] Every state in the screen inventory is implemented, not just the happy path

## Kind

`functional` (the product does something), `nonfunctional` (a budget or a quality bar it
must hold), or `constraint` (something it must never do). A `constraint` story with
`priority=wont` is a non-goal, and nobody builds it. It exists so scope creep gets caught.

## Edge cases

- <what happens when two people do this at once>
- <what happens when the upstream call fails halfway>
- <what happens on the very first run, with nothing to show>

## Verification

How this gets from `done` to `verified`. Name the test, not the intention.

- **Test:** <suite and case>
- **Recorded as:** `./pm add test_run kind=<kind> tool=<tool> passed=N failed=0 covers=STORY000`

`./pm check` fails if this story is marked `verified` without a passing run naming it.

## Tasks

```bash
./pm tree STORY000
```

## Open questions

- [ ] <question>
