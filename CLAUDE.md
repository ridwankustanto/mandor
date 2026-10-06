# CLAUDE.md

How an agent behaves in this repo. Also read as `AGENTS.md` by non-Claude agents.

`docs/` holds the prose. `project.db` holds the state. `standards/` holds the taste.
This file holds the rules.

## Context

- **Product:** <one line, filled by /pm-new>
- **Category:** <your own buckets, for example personal | work | client | game>
- **Stack:** <filled by /pm-new>
- **Mode:** <full | lite>, `./pm mode` says which
- **Code repo:** <`code/` by default, set by `./pm link`>
- **Phase:** run `./pm status`. Never guess it. A SessionStart hook already put the
  briefing in your context, so do not re-run it just to look busy.

## The one rule that comes before the others

**When you have a question or a doubt, ask it with the form-style question UI
(`AskUserQuestion`). Always. Every time.**

Not a paragraph of prose ending in a question mark. Not an assumption with a footnote.
Not three options buried in a wall of text. A real form with real choices, the way you
would ask a colleague sitting next to you.

This applies to:

- Anything ambiguous in a request
- Any fork where two readings produce different work
- Any default you are about to pick on the user's behalf
- Any tradeoff with no obviously correct answer
- Any time you are about to write the words "I assumed"

Batch related questions into one form (up to four at a time). Put your recommendation
first and label it. Keep asking until it is clear, then act. Interactive beats clever.

The only questions you do not ask: things you can find out yourself by reading a file,
querying `project.db`, or running a command. Be resourceful first, then ask.

## Working agreement

- **`project.db` is the source of truth for state.** Never hand-edit it, never write raw
  SQL that mutates. Go through `./pm`. Every write there is validated and logged.
- **Markdown is the source of truth for prose.** Decisions, rationale, specs, briefs.
- **Run `./pm check` before saying anything is done.** It exits 1 on a real problem.
- **Work is one tree.** Epic (L0) belongs to a milestone, story (L1) is what a user gets,
  task (L2) is build work, sub-task (L3) is a slice of a task. Create them with
  `./pm epic|story|task|sub`, never by writing `work_item` directly. A parent cannot close
  while a child is open, and only a story can be `verified`.
- **Code lives in `code/`, its own git repo,** ignored by this one and connected with
  `./pm link code`, which installs the commit hook there and points its agent at
  `standards/`. Never scaffold a stack the user has not chosen.
- **Run `./pm context <CODE>` before every task and every screen.** It prints the point of
  view, the work chain, the screens and the guardrails. Build from what it prints.
- **Commit on every meaningful change.** Put the work item code in the message
  (`TASK014`) and the post-commit hook stamps it for you. Small commits, clear messages.
- **Gates are hard blocks.** If the current phase has an unapproved gate, stop and say
  which one. Do not proceed. If the user wants to move anyway, record it:
  `./pm gate skip <phase> "<reason>"`. Overrides are allowed, silent overrides are not.
- Ship the smallest thing that works. Question scope that is not needed.
- Non-happy-path is not optional. Empty, loading, error, partial, success.
- Any language is fine in conversation. Clarity matters, not language.

## House style for everything you write

Docs, commit messages, UI copy, code comments, chat.

- No em dashes. Use a comma, a colon, parentheses, or two sentences.
- No middle dot separators.
- No emoji. Not in docs, not in UI, not in commit messages. Icons come from a real
  icon library.
- No "delve", "leverage", "seamless", "robust", "elevate", "unlock", "in today's
  fast-paced world", or a sentence that opens by restating the question.
- No praise sandwiches. Say the thing.
- Specific over long. If a paragraph defends a simplification, delete the paragraph.

## Document layout

Split by focus. A single growing `prd.md` or `trd.md` becomes unreadable by month two,
so those are directories, not files.

| Scope | Where | Shape |
|---|---|---|
| Application code | `code/`, its own git repo | your stack owns it |
| Product, helicopter view | `docs/product/overview.md` | one file, stays short |
| An epic (L0) | `docs/product/epics/EPIC001-<slug>.md` | one file per epic |
| A story (L1) | `docs/product/stories/STORY001-<slug>.md` | one file per story |
| A task or sub-task (L2, L3) | the `description` column in `project.db` | no file |
| Screen brief and approval | `docs/product/screens/SCR001-<slug>.md` | one file per screen |
| Who we are, what we refuse | `standards/point-of-view.md` | one file, filled in `/pm-new` |
| Visual system | `standards/design-system.md` | one file, rules |
| Token values | `standards/tokens.css` | the only file with raw values |
| Templates and flows | `standards/patterns/<name>.md` | one file per pattern |
| Rules every agent applies | `standards/guardrails.md` | one line per rule |
| Technical, helicopter view | `docs/engineering/architecture.md` | one file, stays short |
| Technical, per area | `docs/engineering/trd/<area>.md` | one file per subsystem |
| A decision | `docs/engineering/adr/NNNN-<slug>.md` | one file per decision, immutable |

Only L0 and L1 get documents. A file per task is three hundred stubs nobody reads.

Helicopter files link down. Focused files never grow past what one person can hold in
their head. If a focused file passes roughly 300 lines, split it and say so.

Every focused doc starts with a front matter block so the dashboard and `./pm` can find it:

```
---
code: STORY001
parent: EPIC001
status: done
updated: 2026-08-14
---
```

## Commands

Each phase has a skill. Run the skill, do not improvise the procedure.

| Command | Phase | Ends with |
|---|---|---|
| `/pm-new` | intent | objective restated and approved |
| `/pm-discover` | discover | risk register and adopt/avoid list approved |
| `/pm-spec` | spec | epic and story breakdown, and the M0 cut line, approved |
| `/pm-flows` | flows | flows and state inventory approved per epic |
| `/pm-design` | design | design system approved, then each screen approved |
| `/pm-build` | build | each epic planned and approved, then the milestone built |
| `/pm-edit` | edit | every delivered epic played as a user, fixed, approved by the editor |
| `/pm-ship` | ship | deployment recorded |
| `/pm-feedback` | learn | every item triaged |
| `/pm-change` | any | change applied, docs and ADRs updated |
| `/pm-status` | any | nothing, it just answers |

## Scope changes go through /pm-change. Always.

The user will add, cut, or reshape a feature in the middle of design or implementation.
That is normal and expected. What is not allowed is absorbing it silently.

Any time the shape of the product changes after its gate was approved, run `/pm-change`.
It computes what is affected, shows the user, and then updates the TRD, writes or
supersedes an ADR, re-parents or cuts work items, and flags screens whose approval is now
stale.

A doc that no longer matches the product is worse than no doc.

## The quality bar

AI makes building cheap, so the risk is no longer that we cannot build it. It is that we
build the most probable version, call it done because it looks finished, and ship
something any competitor could have made. Four rules against that:

1. **Have a point of view.** `standards/point-of-view.md` is read before anything is
   built. If an answer would fit any product in the category, it is not ours.
2. **Standards live in the machine.** Tokens in `tokens.css`, layouts in `patterns/`, rules
   in `guardrails.md`, served by `./pm context`. A rule only in someone's head does not
   reach an agent working at 3am.
3. **Built is not done, done is not good.** The edit phase plays the product as a user
   and fixes until it is good. Ship refuses a delivered epic nobody edited.
4. **Raise the ceiling, not just the floor.** Every divergence includes one strange
   option. Every epic names a detail nobody asked for. Spend some of what AI saved on
   something that would not have been tried before.

## Anti-slop check before handing over UI

- One visual system, or several fighting?
- Icons from a real library, never emoji?
- Radius hierarchy present, not uniform?
- Layout specific to this product, not a grid of identical cards?
- Type scale defined and followed?
- Both themes designed, not one inverted?
- Empty, loading, and error states actually built?
- Would a competitor have built the same screen? Then it is not done.

## Known mistakes to prevent

They live in `standards/guardrails.md`, so they travel to the code repo and `./pm context`
prints them before every task. Append there, one dated line, the day it happens.
