# Changes

- 2026-11-14: the **+** lives inside the tab scroll area, right after the last tab
  (browser-style) instead of at the row's right edge; Files / Changes keep that edge.
- 2026-11-14: the tab bar's sidebar toggle shows only while the sidebar is hidden — Herdr's brand
  button covers the shown sidebar, so exactly one toggle is on screen at a time. It restores with
  `layout.show` (the sidebar comes back at its remembered width).
