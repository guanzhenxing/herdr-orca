# Changes

- 2026-11-13: when `gh` is missing or not logged in, the mod posts one warning notification (once
  per run) instead of failing silently — the repo picker and the lists would otherwise just stay
  empty with no reason shown.
- 2026-11-14: local folders are probed for their repository in parallel instead of one
  by one, so the repo picker fills in as fast as the slowest single gh call.
- 2026-11-14: the notice is deduped across mods through shared state (`github.unavailable.at`, at
  most one per hour), so the sidebar and this mod don't each speak. `prefill.sh` exits at once when
  `pbcopy` is missing (macOS-only); the new-worktree dialog now sends Linux to the clipboard path
  on its side.
