#!/usr/bin/env python3
"""pm: the project management store for this repo.

One SQLite file (project.db) holds every ID, status and link. Prose stays in
markdown under docs/. This script is the only writer, so validation and the
audit log live in one place.

Work is one tree, Jira shaped:

    L0 epic     EPIC001   belongs to a milestone
    L1 story    STORY001  what a user gets, and what tests speak about
    L2 task     TASK001   a unit of build work
    L3 sub-task SUB001    a slice of a task

Run `./pm help` for commands.
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "project.db")
STANDARDS = os.path.join(ROOT, "standards")

# edit sits between build and ship: built is not done, done is not good.
PHASES = ["intent", "discover", "spec", "flows", "design", "build", "edit", "ship", "learn"]
# lite keeps the point of view and the edit pass, and drops the planning gates.
LITE_PHASES = ["intent", "build", "edit", "ship", "learn"]

LEVELS = {0: "epic", 1: "story", 2: "task", 3: "subtask"}
LEVEL_PREFIX = {0: "EPIC", 1: "STORY", 2: "TASK", 3: "SUB"}
PREFIX_LEVEL = {v: k for k, v in LEVEL_PREFIX.items()}

SCHEMA = """
CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL, slug TEXT, category TEXT, stack TEXT,
  current_phase TEXT NOT NULL DEFAULT 'intent', mode TEXT DEFAULT 'full',
  code_path TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS work_item (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, level INTEGER NOT NULL,
  title TEXT NOT NULL, parent TEXT, milestone TEXT, area TEXT,
  kind TEXT, type TEXT, priority TEXT DEFAULT 'should',
  status TEXT DEFAULT 'backlog', owner TEXT, estimate TEXT,
  description TEXT, source TEXT, blocked_by TEXT, doc_path TEXT,
  commit_sha TEXT, created_at TEXT, done_at TEXT);
CREATE INDEX IF NOT EXISTS work_item_parent ON work_item(parent);
CREATE INDEX IF NOT EXISTS work_item_level ON work_item(level);

CREATE TABLE IF NOT EXISTS milestone (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, goal TEXT,
  due TEXT, status TEXT DEFAULT 'planned', created_at TEXT);

CREATE TABLE IF NOT EXISTS research_note (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, axis TEXT NOT NULL, topic TEXT,
  finding TEXT NOT NULL, implication TEXT NOT NULL, url TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS flow (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, item TEXT, name TEXT NOT NULL,
  actor TEXT, trigger TEXT, happy_path TEXT, branches TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS screen (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, item TEXT, flow TEXT,
  name TEXT NOT NULL, route TEXT, states_json TEXT DEFAULT '[]',
  design_status TEXT DEFAULT 'none', prototype_path TEXT, doc_path TEXT,
  iterations INTEGER DEFAULT 0, approved_at TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS gate (
  id INTEGER PRIMARY KEY, phase TEXT NOT NULL, subject TEXT DEFAULT '*',
  status TEXT DEFAULT 'pending', note TEXT, approved_by TEXT, approved_at TEXT,
  created_at TEXT, UNIQUE (phase, subject));

CREATE TABLE IF NOT EXISTS adr (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, title TEXT NOT NULL,
  status TEXT DEFAULT 'proposed', decision TEXT, why TEXT, alternatives TEXT,
  supersedes TEXT, doc_path TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS change_request (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, origin TEXT, description TEXT NOT NULL,
  impact_json TEXT DEFAULT '{}', status TEXT DEFAULT 'open', applied_at TEXT,
  created_at TEXT);

CREATE TABLE IF NOT EXISTS test_run (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, tool TEXT, passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0, coverage_pct REAL, ref TEXT, covers TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS deployment (
  id INTEGER PRIMARY KEY, env TEXT NOT NULL, version TEXT, sha TEXT, url TEXT,
  status TEXT DEFAULT 'live', created_at TEXT);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, source TEXT, external_id TEXT,
  kind TEXT DEFAULT 'bug', title TEXT NOT NULL, body TEXT,
  status TEXT DEFAULT 'new', item TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, entity TEXT, summary TEXT, created_at TEXT);
"""

# table -> (code prefix, width). work_item is special, its prefix comes from level.
CODES = {
    "research_note": ("RN", 3), "milestone": ("M", 1), "flow": ("FLOW", 3),
    "screen": ("SCR", 3), "adr": ("ADR", 4), "change_request": ("CR", 3),
    "feedback": ("FB", 3),
}
BY_PREFIX = {v[0]: k for k, v in CODES.items()}
BY_PREFIX.update({p: "work_item" for p in LEVEL_PREFIX.values()})

# Fixed vocabularies. Free-text status is how tracking rots.
VOCAB = {
    ("work_item", "status"): ["backlog", "ready", "in_progress", "blocked",
                              "review", "done", "verified", "cut"],
    ("work_item", "kind"): ["functional", "nonfunctional", "constraint"],
    ("work_item", "type"): ["design", "impl", "test", "infra", "docs", "fix"],
    ("work_item", "priority"): ["must", "should", "could", "wont"],
    ("gate", "status"): ["pending", "approved", "rejected", "skipped"],
    ("adr", "status"): ["proposed", "accepted", "superseded"],
    ("screen", "design_status"): ["none", "brief", "prototype", "approved", "stale"],
    ("milestone", "status"): ["planned", "active", "done", "cut"],
    ("change_request", "status"): ["open", "applied", "rejected"],
    ("feedback", "status"): ["new", "triaged", "linked", "wontfix", "closed"],
    ("research_note", "axis"): ["prior_art", "feasibility", "constraint", "risk"],
    ("test_run", "kind"): ["unit", "integration", "e2e", "security", "a11y"],
    ("project", "mode"): ["full", "lite"],
}

SETTLED = ("done", "verified", "cut")

# Walks the work tree down from every epic, tagging each node with its root epic.
TREE_CTE = """
WITH RECURSIVE tree(code, root) AS (
  SELECT code, code FROM work_item WHERE level = 0
  UNION ALL
  SELECT w.code, t.root FROM work_item w JOIN tree t ON w.parent = t.code
)
"""


class Fail(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db(create=False):
    if not create and not os.path.exists(DB):
        raise Fail("no project.db here. Run: ./pm init \"<project name>\"")
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    # databases made before mode and code_path existed
    have = cols(conn, "project")
    for col, ddl in (("mode", "TEXT DEFAULT 'full'"), ("code_path", "TEXT")):
        if have and col not in have:
            conn.execute(f"ALTER TABLE project ADD COLUMN {col} {ddl}")
    return conn


def phases(conn):
    row = conn.execute("SELECT mode FROM project").fetchone()
    return LITE_PHASES if row and row["mode"] == "lite" else PHASES


def cols(conn, table):
    return [r["name"] for r in conn.execute(f"PRAGMA table_info({table})")]


def log(conn, kind, entity, summary):
    conn.execute("INSERT INTO event (kind, entity, summary, created_at) VALUES (?,?,?,?)",
                 (kind, entity, summary, now()))


def next_code(conn, table, level=None):
    if table == "work_item":
        prefix, width = LEVEL_PREFIX[level], 3
    else:
        prefix, width = CODES[table]
    rows = conn.execute(f"SELECT code FROM {table} WHERE code LIKE ?", (prefix + "%",))
    nums = [int(m.group(1)) for r in rows
            if (m := re.fullmatch(re.escape(prefix) + r"(\d+)", r["code"] or ""))]
    start = -1 if table == "milestone" else 0
    return f"{prefix}{max(nums, default=start) + 1:0{width}d}"


def resolve(code):
    m = re.fullmatch(r"([A-Z]+)\d+", code or "")
    if not m or m.group(1) not in BY_PREFIX:
        raise Fail(f"unknown code: {code!r}")
    return BY_PREFIX[m.group(1)]


def check_vocab(table, field, value):
    allowed = VOCAB.get((table, field))
    if allowed and value not in allowed:
        raise Fail(f"{table}.{field} must be one of: {', '.join(allowed)} (got {value!r})")


def parse_kv(args):
    out = {}
    for a in args:
        if "=" not in a:
            raise Fail(f"expected field=value, got {a!r}")
        k, v = a.split("=", 1)
        out[k.strip()] = v
    return out


def insert(conn, table, fields, level=None):
    valid = cols(conn, table)
    if not valid:
        raise Fail(f"unknown table: {table}")
    for k, v in fields.items():
        if k not in valid:
            raise Fail(f"{table} has no column {k!r}. Columns: {', '.join(valid)}")
        check_vocab(table, k, v)
    if "code" not in fields and (table in CODES or table == "work_item"):
        fields["code"] = next_code(conn, table, level)
    if "created_at" in valid:
        fields.setdefault("created_at", now())
    keys, marks = ", ".join(fields), ", ".join("?" * len(fields))
    conn.execute(f"INSERT INTO {table} ({keys}) VALUES ({marks})", tuple(fields.values()))
    ident = fields.get("code", table)
    log(conn, "add", ident, fields.get("title") or fields.get("name") or
        fields.get("finding") or fields.get("description") or table)
    conn.commit()
    return ident


# ---------------------------------------------------------------- commands

def cmd_init(argv):
    if os.path.exists(DB):
        raise Fail("project.db already exists. Delete it first if you really mean to reset.")
    mode = "lite" if "--lite" in argv else "full"
    argv = [a for a in argv if a != "--lite"]
    name = argv[0] if argv else "Untitled Project"
    conn = db(create=True)
    conn.executescript(SCHEMA)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    conn.execute("INSERT INTO project (id, name, slug, mode, created_at) VALUES (1,?,?,?,?)",
                 (name, slug, mode, now()))
    for p in phases(conn):
        conn.execute("INSERT OR IGNORE INTO gate (phase, created_at) VALUES (?,?)", (p, now()))
    log(conn, "init", "project", f"initialised {name}")
    conn.commit()
    install_hook()
    print(f"created {DB}\nproject: {name}  mode: {mode}\nphase: intent (gate pending)")


def install_hook(repo=ROOT, pm_cmd='"$(git rev-parse --show-toplevel)/pm"'):
    hooks = os.path.join(repo, ".git", "hooks")
    if not os.path.isdir(hooks):
        print(f"note: no .git/hooks in {repo} yet, run git init there first")
        return
    path = os.path.join(hooks, "post-commit")
    if os.path.exists(path) and "installed by ./pm" not in open(path).read():
        raise Fail(f"{path} already exists and is not ours. Add this line to it yourself:\n"
                   f'{pm_cmd} commit-hook "$(git rev-parse HEAD)" "$(git log -1 --pretty=%B)"')
    with open(path, "w") as f:
        f.write('#!/bin/sh\n# installed by ./pm\n'
                f'exec {pm_cmd} commit-hook '
                '"$(git rev-parse HEAD)" "$(git log -1 --pretty=%B)"\n')
    os.chmod(path, 0o755)
    print(f"installed {path}")


def cmd_hook(argv):
    install_hook()


LINK_START, LINK_END = "<!-- pm:link -->", "<!-- /pm:link -->"


def cmd_link(argv):
    """Connect the code repo: its commits stamp this project.db, its agent reads standards/.

    Nested (./pm link code) is the default layout: the code repo lives inside this folder,
    ignored by this repo's git, and every path written is relative so the pair survives a
    move or a fresh clone. A repo elsewhere gets absolute paths.
    """
    if not argv:
        raise Fail("usage: ./pm link <path to code repo>   (usually: git init code && ./pm link code)")
    repo = os.path.abspath(os.path.expanduser(argv[0]))
    if not os.path.isdir(os.path.join(repo, ".git")):
        raise Fail(f"{repo} is not a git repo. Run git init there first.")
    nested = repo.startswith(ROOT + os.sep)
    if nested:
        up = os.path.relpath(ROOT, repo)
        pm_cmd = f'"$(git rev-parse --show-toplevel)/{up}/pm"'
        pm_show, std_show, root_show = f"{up}/pm", f"{up}/standards", f"`{up}/` (the parent folder)"
        stored = os.path.relpath(repo, ROOT)
        ignore = os.path.join(ROOT, ".gitignore")
        line = f"/{stored}/"
        if line not in read(ignore).splitlines():
            with open(ignore, "a") as f:
                f.write(f"\n# the code repo, its own git history (./pm link)\n{line}\n")
            print(f"added {line} to .gitignore")
    else:
        pm_cmd = f'"{os.path.join(ROOT, "pm")}"'
        pm_show, std_show, root_show = os.path.join(ROOT, "pm"), STANDARDS, f"`{ROOT}`"
        stored = repo
    install_hook(repo, pm_cmd)

    block = f"""{LINK_START}
## Project management lives in {root_show}

This repo is the code. State, docs and standards live in {root_show}.

- Before starting a task, run `{pm_show} context <TASK code>`. It prints the point of
  view, the story, the screen and the guardrails that apply. Build from that.
- Standards: `{std_show}/`. Use `tokens.css` for every color, size and radius. Never a raw
  value. Reuse what `patterns/` describes before inventing a layout.
- Put the work item code in the commit message (`feat: inbox empty state TASK004`). The
  post-commit hook stamps it in project.db.
- Built is not done, done is not good. The edit pass (`/pm-edit`, run from the PM repo)
  decides when an epic is good enough to ship.
{LINK_END}
"""
    md = os.path.join(repo, "CLAUDE.md")
    old = open(md).read() if os.path.exists(md) else ""
    if LINK_START in old:
        old = old[:old.index(LINK_START)] + old[old.index(LINK_END) + len(LINK_END) + 1:]
    with open(md, "w") as f:
        f.write(old + ("\n" if old and not old.endswith("\n") else "") + block)
    print(f"wrote the pm block into {md}")

    settings = os.path.join(repo, ".claude", "settings.json")
    if "brief --hook" in read(settings):
        pass
    elif os.path.exists(settings):
        print(f"note: {settings} exists, add a SessionStart hook running "
              f"{pm_cmd} brief --hook yourself")
    else:
        os.makedirs(os.path.dirname(settings), exist_ok=True)
        with open(settings, "w") as f:
            json.dump({"hooks": {"SessionStart": [{"hooks": [{
                "type": "command", "command": f"{pm_cmd} brief --hook 2>/dev/null || true",
                "timeout": 10, "statusMessage": "Reading project state"}]}]}}, f, indent=2)
        print(f"wrote {settings}, sessions in the code repo get the briefing too")

    conn = db()
    conn.execute("UPDATE project SET code_path = ?", (stored,))
    log(conn, "link", "project", stored)
    conn.commit()


def cmd_mode(argv):
    conn = db()
    if not argv:
        print(conn.execute("SELECT mode FROM project").fetchone()["mode"])
        return
    check_vocab("project", "mode", argv[0])
    conn.execute("UPDATE project SET mode = ?", (argv[0],))
    for p in phases(conn):
        conn.execute("INSERT OR IGNORE INTO gate (phase, created_at) VALUES (?,?)", (p, now()))
    cur = conn.execute("SELECT current_phase FROM project").fetchone()["current_phase"]
    if cur not in phases(conn):
        # lite has no planning phases, so a planning phase lands on build
        conn.execute("UPDATE project SET current_phase = 'build'")
    log(conn, "mode", "project", argv[0])
    conn.commit()
    print(f"mode: {argv[0]}  phases: {' -> '.join(phases(conn))}")


def read(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return ""


UNFILLED = "<!-- pm:unfilled -->"


def pov_text():
    t = read(os.path.join(STANDARDS, "point-of-view.md"))
    return "" if UNFILLED in t else t


def cmd_context(argv):
    """What an agent needs before touching a work item or screen, and nothing else."""
    if not argv:
        raise Fail("usage: ./pm context <TASK|SUB|STORY|EPIC|SCR code>")
    conn = db()
    code = argv[0]
    table = resolve(code)
    if table not in ("work_item", "screen"):
        raise Fail("context works on work items and screens")

    out = []
    out += ["== standards/point-of-view.md ==", pov_text() or "MISSING. standards/point-of-view.md is empty, "
            "stop and run the point of view round of /pm-new.", ""]

    chain, screens = [], []
    if table == "screen":
        s = conn.execute("SELECT * FROM screen WHERE code=?", (code,)).fetchone()
        if not s:
            raise Fail(f"{code} not found")
        screens.append(s)
        code = s["item"]
    while code:
        w = conn.execute("SELECT * FROM work_item WHERE code=?", (code,)).fetchone()
        if not w:
            break
        chain.append(w)
        code = w["parent"]
    if chain:
        out.append("== work, from this item up to its epic ==")
        for w in chain:
            out.append(f"{w['code']} ({LEVELS[w['level']]}, {w['status']}): {w['title']}")
            if w["description"]:
                out.append("  " + w["description"])
            if w["doc_path"]:
                out.append(f"  doc: {w['doc_path']}")
        out.append("")
        codes = [w["code"] for w in chain]
        seen = {s["code"] for s in screens}
        screens += [s for s in conn.execute(
            f"SELECT * FROM screen WHERE item IN ({','.join('?' * len(codes))})", codes)
            if s["code"] not in seen]
    for s in screens:
        out.append(f"== screen {s['code']} {s['name']} ({s['design_status']}) ==")
        out.append(f"states: {s['states_json']}")
        for k in ("doc_path", "prototype_path"):
            if s[k]:
                out.append(f"{k.split('_')[0]}: {s[k]}")
        out.append("")

    guard = read(os.path.join(STANDARDS, "guardrails.md"))
    if guard:
        out += ["== standards/guardrails.md ==", guard, ""]
    rel = os.path.relpath(STANDARDS)
    out += ["== read before writing UI ==",
            f"{rel}/design-system.md   rules",
            f"{rel}/tokens.css         every color, size, radius comes from here",
            f"{rel}/patterns/          full templates and flows, reuse before inventing"]
    print("\n".join(out))


def make_level(level):
    """epic / story / task / sub. Same shape, different level, parent enforced."""
    def fn(argv):
        fields = parse_kv(argv)
        if "title" not in fields:
            raise Fail(f'usage: ./pm {LEVELS[level]} title="..." '
                       + ("milestone=M0" if level == 0
                          else f"parent=<{LEVEL_PREFIX[level - 1]}...>"))
        conn = db()
        parent = fields.get("parent")
        if level == 0:
            if parent:
                raise Fail("an epic has no parent, it belongs to a milestone")
        else:
            if not parent:
                raise Fail(f"a {LEVELS[level]} needs parent=<{LEVEL_PREFIX[level - 1]}...>")
            row = conn.execute("SELECT level FROM work_item WHERE code=?", (parent,)).fetchone()
            if not row:
                raise Fail(f"parent {parent} not found")
            if row["level"] != level - 1:
                raise Fail(f"a {LEVELS[level]} must hang off a {LEVELS[level - 1]}, "
                           f"but {parent} is a {LEVELS[row['level']]}")
            if fields.get("milestone"):
                raise Fail("only an epic carries a milestone, everything under it inherits")
        fields["level"] = level
        print(insert(conn, "work_item", fields, level))
    return fn


def cmd_add(argv):
    if not argv:
        raise Fail("usage: ./pm add <table> field=value ...  (work items use epic/story/task/sub)")
    table, fields = argv[0], parse_kv(argv[1:])
    if table == "work_item":
        raise Fail("use ./pm epic | story | task | sub instead, so the level is never wrong")
    print(insert(db(), table, fields))


def cmd_set(argv):
    if len(argv) < 2:
        raise Fail("usage: ./pm set <CODE> field=value ...")
    code, fields = argv[0], parse_kv(argv[1:])
    table = resolve(code)
    conn = db()
    row = conn.execute(f"SELECT * FROM {table} WHERE code = ?", (code,)).fetchone()
    if not row:
        raise Fail(f"{code} not found")
    for k, v in fields.items():
        if k not in row.keys():
            raise Fail(f"{table} has no column {k!r}")
        check_vocab(table, k, v)
    if table == "work_item":
        if "level" in fields:
            raise Fail("a work item cannot change level, cut it and make a new one")
        if fields.get("status") == "verified" and row["level"] != 1:
            raise Fail("only a story can be verified, it is the level tests speak about")
        if fields.get("status") in ("done", "verified"):
            fields.setdefault("done_at", now())
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE {table} SET {sets} WHERE code = ?", (*fields.values(), code))
    log(conn, "set", code, ", ".join(f"{k}={v}" for k, v in fields.items()))
    conn.commit()
    print(f"{code} updated")


def cmd_gate(argv):
    conn = db()
    action = argv[0] if argv else "list"
    if action == "list":
        cur = conn.execute("SELECT current_phase FROM project").fetchone()["current_phase"]
        for g in conn.execute("SELECT * FROM gate ORDER BY id"):
            mark = ">" if g["phase"] == cur else " "
            sub = "" if g["subject"] == "*" else f" [{g['subject']}]"
            print(f"{mark} {g['phase']:<9}{sub:<22} {g['status']}"
                  f"{'  ' + g['approved_at'] if g['approved_at'] else ''}")
        return
    if action == "open":
        phase, subject = argv[1], (argv[2] if len(argv) > 2 else "*")
        conn.execute("INSERT OR IGNORE INTO gate (phase, subject, created_at) VALUES (?,?,?)",
                     (phase, subject, now()))
        conn.commit()
        print(f"gate {phase}/{subject} open")
        return
    if action in ("approve", "reject", "skip"):
        phase, rest = argv[1], list(argv[2:])
        subject = "*"
        if "--subject" in rest:
            i = rest.index("--subject")
            if i + 1 >= len(rest):
                raise Fail("--subject needs a value")
            subject = rest[i + 1]
            del rest[i:i + 2]
        note = " ".join(rest)
        if action == "skip" and not note:
            raise Fail("skipping a gate needs a reason: ./pm gate skip <phase> <reason>")
        status = {"approve": "approved", "reject": "rejected", "skip": "skipped"}[action]
        n = conn.execute(
            "UPDATE gate SET status=?, note=?, approved_by=?, approved_at=? "
            "WHERE phase=? AND subject=?",
            (status, note, os.environ.get("USER", "user"), now(), phase, subject)).rowcount
        if not n:
            raise Fail(f"no gate {phase}/{subject}. Open it first: ./pm gate open {phase}")
        log(conn, "gate", f"{phase}/{subject}", f"{status}{': ' + note if note else ''}")
        conn.commit()
        print(f"gate {phase}/{subject} {status}")
        return
    raise Fail("usage: ./pm gate [list|open|approve|reject|skip] ...")


def cmd_phase(argv):
    conn = db()
    cur = conn.execute("SELECT current_phase FROM project").fetchone()["current_phase"]
    if not argv:
        print(cur)
        return
    if argv[0] != "next":
        raise Fail("usage: ./pm phase [next]")
    blockers = open_gates(conn, cur)
    if blockers:
        raise Fail(f"phase '{cur}' has {len(blockers)} unresolved gate(s): " + ", ".join(blockers)
                   + f"\nApprove them, or record an override: ./pm gate skip {cur} \"<reason>\"")
    ph = phases(conn)
    nxt = ph[min(ph.index(cur) + 1, len(ph) - 1)]
    conn.execute("UPDATE project SET current_phase = ?", (nxt,))
    # databases made before a phase existed have no gate row for it
    conn.execute("INSERT OR IGNORE INTO gate (phase, created_at) VALUES (?,?)", (nxt, now()))
    log(conn, "phase", nxt, f"advanced from {cur}")
    conn.commit()
    print(f"phase: {cur} -> {nxt}")


def open_gates(conn, phase):
    return [f"{g['phase']}/{g['subject']}" for g in conn.execute(
        "SELECT * FROM gate WHERE phase=? AND status IN ('pending','rejected')", (phase,))]


def problems_now():
    """Every invariant the agent is not allowed to hand-wave. Returns a list of strings."""
    conn = db()
    p = []
    q = conn.execute

    for w in q("SELECT code, level FROM work_item WHERE level > 0 AND "
               "(parent IS NULL OR parent NOT IN (SELECT code FROM work_item))"):
        p.append(f"{w['code']} is a {LEVELS[w['level']]} with no parent, it belongs to nothing")
    for w in q("SELECT w.code, w.level, w.parent, x.level AS plevel FROM work_item w "
               "JOIN work_item x ON x.code = w.parent WHERE x.level != w.level - 1"):
        p.append(f"{w['code']} ({LEVELS[w['level']]}) hangs off {w['parent']} "
                 f"({LEVELS[w['plevel']]}), which is the wrong level")
    for w in q("SELECT code, title FROM work_item WHERE level = 0 AND status != 'cut' AND "
               "(milestone IS NULL OR milestone = '')"):
        p.append(f"epic {w['code']} ({w['title'][:40]}) is in no milestone, so it has no target")
    for w in q("SELECT code, milestone FROM work_item WHERE milestone IS NOT NULL "
               "AND milestone != '' AND milestone NOT IN (SELECT code FROM milestone)"):
        p.append(f"{w['code']} points at milestone {w['milestone']}, which does not exist")
    for w in q("SELECT code, title FROM work_item WHERE level = 0 "
               "AND status NOT IN ('cut','backlog') AND code NOT IN "
               "(SELECT parent FROM work_item WHERE parent IS NOT NULL)"):
        p.append(f"epic {w['code']} ({w['title'][:40]}) has no stories, nobody broke it down")
    # A parent cannot be finished while a child is still open.
    for w in q(f"SELECT parent, count(*) AS n FROM work_item WHERE parent IN "
               f"(SELECT code FROM work_item WHERE status IN {SETTLED}) "
               f"AND status NOT IN {SETTLED} GROUP BY parent"):
        p.append(f"{w['parent']} is closed but {w['n']} of its children are not")
    for w in q("SELECT code, blocked_by FROM work_item WHERE blocked_by IS NOT NULL "
               "AND blocked_by != '' AND blocked_by NOT IN (SELECT code FROM work_item)"):
        p.append(f"{w['code']} is blocked by {w['blocked_by']}, which does not exist")
    # 'verified' is a claim about reality, so it has to be earned by a real test run.
    for w in q("SELECT code FROM work_item WHERE status = 'verified' AND NOT EXISTS "
               "(SELECT 1 FROM test_run t WHERE t.failed = 0 AND "
               " (',' || replace(ifnull(t.covers,''), ' ', '') || ',') "
               " LIKE '%,' || work_item.code || ',%')"):
        p.append(f"{w['code']} is marked verified but no passing test run covers it")
    for s in q("SELECT code, name FROM screen WHERE design_status = 'stale'"):
        p.append(f"screen {s['code']} ({s['name']}) approval went stale after a change")
    for s in q("SELECT code, item FROM screen WHERE item IS NOT NULL AND item != '' "
               "AND item NOT IN (SELECT code FROM work_item)"):
        p.append(f"screen {s['code']} points at {s['item']}, which does not exist")

    cur = q("SELECT current_phase FROM project").fetchone()["current_phase"]
    ph = phases(conn)
    if cur in ph and ph.index(cur) > ph.index("edit"):
        # built is not done, done is not good: every delivered epic gets an edit pass
        for w in q(f"SELECT code, title FROM work_item e WHERE level = 0 AND status != 'cut' "
                   f"AND EXISTS (SELECT 1 FROM work_item s WHERE s.parent = e.code) "
                   f"AND NOT EXISTS (SELECT 1 FROM work_item s WHERE s.parent = e.code "
                   f" AND s.status NOT IN {SETTLED}) "
                   f"AND NOT EXISTS (SELECT 1 FROM gate g WHERE g.phase = 'edit' "
                   f" AND g.subject = e.code AND g.status IN ('approved','skipped'))"):
            p.append(f"epic {w['code']} ({w['title'][:40]}) is delivered but nobody edited it. "
                     f"Run /pm-edit")
    if cur != "intent" and not pov_text():
        p.append("standards/point-of-view.md is empty, so the AI will pick a generic one")
    for g in open_gates(conn, cur):
        p.append(f"gate {g} is not approved (current phase)")
    return p


def cmd_check(argv):
    problems = problems_now()
    if problems:
        print("\n".join("FAIL " + x for x in problems))
        sys.exit(1)
    print("OK, no problems")


def cmd_status(argv):
    conn = db()
    p = conn.execute("SELECT * FROM project").fetchone()
    gates = open_gates(conn, p["current_phase"])
    print(f"{p['name']}  phase={p['current_phase']}  mode={p['mode']}"
          f"  gate={'OPEN: ' + ', '.join(gates) if gates else 'clear'}")

    def count(sql, *a):
        return conn.execute(sql, a).fetchone()[0]

    total = count("SELECT count(*) FROM work_item WHERE level=1 AND status != 'cut'")
    done = count("SELECT count(*) FROM work_item WHERE level=1 AND status IN ('done','verified')")
    ver = count("SELECT count(*) FROM work_item WHERE level=1 AND status='verified'")
    print(f"stories       {done}/{total} delivered, {ver} verified")

    roll = (TREE_CTE + "SELECT count(*) FROM tree JOIN work_item w ON w.code = tree.code "
            "WHERE tree.root IN (SELECT code FROM work_item WHERE milestone = ?) "
            "AND w.level > 0 AND w.status ")
    for m in conn.execute("SELECT * FROM milestone ORDER BY code"):
        d = count(roll + "IN ('done','verified')", m["code"])
        t = count(roll + "!= 'cut'", m["code"])
        bar = "#" * round(10 * d / t) if t else ""
        print(f"{m['code']:<4} {m['name'][:28]:<28} {d}/{t} {bar:<10} {m['status']}")

    for t in conn.execute("SELECT code, title, blocked_by FROM work_item WHERE status='blocked'"):
        print(f"BLOCKED {t['code']} {t['title'][:44]} (by {t['blocked_by'] or '?'})")
    fb = count("SELECT count(*) FROM feedback WHERE status='new'")
    if fb:
        print(f"feedback      {fb} untriaged")
    dep = conn.execute("SELECT * FROM deployment ORDER BY id DESC LIMIT 1").fetchone()
    if dep:
        print(f"deployed      {dep['env']} {dep['version'] or dep['sha'] or ''} {dep['status']}")


# Which command moves the project forward, per phase.
NEXT = {"intent":"/pm-new", "discover":"/pm-discover", "spec":"/pm-spec", "flows":"/pm-flows",
        "design":"/pm-design", "build":"/pm-build", "edit":"/pm-edit", "ship":"/pm-ship",
        "learn":"/pm-feedback"}
NEXT_WHY = {
    "intent": "define the objective until it is unambiguous, then approve the intent gate",
    "discover": "research the four axes, then accept the risk register",
    "spec": "break intent into epics and stories under a milestone",
    "flows": "map behaviour and every screen state, per epic",
    "design": "design system first, then each screen, one approval at a time",
    "build": "break approved stories into tasks and implement them",
    "edit": "play every delivered epic as a user, then fix until it is good, not just done",
    "ship": "run the checks for real, then record the deployment",
    "learn": "triage every piece of feedback into somewhere real",
}


def brief_lines():
    """The session-start briefing. Returns a list of lines, never raises."""
    if not os.path.exists(DB):
        return ["No project.db here yet.",
                'Start with:  ./pm init "<Project Name>"   then run /pm-new']
    conn = db()
    p = conn.execute("SELECT * FROM project").fetchone()
    phase = p["current_phase"]
    out = [f"{p['name']}  phase {phase}" + ("  (lite)" if p["mode"] == "lite" else "")]

    total = conn.execute("SELECT count(*) FROM work_item WHERE level=1 AND status!='cut'").fetchone()[0]
    done = conn.execute("SELECT count(*) FROM work_item WHERE level=1 AND "
                        "status IN ('done','verified')").fetchone()[0]
    if total:
        ver = conn.execute("SELECT count(*) FROM work_item WHERE level=1 "
                           "AND status='verified'").fetchone()[0]
        out.append(f"stories {done}/{total} delivered, {ver} verified")

    for t in conn.execute("SELECT code, title, blocked_by FROM work_item WHERE status='blocked'"):
        out.append(f"blocked {t['code']} {t['title'][:44]} (waiting on {t['blocked_by'] or '?'})")

    problems = problems_now()
    gate_open = [x for x in problems if x.startswith("gate ")]
    others = [x for x in problems if not x.startswith("gate ")]
    for x in others[:4]:
        out.append("needs fixing: " + x)
    if len(others) > 4:
        out.append(f"needs fixing: and {len(others) - 4} more, run ./pm check")

    if others:
        out.append("next: fix the above, then ./pm check")
    elif gate_open:
        out.append(f"next: {NEXT.get(phase, '/pm-status')}   {NEXT_WHY.get(phase, '')}")
    else:
        out.append(f"next: ./pm phase next   the {phase} gate is approved and nothing is blocking")
    return out


def cmd_brief(argv):
    """Session-start briefing. --hook emits the JSON a SessionStart hook expects."""
    try:
        lines = brief_lines()
    except Exception as e:
        lines = [f"pm brief could not read the project: {e}"]
    text_out = "\n".join(lines)
    if "--hook" in argv:
        print(json.dumps({
            "systemMessage": text_out,
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext":
                    "Project management state for this repo, from ./pm brief:\n" + text_out +
                    "\nRules live in CLAUDE.md. Never hand-edit project.db, go through ./pm. "
                    "Gates are hard blocks."}}))
    else:
        print(text_out)


def cmd_tree(argv):
    """The work tree, indented. Fastest way to see whether a breakdown makes sense."""
    conn = db()
    mark = {"done": "x", "verified": "v", "blocked": "!", "cut": "-"}

    def line(w, depth):
        ms = f"  [{w['milestone']}]" if w["milestone"] else ""
        print(f"{'  ' * depth}[{mark.get(w['status'], ' ')}] {w['code']:<9} "
              f"{w['title'][:50]:<50} {w['status']}{ms}")

    def walk(code, depth):
        for w in conn.execute("SELECT * FROM work_item WHERE parent = ? ORDER BY code", (code,)):
            line(w, depth)
            walk(w["code"], depth + 1)

    if argv:
        w = conn.execute("SELECT * FROM work_item WHERE code=?", (argv[0],)).fetchone()
        if not w:
            raise Fail(f"{argv[0]} not found")
        line(w, 0)
        walk(w["code"], 1)
    else:
        for w in conn.execute("SELECT * FROM work_item WHERE level=0 ORDER BY code"):
            line(w, 0)
            walk(w["code"], 1)


def cmd_ls(argv):
    if not argv:
        raise Fail("usage: ./pm ls <table|epic|story|task|subtask> [status]")
    conn = db()
    table, where, args = argv[0], "", []
    names = {v: k for k, v in LEVELS.items()}
    if table in names:
        table, where, args = "work_item", " WHERE level = ?", [names[table]]
    if not cols(conn, table):
        raise Fail(f"unknown table: {table}")
    if len(argv) > 1:
        where += (" AND" if where else " WHERE") + " status = ?"
        args.append(argv[1])
    rows = conn.execute(f"SELECT * FROM {table}{where}", args).fetchall()
    if not rows:
        print("(none)")
        return
    for r in rows:
        d = dict(r)
        label = d.get("title") or d.get("name") or d.get("finding") or d.get("description") or ""
        print(f"{d.get('code') or d['id']:<9} {d.get('status', ''):<12} {label[:64]}")


def cmd_q(argv):
    """Read-only SQL escape hatch, for agents that need a join this CLI does not have."""
    if not argv:
        raise Fail('usage: ./pm q "SELECT ..."')
    sql = " ".join(argv)
    if not re.match(r"\s*(select|with)\b", sql, re.I):
        raise Fail("q runs reads only. Use the write commands instead.")
    rows = db().execute(sql).fetchall()
    print(json.dumps([dict(r) for r in rows], indent=2, default=str))


def cmd_commit_hook(argv):
    """Called by .git/hooks/post-commit. Stamps work item codes found in the message."""
    if len(argv) < 2 or not os.path.exists(DB):
        return
    sha, message = argv[0], " ".join(argv[1:])
    conn = db()
    for code in set(re.findall(r"\b(?:TASK|SUB|STORY)\d{3}\b", message)):
        row = conn.execute("SELECT status FROM work_item WHERE code = ?", (code,)).fetchone()
        if not row:
            continue
        status = "review" if row["status"] in ("backlog", "ready", "in_progress") else row["status"]
        conn.execute("UPDATE work_item SET commit_sha = ?, status = ? WHERE code = ?",
                     (sha[:12], status, code))
        log(conn, "commit", code, f"{sha[:8]} {message.splitlines()[0][:60]}")
        print(f"pm: {code} -> {status} ({sha[:8]})")
    conn.commit()


def cmd_help(argv):
    print(__doc__.strip() + "\n")
    print("""  ./pm init "<name>" [--lite]        create project.db and open every phase gate
  ./pm mode [full|lite]              show or switch the phase set
  ./pm link <code repo>              hook the code repo to this project (usually: code)
  ./pm context <CODE>                point of view, work chain, screens, guardrails
  ./pm status                        where are we
  ./pm brief [--hook]                session-start briefing, and the next command
  ./pm tree [CODE]                   the work tree, indented
  ./pm check                         run every invariant, exit 1 on any failure
  ./pm phase [next]                  show phase, or advance (blocked by open gates)
  ./pm gate list|open|approve|reject|skip <phase> [--subject S] [reason]

  ./pm epic  title="..." milestone=M0 [area=... priority=must doc_path=...]
  ./pm story title="..." parent=EPIC001 [kind=functional priority=must doc_path=...]
  ./pm task  title="..." parent=STORY001 [type=impl owner=agent]
  ./pm sub   title="..." parent=TASK004

  ./pm set <CODE> field=value ...    update anything by its code
  ./pm add <table> field=value ...   insert into a non work-item table
  ./pm ls <table|epic|story|task|subtask> [status]
  ./pm q "SELECT ..."                read-only SQL, prints JSON
  ./pm hook                          reinstall the git post-commit hook

  tables: work_item milestone research_note flow screen gate adr
          change_request test_run deployment feedback event""")


def demo(_argv=()):
    """Self check. Runs against a scratch db, asserts the rules that matter."""
    global DB
    import tempfile
    DB = os.path.join(tempfile.mkdtemp(), "t.db")
    cmd_init(["Demo"])
    cmd_add(["milestone", "name=First slice", "status=active"])
    COMMANDS["epic"](["title=Quick capture", "milestone=M0"])
    COMMANDS["story"](["title=A user can capture in under two seconds", "parent=EPIC001",
                       "kind=functional", "priority=must"])
    COMMANDS["task"](["title=Capture input component", "parent=STORY001", "type=impl"])
    COMMANDS["sub"](["title=Paste handler", "parent=TASK001"])
    assert [r["code"] for r in db().execute("SELECT code FROM work_item ORDER BY level")] == \
        ["EPIC001", "STORY001", "TASK001", "SUB001"]

    # the hierarchy is enforced on the way in
    for args, why in (
        (["title=Orphan", "parent=EPIC001"], "a task may not hang off an epic"),
        (["title=Nope"], "a task needs a parent"),
        (["title=Ghost", "parent=STORY999"], "a missing parent must be rejected"),
    ):
        try:
            COMMANDS["task"](args)
            assert False, why
        except Fail:
            pass
    try:
        COMMANDS["epic"](["title=Bad", "parent=EPIC001"])
        assert False, "an epic may not have a parent"
    except Fail:
        pass
    try:
        COMMANDS["story"](["title=Bad", "parent=EPIC001", "milestone=M0"])
        assert False, "only an epic carries a milestone"
    except Fail:
        pass

    # vocabularies are enforced
    for bad in (["STORY001", "status=inprogress"], ["STORY001", "priority=urgent"],
                ["TASK001", "type=frontend"]):
        try:
            cmd_set(bad)
            assert False, f"vocab should have rejected {bad}"
        except Fail:
            pass
    try:
        cmd_set(["TASK001", "status=verified"])
        assert False, "only a story can be verified"
    except Fail:
        pass

    # a parent cannot close while a child is open
    cmd_set(["TASK001", "status=done"])
    assert any("children are not" in x for x in problems_now()), \
        "closing a task above an open sub-task should fail"
    cmd_set(["SUB001", "status=done"])
    assert not any("children are not" in x for x in problems_now())

    # 'verified' has to be earned by a passing test run naming the story
    cmd_set(["STORY001", "status=verified"])
    assert any("no passing test run covers it" in x for x in problems_now())
    cmd_add(["test_run", "kind=unit", "tool=pytest", "passed=3", "failed=0", "covers=STORY001"])
    assert not any("verified" in x for x in problems_now())

    # an epic nobody broke down is a gap
    COMMANDS["epic"](["title=Undecomposed", "milestone=M0", "status=ready"])
    assert any("no stories" in x for x in problems_now())
    cmd_set(["EPIC002", "status=cut"])
    assert not any("no stories" in x for x in problems_now())

    # phase gates block, and skipping needs a reason
    try:
        cmd_phase(["next"])
        assert False, "phase should be blocked by the pending intent gate"
    except Fail as e:
        assert "unresolved gate" in str(e)
    try:
        cmd_gate(["skip", "intent"])
        assert False, "skip without a reason should fail"
    except Fail:
        pass
    cmd_gate(["approve", "intent", "objective restated and confirmed"])
    cmd_phase(["next"])
    assert db().execute("SELECT current_phase FROM project").fetchone()[0] == "discover"

    # the commit hook stamps a work item and moves it to review
    COMMANDS["task"](["title=Second task", "parent=STORY001", "type=impl"])
    cmd_commit_hook(["abc123def456", "feat: second task TASK002"])
    t = db().execute("SELECT * FROM work_item WHERE code='TASK002'").fetchone()
    assert t["status"] == "review" and t["commit_sha"] == "abc123def456"

    try:
        cmd_q(["DELETE FROM work_item"])
        assert False, "q should refuse writes"
    except Fail:
        pass
    assert db().execute("SELECT count(*) FROM event").fetchone()[0] >= 8

    # context walks from a task up to its epic
    import io, contextlib
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        cmd_context(["SUB001"])
    assert "TASK001" in buf.getvalue() and "EPIC001" in buf.getvalue()

    # lite drops the planning phases, a planning phase lands on build
    cmd_mode(["lite"])
    assert db().execute("SELECT current_phase FROM project").fetchone()[0] == "build"
    cmd_set(["TASK002", "status=done"])
    cmd_gate(["approve", "build", "built"])
    cmd_phase(["next"])
    cmd_gate(["approve", "edit", "walked through"])
    cmd_phase(["next"])
    assert db().execute("SELECT current_phase FROM project").fetchone()[0] == "ship"

    # a delivered epic past the edit phase needs its own edit pass
    assert any("nobody edited it" in x for x in problems_now())
    cmd_gate(["open", "edit", "EPIC001"])
    cmd_gate(["approve", "edit", "--subject", "EPIC001", "17 fixes made, journey holds"])
    assert not any("nobody edited it" in x for x in problems_now())
    print("demo: all assertions passed")


COMMANDS = {
    "init": cmd_init, "add": cmd_add, "set": cmd_set, "gate": cmd_gate, "phase": cmd_phase,
    "check": cmd_check, "status": cmd_status, "tree": cmd_tree, "brief": cmd_brief, "ls": cmd_ls, "q": cmd_q,
    "commit-hook": cmd_commit_hook, "hook": cmd_hook, "help": cmd_help, "demo": demo,
    "link": cmd_link, "mode": cmd_mode, "context": cmd_context,
    "epic": make_level(0), "story": make_level(1), "task": make_level(2), "sub": make_level(3),
}

if __name__ == "__main__":
    argv = sys.argv[1:]
    cmd = argv[0] if argv else "status"
    fn = COMMANDS.get(cmd)
    if not fn:
        print(f"unknown command: {cmd}\n", file=sys.stderr)
        cmd_help([])
        sys.exit(2)
    try:
        fn(argv[1:] if cmd != "demo" else [])
    except Fail as e:
        print(f"pm: {e}", file=sys.stderr)
        sys.exit(1)
