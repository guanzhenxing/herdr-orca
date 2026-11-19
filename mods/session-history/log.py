#!/usr/bin/env python3
# Reads agent session transcripts for the session-history mod, two subcommands:
#
#   log.py text <path> <agent>     readable transcript head (for the 日志 viewer)
#   log.py summary <path> <agent>  one JSON line {ok, id, file, firstUser,
#                                  lastUsers[], lastAssistant, bytes, startedAt, lastAt}
#                                  (for the 移交 brief)
#
# Both accept a file path; <agent> "zcode" may pass a sess_<id> directory
# instead (newest agent_*/ metadata + output). Keep in sync with scan.sh's
# per-agent formats when a CLI changes its store layout.
import json
import os
import sys


def clean(s, n):
    s = " ".join(str(s or "").split())
    return s[:n] if len(s) > n else s


def head_records(path, cap=262144):
    recs = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(cap)
        for line in head.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except Exception:
                recs.append(None)
    except OSError:
        pass
    return recs


def tail_text(path, cap=2097152):
    """Last cap bytes of a text file, first (partial) line dropped."""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            if size > cap:
                f.seek(size - cap)
            data = f.read()
        text = data.decode("utf-8", "replace")
        if size > cap:
            text = text.split("\n", 1)[-1]
        return text
    except OSError:
        return ""


def texts_of(content):
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        return [c.get("text") for c in content
                if isinstance(c, dict) and c.get("type") == "text" and c.get("text")]
    return []


def messages(agent, path):
    """Yields (role, text, timestamp) for user/assistant turns."""
    if agent == "gemini":
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                d = json.load(f)
        except Exception:
            return
        for m in d.get("messages") or []:
            if not isinstance(m, dict):
                continue
            role = "user" if m.get("type") == "user" else ("assistant" if m.get("type") == "gemini" else None)
            if role and m.get("content"):
                yield role, str(m["content"]), m.get("timestamp")
        return
    if agent == "codex":
        # codex files can be huge: stream lines, keep user/assistant events
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line or '"user_message"' not in line and '"agent_message"' not in line:
                        continue
                    try:
                        o = json.loads(line)
                    except Exception:
                        continue
                    pl = o.get("payload") if isinstance(o.get("payload"), dict) else None
                    if not pl:
                        continue
                    t = pl.get("type")
                    if t == "user_message" and pl.get("message"):
                        yield "user", str(pl["message"]), o.get("timestamp")
                    elif t == "agent_message" and pl.get("message"):
                        yield "assistant", str(pl["message"]), o.get("timestamp")
        except OSError:
            pass
        return
    # claude / pi / omp: one JSON record per line with message.role
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or '"role"' not in line:
                    continue
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if not isinstance(o, dict):
                    continue
                m = o.get("message") if isinstance(o.get("message"), dict) else o
                role = m.get("role")
                if role not in ("user", "assistant"):
                    continue
                if o.get("isSidechain") or o.get("isMeta"):
                    continue
                text = o.get("content") if isinstance(o.get("content"), str) else None
                if text is None:
                    parts = texts_of(m.get("content"))
                    text = "\n".join(parts)
                if text:
                    yield role, text, o.get("timestamp")
    except OSError:
        pass


def collect(agent, path):
    first_user = None
    started_at = None
    last_at = None
    users = []
    assistant = None
    count = 0
    for role, text, ts in messages(agent, path):
        count += 1
        text = text.strip()
        if not text:
            continue
        if started_at is None:
            started_at = ts
        last_at = ts
        if role == "user":
            if first_user is None and not text.startswith("<"):
                first_user = text
            if not text.startswith("<"):
                users.append(text)
        else:
            assistant = text
    return {
        "first_user": first_user,
        "last_users": users[-3:],
        "last_assistant": clean(assistant, 2000) if assistant else None,
        "count": count,
        "started_at": started_at,
        "last_at": last_at,
    }


def zcode_dir(dirpath):
    """Newest run's metadata + output for a sess_<id> directory."""
    meta = None
    out = None
    newest = -1
    try:
        for dirpath_, _dirs, files in os.walk(dirpath):
            if "metadata.json" in files and "output.txt" in files:
                m = os.path.join(dirpath_, "metadata.json")
                mt = os.path.getmtime(m)
                if mt > newest:
                    newest = mt
                    meta = m
                    out = os.path.join(dirpath_, "output.txt")
    except OSError:
        pass
    d = {}
    if meta:
        try:
            with open(meta, encoding="utf-8", errors="replace") as f:
                d = json.load(f)
        except Exception:
            d = {}
    desc = str(d.get("description") or d.get("task") or "")
    tail = tail_text(out, 16384) if out else ""
    return {
        "first_user": desc,
        "last_users": [desc] if desc else [],
        "last_assistant": clean(tail, 2000) or None,
        "count": None,
        "started_at": d.get("createdAt"),
        "last_at": d.get("finishedAt") or d.get("createdAt"),
    }


def do_summary(path, agent):
    size = 0
    if os.path.isdir(path):
        info = zcode_dir(path)
        sid = os.path.basename(path)[5:]
    else:
        size = os.path.getsize(path) if os.path.isfile(path) else 0
        if agent == "gemini":
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    d = json.load(f)
                sid = str(d.get("sessionId") or os.path.splitext(os.path.basename(path))[0])
            except Exception:
                sid = os.path.splitext(os.path.basename(path))[0]
        elif agent == "opencode":
            sid = os.path.splitext(os.path.basename(path))[0]
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    d = json.loads(f.read(65536))
                sid = str(d.get("id") or sid)
            except Exception:
                pass
        else:
            sid = os.path.splitext(os.path.basename(path))[0]
            for o in head_records(path, 10):
                if isinstance(o, dict):
                    if o.get("sessionId"):
                        sid = str(o["sessionId"]); break
                    if o.get("type") == "session" and o.get("id"):
                        sid = str(o["id"]); break
                    if o.get("type") == "session_meta" and isinstance(o.get("payload"), dict) and o["payload"].get("id"):
                        sid = str(o["payload"]["id"]); break
        info = collect(agent, path)
    print(json.dumps({
        "ok": True,
        "id": sid,
        "file": path,
        "bytes": size,
        "firstUser": clean(info["first_user"], 500),
        "lastUsers": [clean(u, 800) for u in info["last_users"]],
        "lastAssistant": info["last_assistant"],
        "count": info["count"],
        "startedAt": info["started_at"],
        "lastAt": info["last_at"],
    }, ensure_ascii=False))


def do_text(path, agent):
    cap = 120 * 1024
    parts = []
    if os.path.isdir(path):
        info = zcode_dir(path)
        parts.append(f"ZCode 会话 {os.path.basename(path)[5:]}")
        if info["first_user"]:
            parts.append(f"任务: {clean(info['first_user'], 800)}")
        if info["last_assistant"]:
            parts.append("\n── 输出（最后一段）──\n" + info["last_assistant"][:8000])
        sys.stdout.write("\n".join(parts)[:cap])
        return
    size = os.path.getsize(path) if os.path.isfile(path) else 0
    parts.append(f"{agent} · {os.path.basename(path)} · {size // 1024} KB\n")
    shown = 0
    for role, text, _ts in messages(agent, path):
        text = text.strip()
        if not text or text.startswith("<"):
            continue
        label = "用户" if role == "user" else "助手"
        parts.append(f"\n── {label} ──\n{clean(text, 2000)}")
        shown += len(parts[-1])
        if shown > cap:
            break
    if size > cap * 4:
        parts.append(f"\n…（仅显示前段，完整记录见原文件）")
    sys.stdout.write("\n".join(parts)[:cap + 4096])


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in ("text", "summary"):
        print("usage: log.py text|summary <path> <agent>", file=sys.stderr)
        sys.exit(2)
    cmd, path, agent = sys.argv[1], sys.argv[2], sys.argv[3]
    if not os.path.exists(path):
        print(json.dumps({"ok": False, "reason": "not found: " + path}))
        sys.exit(0)
    if cmd == "summary":
        do_summary(path, agent)
    else:
        do_text(path, agent)


if __name__ == "__main__":
    main()
