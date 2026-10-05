---
status: draft
updated: YYYY-MM-DD
---

# Architecture

Helicopter view. One screen, no more. Every area named here has its own file in
[`trd/`](trd/index.md), and that is where detail belongs.

## Stack

| Layer | Choice | ADR |
|---|---|---|
| Frontend | | |
| Backend | | |
| Data | | |
| Auth | | |
| Deploy | | |

Every row with a real tradeoff behind it has an ADR. A row with no ADR means the choice
was obvious, which is fine, but be honest about which ones those are.

## Shape

One diagram beats three paragraphs. ASCII renders fine in the dashboard.

```
<client>  <->  <server or realtime>  <->  <persistence>
   |                  |                        |
 owns: ...          owns: ...               owns: ...
```

State authority is the most common source of bugs. Mark which side is the single source
of truth for what, and where the client is allowed to be optimistic.

## Areas

| Area | Owns | Features | Doc |
|---|---|---|---|
| | | | [`trd/<area>.md`](trd/<area>.md) |

## Cross cutting

Things no single area owns and everyone depends on.

- **Auth and identity:** <where the trust boundary sits>
- **Error handling:** <what surfaces to the user, what only logs>
- **Observability:** <what we can actually see in production>
- **Config and secrets:** <where they live, how they get to production>

## Non-functional targets

Whole system, not per area.

- **Performance:** <budget, and how it is measured>
- **Availability:** <what downtime is acceptable and to whom>
- **Security:** <trust boundaries, what is validated where>
- **Accessibility:** <the floor we commit to>

## Known debt

Whole-system shortcuts. Per area debt lives in the area file.

- **<shortcut>:** ceiling is <when it breaks>, upgrade path is <what replaces it>.
