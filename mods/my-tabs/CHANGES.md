# Changes

- 2026-11-14: the **+** lives inside the tab scroll area, right after the last tab
  (browser-style) instead of at the row's right edge; Files / Changes keep that edge.
- 2026-11-14: the tab bar's sidebar toggle shows only while the sidebar is hidden — Herdr's brand
  button covers the shown sidebar, so exactly one toggle is on screen at a time. It restores with
  `layout.show` (the sidebar comes back at its remembered width).

- 2026-11-19: the Files / Changes / Excalidraw buttons left this row — the right panel
  now carries its own header (`mods/panel-head`, Orca-style: Files | Changes segment,
  Excalidraw icon, ✕). The tab bar keeps only tab pills and the layout's 36px panel
  toggle; `syncPanel`'s per-space auto open/close is unchanged.
