// node mods/orca-sidebar/git/pr-status.check.cjs: repository URL parsing, PR appearance,
// how long a status may stand, the gh query cache, and the one GitHub-unavailable notice.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const notices = [];
let execCalls = 0;
let execAnswer = null; // {code, stdout, stderr}, or an Error to reject with
const env = {
  exec: async () => { execCalls++; if (execAnswer instanceof Error) throw execAnswer; return execAnswer; },
  appHome: () => "/tmp/pr-status-check",
  notify: (n) => notices.push(n),
  shared: () => 0,
  setShared: () => {},
  fs: { readFile: async () => { throw new Error("no saved state"); }, writeFile: async () => {}, mkdir: async () => {} },
};
const source = fs.readFileSync(path.join(__dirname, "pr-status.js"), "utf8")
  .replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "")
  + "\nObject.assign(globalThis, { githubRepository, prAppearance, prPlaceKey, standFor, PRStatusObserver, ghNotice });";
const plain = (v) => JSON.parse(JSON.stringify(v));
const ctx = vm.createContext(env);
vm.runInContext(source, ctx);
const { githubRepository, prAppearance, prPlaceKey, standFor, PRStatusObserver, ghNotice } = ctx;

// Only github.com remotes become repositories; nothing else reaches gh.
assert.equal(githubRepository("https://github.com/owner/repo"), "owner/repo");
assert.equal(githubRepository("https://github.com/owner/repo.git"), "owner/repo");
assert.equal(githubRepository("https://github.com/owner/repo/"), "owner/repo");
assert.equal(githubRepository("git@github.com:owner/repo.git"), "owner/repo");
assert.equal(githubRepository("ssh://git@github.com/owner/repo"), "owner/repo");
assert.equal(githubRepository("https://gitlab.com/owner/repo"), undefined);
assert.equal(githubRepository("https://github.com/owner/repo/tree/main"), undefined);
assert.equal(githubRepository(""), undefined);

const colors = { ansi1: "#red", ansi2: "#green", ansi5: "#purple", dim: "#dim" };
assert.deepEqual(plain(prAppearance({ state: "MERGED" }, colors)), { icon: "merged", color: "#purple", label: "Merged" });
assert.deepEqual(plain(prAppearance({ state: "CLOSED" }, colors)), { icon: "closed", color: "#red", label: "Closed" });
assert.deepEqual(plain(prAppearance({ state: "OPEN", isDraft: true }, colors)), { icon: "draft", color: "#dim", label: "Draft" });
assert.deepEqual(plain(prAppearance({ state: "OPEN", statusCheckRollup: [{ conclusion: "FAILURE" }] }, colors)),
  { icon: "pull-request", color: "#red", label: "Checks failed" });
assert.deepEqual(plain(prAppearance({ state: "OPEN", statusCheckRollup: [{ status: "IN_PROGRESS" }] }, colors)),
  { icon: "pull-request", color: "#green", label: "Open" });
assert.deepEqual(plain(prAppearance({ state: "OPEN", statusCheckRollup: [] }, colors)),
  { icon: "pull-request", color: "#green", label: "Open" });

// A running check is rechecked in 2 minutes, a settled open PR in 10, closed ones rarely.
const MIN = 60000;
assert.equal(standFor([]), 30 * MIN);
assert.equal(standFor([{ state: "MERGED" }]), 60 * MIN);
assert.equal(standFor([{ state: "OPEN", statusCheckRollup: [{ status: "IN_PROGRESS" }] }]), 2 * MIN);
assert.equal(standFor([{ state: "OPEN", statusCheckRollup: [{ conclusion: "SUCCESS" }] }]), 10 * MIN);

// The machine is part of the key, so remote paths cannot collide with local ones.
assert.equal(prPlaceKey(null, "/w"), prPlaceKey(null, "/w"));
assert.notEqual(prPlaceKey(null, "/w"), prPlaceKey("vps", "/w"));

(async () => {
  // gh failures throw and say why exactly once; a success is cached for maxAge.
  const observer = new PRStatusObserver();
  execAnswer = { code: 1, stderr: "gh: To get started with GitHub CLI, run: gh auth login" };
  await assert.rejects(() => observer.query(["pr", "list"]), /gh auth login/);
  assert.equal(notices.length, 1);
  assert.match(notices[0].title, /GitHub unavailable/);
  assert.match(notices[0].body, /gh auth login/);
  await assert.rejects(() => observer.query(["pr", "list"]));
  assert.equal(notices.length, 1, "one notice, not one per failure");
  // Another context (the issues mod's) reading a fresh shared key stays quiet too.
  const quiet = (() => {
    const more = [];
    const other = vm.createContext({ ...env, notify: (n) => more.push(n), shared: () => Date.now() });
    vm.runInContext(source, other);
    other.ghNotice("x");
    return more.length;
  })();
  assert.equal(quiet, 0, "a fresh shared key suppresses the other mod's notice");

  execAnswer = { code: 0, stdout: '{"number":7}' };
  assert.deepEqual(plain(await observer.query(["pr", "view", "7"])), { number: 7 });
  const afterFirst = execCalls;
  assert.deepEqual(plain(await observer.query(["pr", "view", "7"])), { number: 7 });
  assert.equal(execCalls, afterFirst, "second ask within maxAge is answered from cache");
  await observer.query(["pr", "view", "7"], 0);
  assert.equal(execCalls, afterFirst + 1, "maxAge 0 asks again");

  console.log("pr-status: ok");
})().catch((e) => { console.error(e); process.exit(1); });
