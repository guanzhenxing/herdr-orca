// ZCode: the GLM Coding Plan usage magpie has already read from Z.ai
// (helpers/zcode-limits.sh). magpie talks to the vendor with its own
// sign-in; this mod reads only magpie's local answer and no token.
import { makeWindow, okReport, errorReport, unavailableReport, toEpoch } from "../lib/report.js";

const SOURCE = "magpie quotas";
const HOUR = 3600;
const DAY = 24 * HOUR;

// magpie names a window as Z.ai's usage page does; the mod wants a short
// label and the window's length (for the pace tick). Unknown names keep
// theirs, with no span.
const KNOWN = {
  "5 hours": { id: "5h", short: "5h", long: "5-hour", durationSec: 5 * HOUR },
  "Weekly": { id: "weekly", short: "wk", long: "Weekly", durationSec: 7 * DAY },
  "Monthly": { id: "monthly", short: "mo", long: "Monthly", durationSec: 30 * DAY },
  "30 days": { id: "30d", short: "30d", long: "30 days", durationSec: 30 * DAY },
  "MCP · Month": { id: "mcp-month", short: "mcp", long: "MCP · Month", durationSec: 30 * DAY },
};

function windowFromEntry(w, i) {
  const known = KNOWN[w?.name] ?? null;
  const name = typeof w?.name === "string" && w.name ? w.name : `window ${i + 1}`;
  const percent = Number.isFinite(w?.used) ? w.used
    : Number.isFinite(w?.remaining) ? 100 - w.remaining
    : null;
  if (percent == null) return null;
  const slug = known ? known.id : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `w${i}`;
  return makeWindow({
    id: slug,
    short: known ? known.short : name,
    long: known ? known.long : name,
    percent,
    resetsAt: toEpoch(w?.resetsAt),
    durationSec: known ? known.durationSec : null,
  });
}

export function parse(text, now) {
  let body;
  try {
    body = JSON.parse(String(text ?? "").trim());
  } catch {
    return errorReport(SOURCE, "No reply from magpie", now);
  }
  if (body?.error) return errorReport(SOURCE, String(body.error.message ?? "magpie error"), now);
  const all = Array.isArray(body?.data) ? body.data : [];
  const entry = all.find((e) => e?.provider === "zcode") ?? null;
  if (!entry) return unavailableReport(SOURCE, "magpie has no ZCode account", now);
  const windows = (Array.isArray(entry.windows) ? entry.windows : [])
    .map(windowFromEntry)
    .filter(Boolean);
  const observedAt = toEpoch(entry.readAt) ?? now;
  if (!windows.length) return unavailableReport(SOURCE, "No limit windows in magpie's reply", now);
  return okReport(SOURCE, now, windows, entry.plan ?? null, observedAt);
}

export default {
  id: "zcode",
  name: "ZCode",
  // image() resolves against Herdr's application root, like the other
  // providers' icons/*.svg; the mod's own copy is reachable from there.
  icon: "mods/usage-limits/icons/zcode.svg",
  helper: "helpers/zcode-limits.sh",
  parse,
};
