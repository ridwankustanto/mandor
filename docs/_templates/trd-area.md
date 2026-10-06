---
area: <area-slug>
status: current
updated: YYYY-MM-DD
---

# TRD <Area name>

How this one area is built. One area per file, so an edit stays small enough that it
actually gets made. The whole-system view lives in
[`docs/engineering/architecture.md`](../architecture.md) and is not repeated here.

Covers epics: EPIC000, EPIC000

## Responsibility

What this area owns and, just as important, what it does not. The most common source of
bugs is unclear authority over state.

- **Owns:** <the state this area is the single source of truth for>
- **Does not own:** <state it reads but must never write>

## Shape

```
<client>  ->  <this area>  ->  <persistence>
                 owns: ...
```

## Data model

| Table | Columns (sketch) | Rules and state changes | From |
|---|---|---|---|
| | | | STORY000 |

Deliberately not stored: <what is derived, cached, or intentionally absent, and why>

## Interfaces

Agreed before code, so tasks can build against both sides at once.

| Endpoint or message | Direction | Purpose | Auth | From |
|---|---|---|---|---|
| | | | | STORY000 |

## Business rules

The logic that is invisible in a mockup and drives everything anyway. Thresholds,
permissions, ordering guarantees, what notifies loudly versus quietly.

- <rule, with its threshold or condition made explicit>

## Key algorithms

Only the non-obvious ones, the ones someone would otherwise reverse engineer from code.

- **<name>** (`src/<file>` in the code repo, `function`): what it does and the invariant it protects.

## Non-functional targets

- **Performance:** <budget, measured how>
- **Limits:** <platform caps that shape the design>
- **Security:** <trust boundary, what is validated where>
- **Accessibility:** <commitment for this area>

## Deferred and accepted debt

Every deliberate shortcut with its ceiling and its upgrade path. Mirror any
`ponytail:` comment in the code here.

- **<shortcut>:** ceiling is <when it breaks>, upgrade path is <what replaces it>.

## Decisions

| ADR | Decision | Status |
|---|---|---|
| ADR0000 | <what was decided> | accepted |
