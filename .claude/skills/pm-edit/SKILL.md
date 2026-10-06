---
name: pm-edit
description: Phase 6, Edit. The quality filter that used to run through the whole process now has to run after the build. Play every delivered epic as a user, end to end, write the numbered fix list, push it to completion, then have an adversarial critic attack it against the point of view. Use after /pm-build, when the user says "/pm-edit", "edit pass", "is this good", "walk through it", "polish this", or before anything ships.
---

# /pm-edit: built is not done, done is not good

AI makes things look finished fast, often too fast. A sentence in, an interface out, nice
corners and a drop shadow, and the temptation is to call it lunch. This phase is where
someone takes accountability for every decision, which in practice means every pixel.

The editor is a named person. Ask who it is with a form if it is not obvious. An agent
helps, it never signs off alone.

## 1. Play it like a user, per epic

One epic at a time. Run the real thing, not the prototype, not the code.

```bash
./pm tree EPIC001
./pm context EPIC001
```

Start with the epic's **Prove it end to end** steps. If they fail, stop, that is the
first fix. Then walk every story in the order a user meets them, with the real data shape, at 375px and
at desktop, in both themes, keyboard only for one pass. Then the unhappy paths: empty,
slow network, bad input, the error a real person will hit first.

Answer, in writing:

- **Does it solve the problem?** The one in `docs/product/overview.md`, not a nearby one.
- **Is it attuned to how the user thinks?** Names, order, defaults. Or how the system is built?
- **Is it coherent?** Screens that look good alone and feel disconnected together are the
  most common failure here. Look at the seams between stories.
- **Is it fully formed?** Not "yes or no", but what would push it to complete.
- **Does it sound like us?** Hold it next to `standards/point-of-view.md`. Would a
  competitor have built the same thing? Then it is not ours yet.
- **Where is the detail nobody asked for?** The epic doc names one. Is it there, and is it
  good, or was it skipped because nobody would notice?

## 2. The fix list

Write a numbered list, one line each, specific enough to act on without asking: not
"spacing feels off" but "the empty state headline sits 8px too close to the illustration,
use space-6". Go one level deeper than the user would notice. That depth is what they
feel without being able to name it.

Twenty items is normal for a first pass. Five means the walk was shallow.

Each item becomes a `fix` task under the story it belongs to:

```bash
./pm task title="<the fix, verb first>" parent=STORY003 type=fix
```

A finding that would apply to more than one screen also becomes a line in
`standards/guardrails.md`, so the next build starts from it. A finding that changes what
the product does is not a fix, it is `/pm-change`.

## 3. Push it, then push again

Do the fixes. Then play it again from the start. Iteration count is not a smell here,
it is the job. Stop when a full walk produces no item you would be embarrassed to ship.

Spend some of the time AI saved on the thing that would not have been tried before:
the second viewpoint, the motion that makes it feel alive, the interaction nobody in this
category has. Protect the strange.

## 4. Adversarial critique

Before the editor approves, spawn a critic agent with only the running product and
`standards/`, never the source code, and this brief:

> You are a demanding editor who did not build this. Here is the point of view and the
> guardrails. Use the product as a first-time user. Report: the three places it is most
> generic, where it contradicts the point of view, the seam between screens that breaks
> the most, and the one change with the highest impact. No praise.

Fix what holds up. Write down what you reject and why, in one line each, in the epic doc.

## 5. Approve, per epic

```bash
./pm check
./pm gate open edit EPIC001
./pm gate approve edit --subject EPIC001 "<editor>: <n> fixes, <what made it good>"
```

When every delivered epic is approved:

```bash
./pm gate approve edit "every delivered epic edited"
./pm phase next          # lands on ship
```

Skipping is allowed and recorded, never silent:
`./pm gate skip edit --subject EPIC001 "<reason>"`.

## Do not

- Do not approve from the code, the diff or a screenshot. Only from using it.
- Do not let the agent that built it be the critic.
- Do not confuse polish with good. A beautiful screen that solves the wrong problem fails
  question one, and nothing after it matters.
