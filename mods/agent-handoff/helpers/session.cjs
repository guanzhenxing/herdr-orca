// Finds the newest Claude Code session for a working directory and prints a
// handoff summary as one JSON line. Read-only.
//
//   node session.cjs <cwd>
//
// Claude keeps sessions in "$CLAUDE_CONFIG_DIR/projects/<munged-cwd>/<id>.jsonl"
// (default ~/.claude/projects); one JSON object per line. We only need the task's
// ends: the first user message, the last few user messages and the last assistant
// text, so small files are read whole and big ones head + tail (screenshots make
// lines huge). Prints {ok:false, reason} when nothing is found.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const WHOLE = 48 * 1024 * 1024; // read the whole file up to this; beyond, tail only
const HEAD = 512 * 1024;
const TAIL = 2 * 1024 * 1024;

const textOf = (content) =>
  typeof content === "string" ? content
  : Array.isArray(content) ? content.filter((c) => c?.type === "text").map((c) => c.text).join("\n").trim()
  : "";

const clean = (s, max) =>
  String(s ?? "").replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function rows(file, wantHead) {
  const stat = fs.statSync(file);
  const fd = fs.openSync(file, "r");
  const len = Math.min(stat.size, wantHead ? HEAD : TAIL);
  const start = wantHead ? 0 : Math.max(0, stat.size - TAIL);
  const buf = Buffer.alloc(len);
  try { fs.readSync(fd, buf, 0, len, start); } finally { fs.closeSync(fd); }
  let lines = buf.toString("utf8").split("\n");
  if (!wantHead && start > 0) lines.shift(); // starts mid-line
  if (wantHead && start + len < stat.size) lines.pop(); // ends mid-line
  const out = [];
  for (const l of lines) {
    if (!l) continue;
    try { out.push(JSON.parse(l)); } catch { /* a line still being written */ }
  }
  return out;
}

function userText(r) {
  if (r?.type !== "user" || r.isMeta || r.isSidechain) return null;
  const t = textOf(r.message?.content);
  // Tool results ride in user rows as content arrays; a real person's line has text.
  if (!t || Array.isArray(r.message?.content) && r.message?.content.some((c) => c?.type === "tool_result")) return null;
  if (t.startsWith("<command-name>") || t.startsWith("<local-command-") || t.startsWith("Caveat:")) return null;
  return t;
}

function main() {
  const cwd = process.argv[2];
  if (!cwd) return out({ ok: false, reason: "缺少启动目录参数" });
  const root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");
  // Claude munges the cwd the same way for every non-alphanumeric character.
  const dir = path.join(root, "-" + cwd.slice(1).replace(/[^a-zA-Z0-9]/g, "-"));
  if (!fs.existsSync(dir)) return out({ ok: false, reason: "没有找到这个目录的 Claude Code 会话" });
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(dir, f))
    .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!files.length) return out({ ok: false, reason: "这个目录还没有 Claude Code 会话" });
  const file = files[0];
  const stat = fs.statSync(file);

  let head = [], tail = [];
  if (stat.size <= WHOLE) {
    const all = fs.readFileSync(file, "utf8").split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    head = all; tail = all;
  } else {
    head = rows(file, true); tail = rows(file, false);
  }
  const firstUser = clean(head.map(userText).find(Boolean), 300);
  const users = tail.map(userText).filter(Boolean);
  const lastUsers = users.slice(-3).map((u) => clean(u, 300));
  const times = tail.flatMap((r) => (r?.timestamp ? [r.timestamp] : []));
  if (stat.size > WHOLE && head.length) {
    const t = head.find((r) => r?.timestamp)?.timestamp;
    if (t) times.unshift(t);
  }
  // After the times are taken: the search runs on a reversed copy, so the
  // file's order stays intact above.
  const lastAssistant = clean([...tail].reverse().map((r) => (r?.type === "assistant" && !r.isSidechain) ? textOf(r.message?.content) : null).find((t) => t), 600);
  return out({
    ok: true,
    file,
    id: path.basename(file, ".jsonl"),
    bytes: stat.size,
    modifiedAt: Math.floor(stat.mtimeMs / 1000),
    startedAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    firstUser,
    lastUsers,
    lastAssistant: lastAssistant ?? null,
    whole: stat.size <= WHOLE,
  });
}

function out(v) {
  process.stdout.write(JSON.stringify(v) + "\n");
}

main();
