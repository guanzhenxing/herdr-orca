# Changes

- 2026-11-14: the issue prefill only runs its paste helper on macOS (it needs `pbcopy`); on Linux
  and Windows, and for remote spaces, the task lands on the clipboard with a paste hint, as Windows
  already did.
