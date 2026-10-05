# Guardrails

The rules every agent applies without being asked. `./pm context` prints this file in
full before any task, so it stays short: one line per rule, and the reason when it is
not obvious.

Appended from three places, the day it happens:

- a screen approval in `/pm-design` (the reason it won, turned into a rule)
- a finding in `/pm-edit` that would apply to more than one screen
- a mistake an agent made that must not happen twice

## Do

- Use tokens from `tokens.css`. Never a raw value inside a component.
- Keep the radius hierarchy. Outer radius equals inner radius plus padding.
- Build empty, loading and error states at the same time as the populated one.
- Optically align asymmetric icons, do not geometrically centre them.
- Reuse a pattern from `patterns/` before inventing a layout.

## Do not

- Uniform radius everywhere.
- Cards inside cards inside cards. That pattern means the spec was too vague.
- Generic type with no defined hierarchy. Centre everything.
- The current generated-design defaults: warm cream with a serif and a terracotta
  accent, near black with one acid pop, a purple to blue gradient hero, Inter or Space
  Grotesk as the safe choice, an accent rail on every rounded card.
- Emoji as icons. Em dashes or middle dots in copy.

## Known mistakes

One line each, dated.

- <YYYY-MM-DD what happened, and the rule that prevents it>
