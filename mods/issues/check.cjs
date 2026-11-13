// node mods/issues/check.cjs: the disk cache round-trip, conditional repo probes
// (ETag / 304 / failure), and the "N minutes ago" timestamps the table shows.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "issues-check-"));
const notices = [];
let execAnswer = null;
const env = {
  appHome: () => tmp,
  fs: require("node:fs/promises"),
  exec: async () => { if (execAnswer instanceof Error) throw execAnswer; return execAnswer; },
  notify: (n) => notices.push(n),
  shared: () => 0,
  setShared: () => {},
  // main.js's imports, inert at load time.
  View: class {}, div: () => ({}), svg: () => ({}), image: () => ({}),
  v_flex: () => ({}), h_flex: () => ({}), InputState: { new: () => ({}) }, Input: { new: () => ({}) },
  run: () => {}, theme: () => ({}), openOverlay: () => {}, closeOverlay: () => {},
  props: () => ({}), spaces: () => [], panes: () => [], focused: () => ({}),
};

const plain = (v) => JSON.parse(JSON.stringify(v));
const load = (file, names, extra = {}) => {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8")
    .replace(/^import [\s\S]*?;\r?\n/gm, "").replace(/^export (default )?/gm, "")
    + `\nObject.assign(globalThis, { ${names} });`;
  const ctx = vm.createContext({ ...env, ...extra });
  vm.runInContext(source, ctx);
  return ctx;
};

(async () => {
  // ---- cache.js: disk round-trip, key sanitising, conditional probes ----
  const cache = load("cache.js", "readCache, writeCache, age, repoChanged, file, ghNotice");

  await cache.writeCache("list:owner/repo|is:open", { items: [1, 2] });
  assert.deepEqual(plain(await cache.readCache("list:owner/repo|is:open")), { items: [1, 2] });
  assert.equal(await cache.readCache("nothing"), null);
  const escaped = path.resolve(await cache.file("../evil/key"));
  assert.ok(escaped.startsWith(path.resolve(tmp)), "a hostile cache key must not escape the cache dir");
  assert.ok(await cache.age({ at: Date.now() - 5000 }) >= 4999);
  assert.equal(cache.age({}), Infinity);
  assert.equal(cache.age(null), Infinity);

  execAnswer = { stdout: 'HTTP/2 304\netag: W/"kept"\n' };
  assert.deepEqual(plain(await cache.repoChanged("owner/repo", null, 'W/"kept"')), { changed: false, etag: 'W/"kept"' });
  execAnswer = { stdout: 'HTTP/2 200\netag: W/"new"\n[]' };
  assert.deepEqual(plain(await cache.repoChanged("owner/repo", null, null)), { changed: true, etag: 'W/"new"' });
  execAnswer = new Error("cannot run gh");
  assert.deepEqual(plain(await cache.repoChanged("owner/repo", null, null)), { changed: true, etag: null },
    "unsure counts as changed, and a failed probe has no etag");
  assert.equal(notices.length, 0, "the probe itself stays quiet; the caller shows the error");
  cache.ghNotice("cannot run gh");
  assert.equal(notices.length, 1);
  cache.ghNotice("again");
  assert.equal(notices.length, 1, "never one notice per probe");

  // ---- main.js: the age labels under UPDATED ----
  const main = load("main.js", "updated, location");
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  assert.equal(main.updated(ago(30 * 1000)), "just now");
  assert.equal(main.updated(ago(75 * 1000)), "1 minute ago");
  assert.equal(main.updated(ago(130 * 1000)), "2 minutes ago");
  assert.equal(main.updated(ago(HOUR)), "1 hour ago");
  assert.equal(main.updated(ago(2 * HOUR)), "2 hours ago");
  assert.equal(main.updated(ago(DAY)), "yesterday");
  assert.equal(main.updated(ago(2 * DAY)), "2 days ago");
  assert.equal(main.updated(ago(45 * DAY)), "1 month ago");
  assert.equal(main.updated(ago(400 * DAY)), "1y ago");

  // The focused pane's folder wins; without a pane, the space's folder does.
  const paneWins = load("main.js", "location", {
    spaces: () => [{ active: true, id: "s1", machine: null, folder: "/repo" }],
    panes: () => [{ pane: "p1", terminal: "t1", cwd: "/repo/sub" }],
    focused: () => ({ pane: "p1" }),
  }).location;
  assert.deepEqual(plain(paneWins()), { cwd: "/repo/sub", on: null });
  const spaceFalls = load("main.js", "location", {
    spaces: () => [{ active: true, id: "s1", machine: null, folder: "/repo" }],
    panes: () => [], focused: () => ({}),
  }).location;
  assert.deepEqual(plain(spaceFalls()), { cwd: "/repo", on: null });

  console.log("issues: ok");
})().catch((e) => { console.error(e); process.exit(1); });
