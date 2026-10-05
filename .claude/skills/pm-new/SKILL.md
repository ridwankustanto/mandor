---
name: pm-new
description: Phase 0, Intent. Start a project by interviewing the user with form-style questions until the objective, the success signal, the non-goals and the point of view are unambiguous. Creates project.db, the product overview and standards/point-of-view.md. Use when starting a new project, when the user says "new project", "start a project", "/pm-new", or when project.db does not exist yet.
---

# /pm-new: get the objective crystal clear

The whole point of this phase is that nobody downstream has to guess. You are not
filling a form, you are interrogating an idea until it holds still.

**Ask everything with `AskUserQuestion`.** Never a wall of prose. Four questions per
form at most, recommendation first and labelled.

## Round 1, the fixed seven

Two forms, four then three. Do not ask them as prose.

1. What are we building, in one sentence?
2. Who is it for, and what do they do today instead?
3. What breaks, or stays broken, if this never exists?
4. What does done look like for the first usable version?
5. Category: whichever buckets the owner sorts projects into (personal, work, client,
   game). Offer the ones already used in other projects if you can see them.
6. Stack: known already, or open for `/pm-discover` to decide?
7. Full or lite? Recommend lite for a one or two session build, a prototype that may be
   thrown away, or an internal tool for one user. Recommend full for anything with real
   users, more than one milestone, or a launch. Lite skips discover, spec, flows and
   design. It keeps the point of view and the edit pass, because a fast build is exactly
   where a burrito gets called lunch.

For 1 and 4, offer drafted options rather than a blank box. People correct a wrong
draft faster than they write a right one from nothing.

## Round 2, close the gaps

Read the round 1 answers. Ask only about what is still ambiguous. Typical gaps:

- A scope boundary that could reasonably be read two ways
- A success signal with no number or no observable event
- A user group that is actually two groups with different needs
- A constraint the user mentioned in passing and has not made explicit

Generate these questions from the answers, not from a checklist.

## Round 3, the point of view

If we do not have one, the AI gives us one, and its one is the most probable answer.
This round fills `standards/point-of-view.md`, which every agent reads before building.
It runs in lite mode too, and it is the one round that is never skipped.

Ask with forms, drafted options first, the user corrects:

1. Who do we want to be to the user? Not what it does, what it is to them.
2. What do they care about that they would not think to say? Offer what you noticed.
3. Three beliefs that shape decisions, specific enough that someone could disagree.
4. Three things we refuse to be. Name the generic version of this product precisely.
5. How should it feel, in three adjectives that exclude something.
6. References they admire, inside this category and outside it, and what to take from
   each. Push for one from outside software.
7. The detail nobody asked for: one example of the care we want users to find.

Reject answers any product could give. "Simple and intuitive" is a no, ask again with
sharper options. The test: would a competitor write the same sentence? Then it is not a
point of view.

## Round 4 and onward, restate and confirm

Write back, in your own words and under 150 words:

- The objective
- The success signal, observable and specific
- The top three non-goals
- Who we are to the user, and the one thing we refuse to be

Then ask, with the form UI, whether that restatement is right. Offer:
"Yes, that is it", "Close, one thing is wrong", "No, start that part over".

Loop until the user picks "Yes, that is it". **This is the exit condition.** Not the
form being filled. Not you feeling confident. The user confirming your restatement.

## Then write it down

```bash
./pm init "<Project Name>"            # add --lite if round 1 chose lite
```

- Fill `docs/product/overview.md` from the template: objective, success signal, the three
  non-goals, users, constraints. Helicopter view only, stays short.
- Fill `standards/point-of-view.md` from round 3, then delete the `pm:unfilled` marker
  on its first line. Until it is gone, `./pm check` fails past intent.
- Fill the Context block at the top of `CLAUDE.md`.
- Do not build the work tree yet. Epics and stories are `/pm-spec`, and creating them now
  means committing to a shape before the research that should inform it.

Write the confirmed non-goals into the overview verbatim. They become `constraint` stories
with `priority=wont` in `/pm-spec`, which is how scope creep gets caught later.

## Close the gate

```bash
./pm gate approve intent "objective restated and confirmed by <user>"
./pm phase next
```

Only after the user confirmed the restatement. If they want to move on while something
is still fuzzy, that is their call, but record it:
`./pm gate skip intent "<reason>"`.

## Do not

- Do not propose a solution, a stack, or a screen in this phase. Intent only.
- Do not write epics or stories. They come in `/pm-spec`, after research.
- Do not accept "make it good" or "like <product> but better" as a success signal.
  Ask again, with options.
