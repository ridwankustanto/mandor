---
code: EPIC000
milestone: M0
status: backlog
updated: YYYY-MM-DD
---

# EPIC000 <Epic name>

One paragraph. What this slice of product is and who it is for. If it needs more than a
paragraph it is probably two epics.

Parent: [product overview](../overview.md) and milestone M0

## Why this exists

The outcome, not the output. What is true for a user once this epic ships that is not
true today.

## The detail nobody asked for

One touch a user will find and think "they thought of that". Specific, small, visible:
the date on the calendar tab, not "delightful animations". `/pm-design` builds it in,
`/pm-edit` checks it is there and good.

<the detail>

## Stories

The database is the source of truth for status. This table is for the reader.

```bash
./pm tree EPIC000
```

| Code | Story | Kind | Priority |
|---|---|---|---|
| STORY000 | <what a user gets> | functional | must |

## Scope

**In:** <the behaviour this epic covers>

**Out:** <what someone would reasonably assume is here and is not, and where it lives instead>

## Screens

| Code | Screen | Route | Design status |
|---|---|---|---|
| SCR000 | <name> | /<path> | none |

## Assumptions

Every default chosen instead of asking. The user reads them here and overturns any.

- <assumption, and what changes if it is wrong>

## Prove it end to end

Filled in `/pm-build` with the plan. The steps that show this epic works, run in
`/pm-edit` and `/pm-ship` instead of being made up again.

1. <setup>
2. <command or user action>
3. <what you should see>

## Open questions

At most five per epic, asked one at a time with the form UI. Do not answer them yourself.

- [ ] <question> <who decides>

## Links

- Technical: [`docs/engineering/trd/<area>.md`](../../engineering/trd/<area>.md)
- Decisions: ADR0000
