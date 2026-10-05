---
name: pm-design
description: Phase 4, Design. Build the design system first, then design pages one at a time with an explicit approval per screen. Wraps the Claude design workflow (design plan before code, divergence in one file, design critic, anti-slop pass). Use after /pm-flows, when the user says "/pm-design", "design this screen", "build the design system", "make the UI", or drops a visual reference.
---

# /pm-design: system first, then pages, one approval at a time

Two hard orderings. Both exist because breaking them costs more later than they cost now.

1. **No page before the system.** If `standards/tokens.css` still has the template values, you
   are not allowed to draw a screen. Build the system, get it approved, then draw.
2. **No screen advances without an explicit approval,** recorded with the reason it won.

## Step 0: load the design fundamentals

Before writing any UI, load a design fundamentals skill if your setup has one (in Claude
Code with Artifacts, that is **`artifact-design`**) and follow its process. It
carries the craft layer this skill does not repeat: how to calibrate treatment, how to
build a token system for all three theme states, what AI-generated design currently looks
like and how to avoid landing on it.

Two things from it that get skipped most often, so they are repeated here:

- **Write the design plan before the code.** Four to six named hex values, typefaces for
  at least two roles, and a layout concept in one or two sentences. Then build from the
  plan rather than improvising in CSS.
- **Design both themes at token level.** Bare `:root` defines the complete light palette,
  `@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])`
  redefines only tokens, `:root[data-theme="dark"]` redefines them again. Never declare a
  color whose only definition sits inside a media or attribute block.

## Step 0.5: where the design comes from

Read `standards/point-of-view.md` first. The visual direction serves it, it does not
invent a new one. If the file still has its `pm:unfilled` marker, stop and say so.

Then ask with a form, every project, never assumed:

- **Explore directions in Claude Design (recommended for consumer facing or visual
  products):** fast divergence on a canvas. Where the Artifact tool is available, start it
  with its quickstart, `intent: "design"`; otherwise open Claude Design directly. Feed it the point of view and the references verbatim. Sync the
  chosen direction back here.
- **An existing design system:** a Claude Design system, a Figma library (load
  `figma-design-to-code` before `get_design_context`), or another repo. Ask for the link.
- **Build fresh in `design-prototypes/` (fine for internal tools):** local HTML, no canvas.

Whatever the source, the result lands in the same three places: real values in
`standards/tokens.css`, the rules in `standards/design-system.md`, and specimens in
`design-prototypes/`. Tokens that only exist in markdown are tokens agents ignore. Record
the choice under Source in the Direction section of `design-system.md`.

## Step 1: the design system

Build it as prototypes you can actually look at, in `design-prototypes/`. Tokens and type
first (`00-system.html`), then the core components rendered in every variant and state.

Give each file a specimen marker on the first line and it appears on the dashboard's
Design tab as a card, grouped, with its usage notes underneath:

```html
<!-- @dsCard group="Components" name="Buttons and fields"
     subtitle="Every variant, size and state" height="300" -->
<!-- @dsNotes
Markdown notes rendered under the specimen. Write the rules a future session needs.
-->
```

This is the same marker Claude Design uses, so a system synced from there drops straight
in with no translation.

Every prototype links `../standards/tokens.css` instead of declaring its own `:root`.
Change a token there and every prototype and the code repo follow.

Then write `standards/design-system.md` from what you built. That file is the source
of truth from then on, and it evolves: every approved screen appends its new guardrails
to `standards/guardrails.md`.

Pick the visual direction with the user, not for them. Diverge first:

> Generate 3 to 5 distinct visual directions for this product in a single HTML file,
> stacked with a label above each. Vary the approach significantly: palette, type pairing,
> density, and structural device. One of them must be strange: an aesthetic this
> category has not used, derived from the point of view rather than from what is
> popular. Do not pick a favourite.

Then ask with `AskUserQuestion` which direction to develop, with the tradeoff of each as
the option description. One file with five directions costs less than five prompts and
forces real exploration.

```bash
./pm gate open design design-system
./pm gate approve design --subject design-system "<direction> chosen because <why>"
```

## Step 2: pages, one at a time

Per screen, in this order.

**Brief.** Fill the visual half of `docs/product/screens/SCR001-<slug>.md`: objective,
user context, required states (already inventoried in `/pm-flows`, do not re-derive them),
visual constraints, what must not appear, out of scope.

**Diverge.** Five variants of the screen in one HTML file, labelled V1 to V5, real content
throughout, never lorem. Vary the actual approach, not the accent colour.

At least one variant is the strange one: an interaction or layout that does not exist
in this category yet. Chats, charts and forms are not the end of interface design. It
may lose, and that is fine. A team that never tries one ships the zombie version. Check
`standards/patterns/` first, so the others reuse what is already approved.

**Converge.** The user picks. Make them say why in one sentence. That sentence is the
decision, and it is worth more than the pixels.

**Generate.** Build the winner out properly in `design-prototypes/`, with every state from
the inventory, using tokens from `standards/tokens.css` and components that already exist.
Never build a second Button. Add the screen's signature detail, the one its epic doc
names, now rather than in polish.

**Refine.** Expect several rounds. For targeted edits ask for a screenshot with a box
drawn around the target, which beats any description. Bump the counter each round:

```bash
./pm set SCR001 iterations=<n> design_status=prototype prototype_path=design-prototypes/<file>.html
```

The screen's own page on the dashboard embeds that prototype at full size, next to its
state inventory and the reason it was approved, so a review needs no other tab.

**Critique before approval.** Run the design critic against the project's own principles:

> Review this screen against standards/point-of-view.md and standards/guardrails.md.
> Give me: where it is most generic (what any product in this category would do), what
> contradicts the point of view, what already works, and the single highest impact
> change to make now.

Then run the anti-slop check from `CLAUDE.md`. Fix what it catches before showing the user.

**Approve.** Ask with a form: approve, one more round, or start over. On approval:

```bash
./pm gate open design SCR001
./pm gate approve design --subject SCR001 "<why this one won>"
./pm set SCR001 design_status=approved approved_at=<iso date>
```

Append the reason to `standards/guardrails.md` as a rule so the next screen inherits it,
and log it in the decisions table of `standards/design-system.md`. If this screen is the
first of its kind (a list detail, a settings page, an onboarding), write it up as a
pattern in `standards/patterns/`. That is how the system learns templates and flows, not
just components, and why three agents given the same prompt build the same page.

## Which surface for which job

- Verbal exploration and critique: Claude chat
- Fast visual divergence: Claude Design
- Multi-file build, states, real components: Claude Code
- Pulling a live design system or a reference in: Figma MCP, and the `figma-design-to-code`
  skill before `get_design_context`
- Competitor teardown from real products: Claude in Chrome

Do not carry the same context across surfaces by hand. Put it in `standards/` once.

## When design changes the product

It will. A screen gets designed and the flow turns out to be wrong, or a state nobody
listed becomes obviously necessary. Do not absorb it silently. Run `/pm-change`.

The vendored Perch system under `dashboard/vendor/perch/` is the dashboard's own look,
not the project's. Do not inherit it by accident. Build this project's system from its own
direction, unless the user says otherwise.

## Close the phase

Every screen in the active milestone approved, then:

```bash
./pm check
./pm phase next
```
