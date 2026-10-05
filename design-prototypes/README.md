# Design prototypes

Plain HTML, no build step, no framework. This is the surface where design happens before
it becomes production code.

Conventions:

- `00-system.html` is the design system: tokens, type scale, spacing, every core component
  in every variant and state. It is built and approved first.
- `SCR001-<slug>-variants.html` holds five labelled variants of one screen, stacked
  vertically. Divergence lives in one file, which costs less than five prompts and forces
  real exploration.
- `SCR001-<slug>.html` is the developed winner, with every state from the screen's
  inventory rendered.

Real content throughout, never lorem. The dashboard renders everything in here as a live
gallery.

View them with the dashboard server running from the repo root:

```bash
python3 -m http.server 4321
```
