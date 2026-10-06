---
name: pm-ship
description: Phase 6, Ship. Run the pre-ship checks for real, record test runs and the deployment, and promote delivered stories to verified. Use when the user says "/pm-ship", "deploy this", "release", "is this ready to ship", or after a milestone's build gate is approved.
---

# /pm-ship: checks that run, not a checklist that gets ticked

Ship comes after `/pm-edit`. Every delivered epic needs its edit gate approved first, and
`./pm check` fails until it is. Tests prove it works. The edit pass proves it is good.

Every item here is executed and its result recorded. A checkbox nobody ran is worse than
no checkbox.

## 1. Correctness

```bash
./pm check                 # invariants: orphans, stale screens, open gates
```

Then each epic's **Prove it end to end** steps, exactly as written in its doc. A step that
no longer matches the product is a doc bug, fix the doc in the same pass.

Then the project's own test commands. Record each run:

```bash
./pm add test_run kind=unit tool=<runner> passed=<n> failed=<n> coverage_pct=<n> ref=<sha> \
  covers=STORY001,STORY004
./pm add test_run kind=e2e tool=<runner> passed=<n> failed=<n> ref=<sha> covers=STORY002
```

`covers` is the load bearing field. It lists the story codes this run actually exercises,
and it is what lets a story reach `verified`.

Failing tests block the ship. If the user wants to ship anyway, that is a gate skip with
a reason on the record, not a quiet omission.

## 2. Security

Run the `security-review` skill against the diff, plus whatever the stack provides
(dependency audit, secret scan). Record it:

```bash
./pm add test_run kind=security tool=<tool> passed=<n> failed=<n> ref=<sha>
```

Anything unresolved becomes a task before ship, or an explicitly accepted risk written
into the area TRD's deferred section. Never a silent pass.

## 3. Completeness

- Every state in every screen's `states_json` is actually implemented, not just the
  happy path. Query them, do not trust memory.
- Responsive down to 375px.
- Keyboard reachable, visible focus, `prefers-reduced-motion` respected.
- Both themes render correctly, including the unstamped system-default state.
- Anti-slop check from `CLAUDE.md`.
- No raw color, size or radius in the code repo that should have been a token from
  `standards/tokens.css`. Grep for hex values outside it.

```bash
./pm q "SELECT code,name,states_json,design_status FROM screen WHERE design_status!='approved'"
./pm q "SELECT code,title FROM work_item WHERE level=1 AND status='done'"
```

Any screen not `approved` blocks the ship or gets explicitly cut from this release.

## 4. Deploy and record

```bash
./pm add deployment env=production version=<tag> sha=<sha> url=<url> status=live
```

Smoke test the live URL. If it fails, record the rollback as another deployment row with
`status=rolled_back` rather than deleting anything. The history is the value.

## 5. Promote stories

A story reaches `verified` only when a passing test run names it, and `./pm check`
enforces that rather than trusting it:

```bash
./pm set STORY001 status=verified   # needs a passing test_run whose covers lists STORY001
```

If nothing tests it, it stays `done`. That gap is honest and useful, and the Quality view
lists every story sitting in it. Relabelling will just fail the next `./pm check`.

## 6. Close the gate

```bash
./pm gate open ship <version>
./pm gate approve ship --subject <version> "checks green, deployed and smoke tested"
./pm phase next
```

## Ask before anything outward facing

Deploys, DNS changes, public posts, anything users will see. Confirm with a form first,
even when the user asked for it earlier in the session. Approval in one context does not
carry to the next one.
