// Disk cache for GitHub answers, under data/issues/cache/, shared by every popup copy
// and kept across restarts, so reopening something doesn't spend rate limit again.
import * as fs from "fs/promises";
import { appHome, exec, notify, shared, setShared } from "herdr";

const dir = () => `${appHome()}/data/issues/cache`;
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261).toString(16);
const file = (key) => `${dir()}/${key.replace(/[^\w.-]+/g, "_").slice(0, 120)}-${hash(key)}.json`;

// gh missing or not logged in looks like an empty app: no repos are found, lists stay
// empty and nothing says why. One heads-up per run, shared with the sidebar through
// shared state, so the two mods don't each speak; it can re-say once an hour.
let ghNoticeShown = false;
const NOTICE_KEY = "github.unavailable.at";
export function ghNotice(detail) {
  if (ghNoticeShown) return;
  if (Date.now() - (shared(NOTICE_KEY) ?? 0) < 3600000) return;
  ghNoticeShown = true;
  setShared(NOTICE_KEY, Date.now());
  notify({
    title: "Issues: GitHub unavailable",
    body: `${detail || "gh did not answer"}. Lists stay empty until gh is installed and gh auth login has run.`,
    level: "warning",
  });
}

export async function readCache(key) {
  try { return JSON.parse(await fs.readFile(file(key), "utf8")); } catch { return null; }
}

export async function writeCache(key, value) {
  try { await fs.mkdir(dir(), { recursive: true }); await fs.writeFile(file(key), JSON.stringify(value)); } catch {}
}

export const age = (entry) => (entry?.at ? Date.now() - entry.at : Infinity);

// Has anything in the repo changed since `etag`? GitHub's newest-updated issue (PRs count)
// asked conditionally: a 304 answer doesn't count against the rate limit.
// Returns { changed, etag }; changed is true when unsure.
export async function repoChanged(repo, on, etag) {
  const args = ["api", "-i", `repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=1`];
  if (etag) args.splice(2, 0, "-H", `If-None-Match: ${etag}`);
  const r = await exec("gh", args, { on }).catch(() => null);
  const out = r?.stdout ?? "";
  if (/^HTTP\/[\d.]+ 304/m.test(out)) return { changed: false, etag };
  const tag = /^etag:\s*(.+?)\s*$/im.exec(out)?.[1] ?? null;
  return { changed: true, etag: tag };
}
