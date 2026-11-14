// node mods/orca-sidebar/git/checkouts.check.cjs: how a checkout is read from Git —
// folder resolution (the first terminal with a cwd defines it), the checkout key, and
// the porcelain v2 parse (branch, ahead/behind, repo name, worktree detection).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Canned git answers, keyed by what the call asks for.
let answers = {};
const env = {
  exec: async (cmd, args) => {
    assert.equal(cmd, "git");
    const a = args.join(" ");
    if (a.includes("--porcelain=v2")) return answers.status;
    if (a.includes("--show-toplevel")) return answers.top;
    if (a.includes("--git-common-dir")) return answers.common;
    throw new Error(`unexpected git call: ${a}`);
  },
};
const source = fs.readFileSync(path.join(__dirname, "checkouts.js"), "utf8")
  .replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export /gm, "")
  + "\nObject.assign(globalThis, { spaceFolder, checkoutKey, readCheckout });";
const ctx = vm.createContext(env);
vm.runInContext(source, ctx);
const { spaceFolder, checkoutKey, readCheckout } = ctx;
const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  // ---- spaceFolder: the first pane with a cwd among the space's tabs defines it ----
  const space = { id: "s1", folder: "/origin", tabs: [{ id: "t1" }, { id: "t2" }] };
  const panes = [
    { tab: "other-space-tab", cwd: "/elsewhere" },      // another space's pane: skipped
    { tab: "t1" },                                      // this space, but no cwd yet
    { tab: "t2", cwd: "/repo/worktree" },
  ];
  assert.equal(spaceFolder(space, panes), "/repo/worktree");
  assert.equal(spaceFolder({ ...space, tabs: [{ id: "t9" }] }, panes), "/origin", "no pane of ours: the space's folder");
  assert.equal(spaceFolder({ id: "s2", folder: "/origin", tabs: [] }, panes), "/origin");

  // ---- checkoutKey: machine and folder, both parts ----
  assert.equal(checkoutKey(space, panes), JSON.stringify([null, "/repo/worktree"]));
  assert.equal(checkoutKey({ ...space, machine: "vps" }, panes), JSON.stringify(["vps", "/repo/worktree"]));

  // ---- readCheckout: a main checkout ----
  answers = {
    status: { code: 0, stdout: "# branch.head main\n# branch.ab +1 -2\n1 M  file.txt\n" },
    top: { code: 0, stdout: "/repos/app\n" },
    common: { code: 0, stdout: "/repos/app/.git\n" },
  };
  assert.deepEqual(plain(await readCheckout("/repos/app", null)), {
    name: "app", branch: "main", ahead: 1, behind: 2,
    repo: JSON.stringify([null, "/repos/app/.git"]), linked: false,
  });

  // A worktree: its top differs from the common dir, so it is linked to the main checkout.
  answers.top = { code: 0, stdout: "/w/fix-login\n" };
  const wt = plain(await readCheckout("/w/fix-login", null));
  assert.equal(wt.linked, true);
  assert.equal(wt.name, "app", "the repo's own .git folder names it, not the worktree's");

  // Detached HEAD: no branch.head line, branch stays null (shown as "detached" later).
  answers.status = { code: 0, stdout: "# branch.ab +0 -0\n" };
  assert.equal((await readCheckout("/w/fix-login", null)).branch, null);

  // Ahead/behind absent: zeros, and a negative count is read as its magnitude.
  answers.status = { code: 0, stdout: "# branch.head main\n# branch.ab +0 -3\n" };
  const ab = await readCheckout("/repos/app", null);
  assert.equal(ab.ahead, 0); assert.equal(ab.behind, 3);

  // Not a repository, in this machine's own git language: null, so the row simply has
  // no branch to show — and the checkout is cached as null, not retried forever.
  answers.status = { code: 1, stderr: "fatal: 不是 Git 仓库（或者任何父目录）：.git" };
  assert.equal(await readCheckout("/Users/jesen", null), null);
  answers.status = { code: 1, stderr: "fatal: not a git repository (or any of the parent directories): .git" };
  assert.equal(await readCheckout("/Users/jesen", null), null);

  // Git failed for another reason: throw, so the caller keeps what it knew and retries.
  answers.status = { code: 128, stderr: "some other failure" };
  await assert.rejects(() => readCheckout("/repos/app", null), /Cannot read status/);

  console.log("checkouts: ok");
})().catch((e) => { console.error(e); process.exit(1); });
