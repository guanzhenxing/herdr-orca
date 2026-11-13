// node mods/hibernate/core.check.cjs: which launch flags survive a wake, the resume
// command lines (quoting included), and what counts as an idle shell to type into.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const env = {
  hc: async () => { throw new Error("no hc in checks"); },
  exec: async () => { throw new Error("no exec in checks"); },
  home: () => "/home/test",
  readTextFile: async () => { throw new Error("no files in checks"); },
};
const source = fs.readFileSync(path.join(__dirname, "core.js"), "utf8")
  .replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "")
  + "\nObject.assign(globalThis, { machineOf, kept, resumeArgv, commandLine, program, idleShell, kind });";
const plain = (v) => JSON.parse(JSON.stringify(v));
const ctx = vm.createContext(env);
vm.runInContext(source, ctx);
const { machineOf, kept, resumeArgv, commandLine, program, idleShell, kind } = ctx;

assert.equal(machineOf("vps/t3"), "vps");
assert.equal(machineOf("t3"), null);

// Only known flags ride along; a valued flag at the very end has nothing to value.
assert.deepEqual(plain(kept(["claude", "--model", "opus", "--verbose", "--whatever"], "claude")),
  ["--model", "opus", "--verbose"]);
assert.deepEqual(plain(kept(["claude", "--model"], "claude")), []);
assert.deepEqual(plain(kept(["codex", "-m", "o4", "--yolo", "--bogus"], "codex")), ["-m", "o4", "--yolo"]);
assert.deepEqual(plain(kept(["codex", "--add-dir"], "codex")), [], "claude's valued flag is not codex's");

assert.deepEqual(plain(resumeArgv({ kind: "claude", session: "s1", argv: ["claude", "--model", "opus"] })),
  ["claude", "--model", "opus", "--resume", "s1"]);
assert.deepEqual(plain(resumeArgv({ kind: "claude", session: null, argv: ["claude", "--model", "opus"] })),
  ["claude", "--model", "opus"], "no session: run the command again");
assert.deepEqual(plain(resumeArgv({ kind: "codex", session: "u1", argv: ["codex", "--yolo"] })),
  ["codex", "resume", "--no-daemon", "--yolo", "u1"]);
assert.deepEqual(plain(resumeArgv({ kind: "codex", session: null, argv: ["codex"] })),
  ["codex", "resume", "--no-daemon", "--last"]);
assert.deepEqual(plain(resumeArgv({ kind: "program", argv: ["nvim"] })), ["nvim"]);

assert.equal(commandLine({ kind: "claude", session: "s1", cwd: "/my repo", argv: ["claude", "--model", "o"] }),
  "cd '/my repo' && claude --model o --resume s1");
assert.equal(commandLine({ kind: "claude", session: "s1", cwd: "/w", argv: ["claude"] }),
  "cd /w && claude --resume s1", "plain tokens stay unquoted");
assert.equal(commandLine({ kind: "claude", session: "s1", cwd: "/a'b", argv: ["claude"] }),
  "cd '/a'\\''b' && claude --resume s1", "a quote in the path cannot escape the quoting");

// A shell is not a program; the agent on top of it is. Only live terminals count.
assert.equal(program(null), null);
assert.equal(program({ state: "exited", pid: 1, foreground: { pid: 1, argv: ["claude"] } }), null);
assert.equal(program({ state: "live", pid: 1, foreground: { pid: 1, argv: ["zsh", "-li"] } }), null);
const agent = { state: "live", pid: 5, foreground: { pid: 9, argv: ["claude"], name: "claude" } };
assert.deepEqual(program(agent), agent.foreground);
assert.equal(idleShell(agent), false, "an agent on top is not idle");
assert.equal(idleShell({ state: "live", pid: 5, foreground: { pid: 5, argv: ["zsh", "-li"] } }), true);
assert.equal(idleShell({ state: "exited", pid: 5, foreground: null }), false);
assert.equal(kind(agent, agent.foreground), "claude");
assert.equal(kind({ status: { app: "claude-code" } }, { argv: ["/x/other"], name: "other" }), "claude");
assert.equal(kind({}, { argv: ["codex"], name: "codex" }), "codex");
assert.equal(kind({}, { argv: ["nvim"], name: "nvim" }), "program");

console.log("hibernate core: ok");
