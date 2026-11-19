#!/usr/bin/env bash
# Lists agent sessions as one JSON object:
#   {"ok":true,"partial":bool,"count":N,"sources":{agent:{total,indexed}},"sessions":[...]}
#
# Incremental with a persistent cache: --cache <file> keeps one entry per
# transcript, keyed by path with mtime+size. Unchanged files are reused
# without re-reading; new or changed files get a head parse (id, cwd, first
# prompt), then budgeted streaming passes fill deep fields (message count,
# model) newest-first. A first index therefore converges over a few passes;
# "partial": true says the budget ran out before everything was deep-read.
#
# Message counts are substring counts of role/type markers in the transcript,
# not parsed records: fast, and close enough for a list row.
#
# Usage: scan.sh [--limit N] [--cache FILE] [--budget-ms MS]
# Needs python3 (ships with macOS 12.3+ Xcode tools).

set -u
LIMIT=2000
CACHE=""
BUDGET_MS=8000
while [ $# -gt 0 ]; do
  case "$1" in
    --limit) LIMIT="$2"; shift; shift ;;
    --cache) CACHE="$2"; shift; shift ;;
    --budget-ms) BUDGET_MS="$2"; shift; shift ;;
    --scope|--folder|--agents) shift; shift ;;   # kept for CLI compat; filtering is client-side
    *) shift ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo '{"ok":false,"error":"scan.sh needs python3 (macOS: xcode-select --install)"}' >&2
  exit 3
fi
if [ -n "$CACHE" ]; then
  mkdir -p "$(dirname "$CACHE")" 2>/dev/null
fi

HOME_DIR="$HOME" LIMIT="$LIMIT" CACHE="$CACHE" BUDGET_MS="$BUDGET_MS" python3 - <<'PYEOF'
import os, sys, json, time, re

home = os.environ["HOME_DIR"]
limit = int(os.environ.get("LIMIT", "2000"))
cache_path = os.environ.get("CACHE") or None
budget_ms = int(os.environ.get("BUDGET_MS", "8000"))
deadline = time.monotonic() + budget_ms / 1000.0
head_deadline = time.monotonic() + budget_ms * 0.6  # heads get 60%
BYTE_BUDGET = 48 * 1024 * 1024  # deep-read bytes per pass
HEAD_CAP = 256 * 1024           # head-read bytes per new file
WHOLE_CAP = 8 * 1024 * 1024     # files up to this size are parsed whole
partial = False

def out_bytes_left():
    return BYTE_BUDGET

def out_of_budget():
    return partial or time.monotonic() > deadline or read_state["bytes"] >= BYTE_BUDGET

def out_of_head_budget():
    # heads only get the first 60% of the pass; the rest belongs to the
    # deep streaming pass, so every run makes progress on both fronts
    return out_of_budget() or time.monotonic() > head_deadline

read_state = {"bytes": 0}

def charge(n):
    read_state["bytes"] += n

def clean(s, n=400):
    s = " ".join(str(s or "").split())
    return s[:n] if len(s) > n else s

# ---- cache ---------------------------------------------------------------
cache = {}
if cache_path and os.path.isfile(cache_path):
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f).get("files", {})
    except Exception:
        cache = []

def save_cache():
    if not cache_path:
        return
    tmp = cache_path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"version": 2, "files": cache}, f, ensure_ascii=False)
        os.replace(tmp, cache_path)
    except Exception:
        try: os.unlink(tmp)
        except OSError: pass

# ---- per-agent parse configs ----------------------------------------------
# Deep pass counts these substrings per streamed slice (bytes, no JSON parse)
# and keeps the last model match.
MARKERS = {
    "claude": [b'"type":"user"', b'"type":"assistant"'],
    "codex": [b'"type":"user_message"', b'"type":"agent_message"'],
    "pi": [b'"role":"user"', b'"role":"assistant"'],
    "omp": [b'"role":"user"', b'"role":"assistant"'],
}
MODEL_RE = {
    "claude": re.compile(rb'"model":"((?:[^"\\]|\\.)*)"'),
    "codex": re.compile(rb'"model":"((?:[^"\\]|\\.)*)"'),
    "pi": re.compile(rb'"modelId":"((?:[^"\\]|\\.)*)"'),
    "omp": re.compile(rb'"model":"((?:[^"\\]|\\.)*)"'),
}

def head_records(path, n=40, cap=HEAD_CAP):
    recs = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(cap)
        charge(len(head))
    except OSError:
        return recs
    got = 0
    for line in head.split("\n"):
        line = line.strip()
        if not line: continue
        try:
            recs.append(json.loads(line))
            got += 1
        except Exception:
            recs.append(None)
        if got >= n: break
    return recs

def json_file(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            d = json.load(f)
        charge(os.path.getsize(path))
        return d
    except Exception:
        return None

def model_str(b):
    if not b: return ""
    try: return b.decode("utf-8", "replace")
    except Exception: return ""

def apply_head(agent, path, entry):
    """Head parse for a new/changed file; fills id/cwd/preview/first_prompt/argv."""
    entry["agent"] = agent
    first_text = None
    entry["path"] = path
    if agent == "claude":
        sid = cwd = None; preview = ""
        for o in head_records(path):
            if not sid and o and o.get("sessionId"): sid = str(o["sessionId"])
            if not cwd and o and o.get("cwd"): cwd = str(o["cwd"])
            if not preview and o:
                m = o.get("message") if isinstance(o.get("message"), dict) else None
                if o.get("type") in ("human", "user") or (m and m.get("role") == "user"):
                    text = None
                    if m and m.get("content") is not None:
                        text = m["content"] if isinstance(m["content"], str) else None
                        if text is None:
                            for c in (m["content"] or []):
                                if isinstance(c, dict) and c.get("type") == "text" and c.get("text"):
                                    text = c["text"]; break
                    if text is None and isinstance(o.get("content"), str):
                        text = o["content"]
                    if text:
                        preview = clean(text, 160)
                        first_text = text
            if cwd and sid and preview: break
        entry["id"] = sid or os.path.splitext(os.path.basename(path))[0]
        entry["cwd"] = cwd or ""
        entry["preview"] = preview
        entry["first_prompt"] = clean(first_text or preview, 400)
        entry["argv"] = ["claude", "--resume", entry["id"]]
    elif agent == "codex":
        sid = cwd = None; preview = ""
        for o in head_records(path):
            if not (o and isinstance(o, dict)): continue
            if o.get("type") == "session_meta" and isinstance(o.get("payload"), dict):
                if o["payload"].get("id"): sid = str(o["payload"]["id"])
                if o["payload"].get("cwd"): cwd = str(o["payload"]["cwd"])
            if not sid and o.get("session_id"): sid = str(o["session_id"])
            if not cwd and o.get("cwd"): cwd = str(o["cwd"])
            if not preview and isinstance(o.get("payload"), dict):
                pl = o["payload"]
                if pl.get("type") == "user_message" and pl.get("message"):
                    preview = clean(pl["message"], 160)
                    first_text = pl["message"]
            if cwd and sid and preview: break
        entry["id"] = sid or os.path.splitext(os.path.basename(path))[0]
        entry["cwd"] = cwd or ""
        entry["preview"] = preview
        entry["first_prompt"] = clean(first_text or preview, 400)
        entry["argv"] = ["codex", "resume", entry["id"]]
    elif agent == "pi":
        sid = cwd = None; preview = ""
        for o in head_records(path):
            if not (o and isinstance(o, dict)): continue
            if o.get("type") == "session":
                if o.get("cwd"): cwd = str(o["cwd"])
                if o.get("id"): sid = str(o["id"])
            if not preview and o.get("type") == "message":
                m = o.get("message") or {}
                if m.get("role") == "user":
                    for c in (m.get("content") or []):
                        if isinstance(c, dict) and c.get("type") == "text" and c.get("text"):
                            preview = clean(c["text"], 160)
                            first_text = c["text"]
                            break
            if cwd and sid and preview: break
        entry["id"] = sid or os.path.splitext(os.path.basename(path))[0]
        entry["cwd"] = cwd or ""
        entry["preview"] = preview
        entry["first_prompt"] = clean(first_text or preview, 400)
        entry["argv"] = ["pi", "--session", path]
    elif agent == "omp":
        sid = cwd = None; title = ""
        for o in head_records(path, 20):
            if not (o and isinstance(o, dict)): continue
            if o.get("type") == "title" and o.get("title"):
                title = str(o["title"])
            if o.get("type") == "session":
                if o.get("cwd"): cwd = str(o["cwd"])
                if o.get("id"): sid = str(o["id"])
            if cwd and sid and title: break
        if not sid:
            # data files in per-session subdirs (changes.jsonl etc.) have no
            # "session" line: drop them rather than guess from the file name
            entry["drop"] = True
            return
        entry["id"] = sid
        entry["cwd"] = cwd or ""
        entry["preview"] = clean(title, 160)
        entry["first_prompt"] = clean(title, 400)
        entry["argv"] = ["omp", "--resume", path]
    elif agent == "gemini":
        d = json_file(path) if os.path.getsize(path) <= WHOLE_CAP else None
        sid = os.path.splitext(os.path.basename(path))[0]
        preview = ""; msgs = None
        if isinstance(d, dict):
            if d.get("sessionId"): sid = str(d["sessionId"])
            msgs = len(d.get("messages") or [])
            for m in d.get("messages") or []:
                if isinstance(m, dict) and m.get("type") == "user" and m.get("content"):
                    preview = clean(m["content"], 160); break
        entry["id"] = sid
        entry["cwd"] = ""
        entry["preview"] = preview
        entry["first_prompt"] = clean(preview, 400)
        entry["msgs"] = msgs
        entry["model"] = ""
        entry["argv"] = ["gemini", "--session-file", path]
        entry["deep_upto"] = os.path.getsize(path)  # nothing more to read
    elif agent == "opencode":
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                o = json.loads(f.read(65536))
            charge(65536)
        except Exception:
            entry["drop"] = True
            return
        entry["id"] = str(o.get("id") or os.path.splitext(os.path.basename(path))[0])
        entry["cwd"] = str(o.get("directory") or o.get("cwd") or "")
        entry["preview"] = clean(o.get("title"), 160)
        entry["model"] = str(o.get("model") or o.get("modelID") or "")
        entry["argv"] = ["opencode", "--session", entry["id"]]
        entry["deep_upto"] = os.path.getsize(path)

def read_slice(path, start, cap):
    """Reads up to cap bytes from start, extended to the next newline so a
    record never straddles two passes' slices."""
    with open(path, "rb") as f:
        f.seek(start)
        data = f.read(cap)
        if len(data) == cap:
            ext = f.read(4096)
            nl = ext.find(b"\n")
            if nl >= 0:
                data += ext[:nl + 1]
    charge(len(data))
    return data

def deep_entry(agent, path, entry, size):
    """Streams the not-yet-counted tail of a transcript within the byte
    budget; returns False when the budget ran out mid-file."""
    markers = MARKERS.get(agent)
    if not markers:
        entry["deep_upto"] = size
        return True
    upto = entry.get("deep_upto", 0)
    if upto >= size:
        return True
    want = min(size - upto, out_bytes_left())
    if want <= 0:
        return False
    data = read_slice(path, upto, want)
    n = sum(data.count(m) for m in markers)
    entry["msgs"] = entry.get("msgs", 0) + n
    hits = MODEL_RE[agent].findall(data)
    if hits:
        entry["model"] = model_str(hits[-1])[:60]
    entry["deep_upto"] = upto + len(data)
    return entry["deep_upto"] >= size or not out_of_budget()

# ---- walks ---------------------------------------------------------------
def walk_files(root, exts):
    files = []
    if not os.path.isdir(root): return files, False
    for dirpath, _dirs, files_ in os.walk(root):
        for f in files_:
            if f.endswith(tuple(exts)):
                files.append(os.path.join(dirpath, f))
    return files, True

def mtime(p): return os.path.getmtime(p)

sessions = []
sources = {}
seen = set()          # cache keys alive this pass, for pruning

def refresh_entry(agent, path, st):
    """Cache hit or head parse; returns the entry or None (dropped)."""
    key = path
    hit = cache.get(key)
    if hit and isinstance(hit, dict) and hit.get("agent") == agent \
       and hit.get("mtime") == int(st.st_mtime * 1000) and hit.get("size") == st.st_size:
        return hit
    entry = {"mtime": int(st.st_mtime * 1000), "size": st.st_size}
    apply_head(agent, path, entry)
    if entry.get("drop"):
        cache.pop(key, None)
        return None
    cache[key] = entry
    return entry

def add_from_entry(entry, st):
    folder = ""
    cwd = entry.get("cwd") or ""
    if cwd:
        folder = os.path.basename(cwd.rstrip("/")) or cwd
    first = entry.get("first_prompt") or ""
    sessions.append({
        "agent": entry["agent"], "id": entry.get("id") or "", "path": entry["path"],
        "cwd": cwd, "folder": folder,
        "preview": entry.get("preview") or "",
        "first_prompt": first,
        "msgs": entry.get("msgs"), "model": entry.get("model") or "",
        "mtime": entry.get("mtime") or int(st.st_mtime * 1000),
        "size": entry.get("size") or st.st_size,
        "argv": entry.get("argv") or [],
    })

# claude -------------------------------------------------------------------
claude_roots = [os.path.join(home, ".claude", "projects")]
rec = os.path.join(home, ".rec", "claude", "accounts")
if os.path.isdir(rec):
    for acc in os.listdir(rec):
        p = os.path.join(rec, acc, "config", "projects")
        if os.path.isdir(p): claude_roots.append(p)
claude_cands = []
for root in claude_roots:
    files, _ok = walk_files(root, (".jsonl",))
    for p in files:
        if os.sep + "subagents" + os.sep in p: continue
        claude_cands.append(p)

# codex --------------------------------------------------------------------
codex_cands, codex_ok = walk_files(os.path.join(home, ".codex", "sessions"), (".jsonl", ".json"))

# pi / omp -----------------------------------------------------------------
pi_cands, _ = walk_files(os.path.join(home, ".pi", "agent", "sessions"), (".jsonl",))
omp_cands, _ = walk_files(os.path.join(home, ".omp", "agent", "sessions"), (".jsonl",))

# gemini -------------------------------------------------------------------
gem_cands, _ = walk_files(os.path.join(home, ".gemini", "tmp"), (".json",))
gem_cands = [p for p in gem_cands if os.sep + "chats" + os.sep in p + os.sep]

# opencode: legacy storage files + the SQLite db (query is cheap, never cached)
oc_root = os.path.join(home, ".local", "share", "opencode")
oc_cands, _ = walk_files(os.path.join(oc_root, "storage", "session"), (".json",))
oc_db_rows = []
db = os.path.join(oc_root, "opencode.db")
if os.path.isfile(db):
    try:
        import subprocess
        q = ("SELECT s.id, s.directory, s.title, s.time_updated, s.model,"
             " (SELECT count(*) FROM message m WHERE m.session_id = s.id) AS msgs"
             " FROM session s WHERE s.time_archived IS NULL")
        r = subprocess.run(["sqlite3", "-json", db, q], capture_output=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            oc_db_rows = json.loads(r.stdout)
    except Exception:
        oc_db_rows = []

# zcode: one session per sess_<id> directory --------------------------------
zc_root = os.path.join(home, ".zcode", "cli", "agents")
zc_dirs = []
if os.path.isdir(zc_root):
    for name in os.listdir(zc_root):
        p = os.path.join(zc_root, name)
        if name.startswith("sess_") and os.path.isdir(p):
            zc_dirs.append(p)

# ---- turn candidates into entries ----------------------------------------
def file_entries(agent, cands, label):
    cands.sort(key=mtime, reverse=True)
    total = len(cands)
    indexed = 0
    work = []
    for p in cands:
        try: st = os.stat(p)
        except OSError: continue
        seen.add(p)
        key = p
        hit = cache.get(key)
        valid = hit and isinstance(hit, dict) and hit.get("agent") == agent \
            and hit.get("mtime") == int(st.st_mtime * 1000) and hit.get("size") == st.st_size
        if valid:
            indexed += 1
            work.append((st.st_mtime, "deep", agent, p, st, hit))
        else:
            work.append((st.st_mtime, "fresh", agent, p, st, None))
    sources[agent] = {"total": total, "indexed": indexed}
    return work

work = []
work += [(m, k, a, p, s, h) for (m, k, a, p, s, h) in file_entries("claude", claude_cands, "claude")]
work += file_entries("codex", codex_cands, "codex")
work += file_entries("pi", pi_cands, "pi")
work += file_entries("omp", omp_cands, "omp")
work += file_entries("gemini", gem_cands, "gemini")
work += file_entries("opencode", oc_cands, "opencode")

# newest first across all agents
work.sort(key=lambda w: w[0], reverse=True)

drops = {}
for mtime_v, kind, agent, path, st, hit in work:
    if kind == "deep":
        continue  # cache hit; emitted below
    if out_of_head_budget():
        continue  # head parse deferred to a later pass
    entry = refresh_entry(agent, path, st)
    if entry is None:
        # not a session (omp changes.jsonl and friends): not counted in total
        drops[agent] = drops.get(agent, 0) + 1
        continue
    sources[agent]["indexed"] += 1
    cache[path] = entry

for agent, n in drops.items():
    if agent in sources and n:
        sources[agent]["total"] = max(0, sources[agent]["total"] - n)

# zcode entries (cache keyed by dir; changed dirs re-read their newest meta) -
zcode_cands = []
for p in zc_dirs:
    try: st = os.stat(p)
    except OSError: continue
    seen.add(p)
    zcode_cands.append((mtime(p), p, st))
zcode_cands.sort(key=lambda w: w[0], reverse=True)
sources["zcode"] = {"total": len(zcode_cands), "indexed": 0}
for mtime_v, path, st in zcode_cands:
    hit = cache.get(path)
    valid = hit and isinstance(hit, dict) and hit.get("agent") == "zcode" \
        and hit.get("mtime") == int(st.st_mtime * 1000)
    if valid:
        entry = hit
        sources["zcode"]["indexed"] += 1
    else:
        if out_of_head_budget():
            continue
        cwd = ""; preview = ""; newest = int(st.st_mtime * 1000)
        metas = []
        for dirpath, _dirs, files in os.walk(path):
            if "metadata.json" in files:
                metas.append(os.path.join(dirpath, "metadata.json"))
        metas.sort(key=mtime, reverse=True)
        for m in metas[:1]:
            try:
                mst = os.stat(m)
                newest = max(newest, int(mst.st_mtime * 1000))
                d = json_file(m)
                if isinstance(d, dict):
                    cwd = str(d.get("cwd") or "")
                    preview = clean(d.get("description") or d.get("task") or "", 160)
            except Exception:
                pass
        entry = {"agent": "zcode", "path": path, "id": os.path.basename(path)[5:],
                 "cwd": cwd, "preview": preview, "msgs": None, "model": "",
                 "mtime": newest, "size": 0, "argv": []}
        cache[path] = entry
        sources["zcode"]["indexed"] += 1

# deep streaming pass: newest first, budgeted
for mtime_v, kind, agent, path, st, hit in work:
    if out_of_budget():
        partial = True
        break
    entry = cache.get(path)
    if not entry or entry.get("agent") != agent: continue
    size = entry.get("size") or 0
    if entry.get("deep_upto", 0) >= size: continue
    if not deep_entry(agent, path, entry, size):
        partial = True
        break

# emit: everything indexed this pass or cached from earlier ones
for mtime_v, kind, agent, path, st, hit in work:
    entry = cache.get(path)
    if entry and isinstance(entry, dict) and entry.get("agent") == agent:
        add_from_entry(entry, st)
for mtime_v, path, st in zcode_cands:
    entry = cache.get(path)
    if entry and entry.get("agent") == "zcode":
        add_from_entry(entry, st)

# opencode db rows (fresh every pass) ---------------------------------------
oc_total = len(oc_cands) + len(oc_db_rows)
oc_indexed = sources.get("opencode", {}).get("indexed", 0) + len(oc_db_rows)
sources["opencode"] = {"total": oc_total, "indexed": oc_indexed}
for row in oc_db_rows:
    try:
        model = ""
        raw = row.get("model")
        if isinstance(raw, str) and raw.startswith("{"):
            model = str(json.loads(raw).get("id") or "")
        elif isinstance(raw, str):
            model = raw
        sessions.append({
            "agent": "opencode", "id": str(row.get("id") or ""), "path": db,
            "cwd": str(row.get("directory") or ""), "folder": os.path.basename(str(row.get("directory") or "").rstrip("/")),
            "preview": clean(row.get("title"), 160), "first_prompt": "",
            "msgs": row.get("msgs"), "model": model,
            "mtime": int(row.get("time_updated") or 0), "size": 0,
            "argv": ["opencode", "--session", str(row.get("id") or "")],
        })
    except Exception:
        continue

# prune cache keys whose files vanished (walk was complete) -----------------
for k in [k for k in cache if k not in seen]:
    if not os.path.exists(k):
        cache.pop(k, None)

save_cache()

sessions.sort(key=lambda s: s.get("mtime") or 0, reverse=True)
print(json.dumps({
    "ok": True,
    "partial": partial,
    "count": len(sessions[:limit]),
    "sources": sources,
    "sessions": sessions[:limit],
}))
PYEOF
