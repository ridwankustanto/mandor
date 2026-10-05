---
status: draft
updated: YYYY-MM-DD
---

# Design system

The visual source of truth. Agents read this every session, so output stays on brand
without being re-briefed.

It is built once in `/pm-design` before any screen exists, and then it grows: every
approved screen appends the guardrail it taught us to `guardrails.md`. That is how the
system gets sharper each screen instead of restarting each time.

Token values live in [`tokens.css`](tokens.css), the only file allowed raw values.
Prototypes link it and the code repo imports it, so a token changes in one place. Full
templates and flows live in [`patterns/`](patterns/README.md). The brand reasoning this
file serves lives in [`point-of-view.md`](point-of-view.md).

Live reference implementation: `design-prototypes/00-system.html`. When the two disagree,
the prototype is what shipped and this file is what we meant. Fix whichever is wrong.

## 0. Direction

Written before any code, and the code is derived from it rather than the other way around.

- **Personality:** taken from "How it should feel" in `point-of-view.md`. Restate it as
  visual terms here: what those adjectives mean for color, type and density.
- **Source:** <existing system (Claude Design or Figma, with link) | directions explored in
  Claude Design | built fresh in design-prototypes/>
- **North star:** <one sentence>
- **References:** <products we admire, and specifically what to adopt and what to avoid>
- **The one bold move:** <where the design spends its boldness. Everything else stays quiet.>

## 1. Color

Semantic names, never raw values in components. OKLCH where the stack supports it.

Define the complete light palette on bare `:root`. Redefine only the tokens under
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and
again under `:root[data-theme="dark"]`.

Three theme states exist, not two: an explicit light choice, an explicit dark choice, and
the unstamped default where only the OS preference decides. A color whose only definition
sits inside a media query or an attribute block never applies in the unstamped state, and
that is the classic unreadable-page bug.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | | | Page ground. Set this explicitly on `body`. |
| `--surface` | | | Cards, panels |
| `--sunk` | | | Insets, code blocks, table headers |
| `--ink` | | | Primary text |
| `--muted` | | | Secondary text |
| `--border` | | | Dividers |
| `--accent` | | | Primary action, one hue |
| `--success` | | | |
| `--warning` | | | |
| `--danger` | | | |

Neutrals are chosen, not inherited. A pure mid grey reads as unconsidered. Bias the
neutral slightly toward the accent hue.

Semantic status color is separate from the accent and does not count as it.

## 2. Typography

- **Faces:** display `<name>`, body `<name>`, mono `<name>`
- Webfonts must be inlined as `@font-face` data URIs where the delivery context blocks
  external hosts. A silent fallback is worse than a system stack chosen on purpose.

| Level | Size | Weight | Line height | Tracking |
|---|---|---|---|---|
| Display | | | | |
| H1 | | | | |
| H2 | | | | |
| H3 | | | | |
| Body | | | | |
| Small | | | | |
| Caption | | | | |

- Running text near 65 characters wide.
- Headings get `text-wrap: balance`.
- Uppercase labels get letter spacing.
- Numbers that change get `font-variant-numeric: tabular-nums`.

## 3. Spacing and layout

- **Scale:** 4 8 12 16 24 32 48 64
- **Breakpoints:** <mobile min 375px, then...>
- **Container widths:** <...>
- Sibling groups are laid out with flex or grid and `gap`, not per element margins that
  collapse or double.
- Wide content (tables, code, diagrams) scrolls inside its own `overflow-x: auto`
  container. The page body never scrolls sideways.

## 4. Radius, elevation, borders

- **Radius:** card <16>, button <8>, input <8>, pill 999
- **Concentric rule:** outer radius equals inner radius plus padding. Uniform radius on
  everything is the default that reads as generated.
- **Depth:** prefer stacked translucent shadow over a solid border, it adapts to any ground.
- **Images:** a 1px low alpha outline to separate them from the background.

## 5. Components

Every real component, named once, so nothing gets reinvented slightly differently.

### <ComponentName>
- **Path:** `components/ui/<Name>.tsx`
- **Variants:** primary, secondary, ghost
- **States:** default, hover, active, focus visible, disabled, loading
- **Behaviour:** <notes>

## 6. Motion

- Enter: stagger 50 to 100ms, it reads as intentional.
- Exit: fast and quiet.
- Respect `prefers-reduced-motion` everywhere.
- Motion serves the subject or it is removed. Scattered effects are how a page starts
  looking generated.

## 7. Icons

- Library: <lucide | phosphor>
- Never emoji as icons. Not in the UI, not in docs, not in commit messages.

## 8. Voice

- Name things the way a user recognises them, not the way the system is built.
- A control says exactly what happens. "Publish", then a toast that says "Published".
- Errors say what went wrong and how to fix it. No apologies, no vagueness.
- No em dashes, no middle dots, no emoji. Comma, colon, parentheses, or two sentences.

## 9. Guardrails

Moved to [`guardrails.md`](guardrails.md), so `./pm context` can print them before every
task without loading this whole file.

## 10. Decisions log

Appended on every screen approval. The sentence the user said when they picked a variant
is worth more than the variant.

| Date | Screen | Decision | Why |
|---|---|---|---|
| | | | |
