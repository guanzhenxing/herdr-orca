# Changes

This mod is Herdr's shipped Files panel (0.1.11, Apache-2.0) with a right-click
"open with" menu added on top; see menu.js and items.js.

- 2026-11-19: a failed folder listing retries once after 500 ms, and the error carries
  the exit code ("Cannot list this folder (exit 7)") — the listing script fails silently
  (`test -d` prints nothing), so the bare message said nothing about the cause.
- 2026-11-19: a wedged listing no longer freezes the panel. `loading` used to block every
  later refresh forever, which is why one failed listing could stay on screen
  indefinitely; after 30 s a timed refresh takes over, and the header's new refresh
  button (like Changes', spins while listing) takes over immediately on click. The spin
  is held for a full turn per click — a local listing answers in milliseconds, before
  any render could show the spin otherwise.
