---
name: pm-flows
description: Phase 3, Flows and states. Map how each epic actually behaves, then inventory every state per screen before any pixel is designed. Use after /pm-spec, when the user says "/pm-flows", "map the user flow", "what states does this screen have", or before starting design on an epic.
---

# /pm-flows: behaviour before appearance

A prototype that looks complete to a designer is rarely complete to a developer. The gap
is always states. This phase closes it, per epic, before design starts.

## 1. Flows, one per user intention

```bash
./pm add flow item=EPIC001 name="<flow>" actor="<who>" trigger="<what starts it>" \
  happy_path="step 1 > step 2 > step 3 > done" \
  branches="<where it forks and on what condition>"
```

For each flow, name the systems touched: screens, emails, notifications, jobs, tables.
A flow that touches something with no owner is a gap. Surface it.

## 2. Screens and their state inventory

Every screen gets six or more states. Fewer than six almost always means states were
skipped, not that the screen is simple.

Baseline set, extend per screen:

- empty or first run
- loading
- populated or success
- error, with a stated recovery path
- partial, needs more information
- permission or access blocked
- stale or expired
- offline, if the product claims to work offline

```bash
./pm add screen item=EPIC001 name="<screen>" route="/<path>" \
  states_json='["empty","loading","populated","error","partial","blocked"]' \
  doc_path=docs/product/screens/SCR001-<slug>.md
```

`item` is the epic the screen belongs to, or the story if it serves exactly one.

Copy `docs/_templates/screen-brief.md` into that path and fill the behaviour half now.
The visual half gets filled in `/pm-design`.

## 3. Business rules

The logic that is invisible in a mockup and drives the UI anyway. Put these in the
epic's TRD area file, `docs/engineering/trd/<area>.md`:

- Rules with thresholds, for example "approval required above 500"
- Roles and permissions: who can see and do what
- Passive versus intrusive: what notifies loudly, what stays quiet
- Data model sketch for this area: entities, relationships, ownership

## 4. Consistency contract

Where the same element appears in more than one place, write it down once so it stays
identical everywhere. Status badges, currency formatting, date formatting, empty state
voice. This goes in `standards/design-system.md` and it is binding.

## Ask, do not assume

Business rules are where assumptions are most expensive and most invisible. Any threshold,
any permission boundary, any "what happens if two people do this at once", ask with a
form. Offer the two or three plausible readings and say what each implies.

## Close the gate

Per epic, not globally. An epic can move into design while another is still being mapped.

```bash
./pm gate open flows EPIC001
./pm gate approve flows --subject EPIC001 "flows and state inventory reviewed"
```

Advance the phase once every epic in the active milestone has passed.
