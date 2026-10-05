---
code: SCR000
item: EPIC000
design_status: none
updated: YYYY-MM-DD
---

# SCR000 <Screen name>

Route: `/<path>`
Epic: [EPIC000](../epics/EPIC000-<slug>.md)

---

## Behaviour

Filled in `/pm-flows`, before any visual work starts.

### Objective

One sentence. Why this screen exists. If it exists to hold three unrelated things, it is
three screens.

### User context

Who opens it, in what situation, in what mood, with what already in their head.

### States

Every state, not the happy path. Six or more.

| State | Trigger | What the user sees | Recovery |
|---|---|---|---|
| empty | first run, nothing created yet | | |
| loading | | | |
| populated | | | |
| error | | | how they get out |
| partial | needs more information | | |
| blocked | permission or access denied | | |

### Rules that drive the UI

Thresholds, permissions, what is visible to whom. Full detail lives in the area TRD.

---

## Visual

Filled in `/pm-design`, after the design system is approved.

### Constraints

- Tokens: use `standards/design-system.md`, never a raw value
- Must appear: <the thing this screen exists for>
- Must not appear: <what would dilute it>
- Platform: <mobile min 375px, dark mode, offline>
- Tone: <for example reassuring, avoid the words FAILED and ERROR>

### Out of scope

What we are deliberately not designing on this screen yet.

### Iterations

| Round | What changed | Verdict |
|---|---|---|
| 1 | five variants generated | V3 taken forward |

### Approval

- **Approved:** <date>
- **Variant:** <which one>
- **Why it won:** <one sentence, this is the decision worth keeping>
- **Guardrail added to standards/guardrails.md:** <what the next screen inherits from this>
- **Prototype:** `design-prototypes/<file>.html`
