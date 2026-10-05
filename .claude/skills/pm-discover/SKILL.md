---
name: pm-discover
description: Phase 1, Discover. Structured research across four fixed axes (prior art, feasibility, constraints, risk) producing research_note rows where every finding carries an implication. Use after /pm-new, when the user says "/pm-discover", "research this", "benchmark", "what are the risks", or before committing to a stack.
---

# /pm-discover: research that downstream work can rely on

Free-form research produces a different shape every project, so nothing can be compared
or reused. This phase has four fixed axes. Every project gets all four, even briefly.

**Every finding must have an implication.** A finding with no implication is trivia and
gets dropped. The implication is what changes: a story, a constraint, a risk to
watch, a choice now foreclosed.

Ask with `AskUserQuestion` whenever a finding forces a choice. Do not pick the stack,
the pattern, or the tradeoff on the user's behalf and mention it in passing.

## Axis 1: prior art

Three to five products that already solve this. For each:

- The pattern they use
- Why it fits their context specifically
- The tradeoff they accepted
- Verdict: adopt, adapt, or avoid, with one line of reasoning

Use web search and Claude in Chrome for real products, not from memory. Screenshot
teardowns are fair game and usually sharper than descriptions.

## Axis 2: technical feasibility

What the candidate stack can and cannot do for this specific product.

- Hard limits: rate limits, payload caps, quotas, cold starts, platform rules
- Cost at the expected scale, and at ten times it
- What is genuinely hard here, as opposed to merely unfamiliar
- What already exists that you would otherwise rebuild

## Axis 3: constraint scan

- Compliance and legal: data residency, retention, consent, licensing
- Platform rules: app store, browser extension, API terms of service
- Auth and privacy: what trust boundaries exist, what is validated where
- Accessibility floor: what you commit to now so it is not retrofitted later

## Axis 4: risk register

The five things most likely to kill this, each with an early signal.

| Risk | Impact if it lands | Early signal to watch | Cheapest mitigation |
|---|---|---|---|

A risk with no observable early signal is not a risk, it is a fear. Rewrite it or drop it.

## Write it down

```bash
./pm add research_note axis=prior_art topic="<product>" \
  finding="<what they do>" implication="<what it changes for us>" url="<link>"
./pm add research_note axis=risk topic="<risk>" \
  finding="<why it could kill us>" implication="<the early signal to watch>"
```

A finding that changes scope goes straight into `docs/product/overview.md`, so `/pm-spec`
builds the tree from something current. Note the research note code next to it, so the
reason survives:

> Constraint, from RN004: the platform forbids background sync on free tier.

Record the stack choice as an ADR the moment it is made. See `/pm-change` for the ADR
format, or write it directly to `docs/engineering/adr/0001-<slug>.md` and:

```bash
./pm add adr title="<decision>" status=accepted decision="<what>" why="<what forced it>" \
  alternatives="<what was rejected and why>" doc_path=docs/engineering/adr/0001-<slug>.md
```

Do not create the code repo here. `/pm-build` creates it and links it, once there is
something to put in it.

## Close the gate

Present the risk register and the adopt/avoid list to the user as a form. Approve only
after they respond.

```bash
./pm gate approve discover "risk register and adopt/avoid list reviewed"
./pm phase next
```
