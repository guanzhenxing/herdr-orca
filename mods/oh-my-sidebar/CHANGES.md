# Changes in this copy

This mod is Better Sidebar 3.0.0 from [munza/herdr-mods](https://github.com/munza/herdr-mods)
(Apache-2.0, see `NOTICE` and `THIRD_PARTY.md` at the repository root), modified for the oh-my-herdr layout.

Modified files:

- `main.js`: registers the `card` and `groups` views.
- `views/list-tabs.js` (added): the sidebar's Spaces/Agents segmented tab bar. The layout's
  `sidebar-lists` is a stack now — each list gets the sidebar's full height, the tab bar lives in
  each view's own header (a view renders only while active), and `cmd-shift-a` flips tabs via
  panel-toggle's `toggle-list`.
- `views/spaces.js`: issue badges beside PR badges, both opening the issues mod's viewer;
  a live-ports plug icon on the branch line; the hover card; repo-row hover buttons
  (fold worktrees, menu, new worktree); one section per machine (bold bar, green dot while connected, a
  rule between machines); folders (`views/groups.js`): any space or repo can be filed, by dragging
  it onto a folder header, beside a row in another folder, onto the take-out or new-folder targets
  shown while dragging, or from the space menu's "Move to folder…"; folders are shared by every
  machine but show under a machine only when they hold its spaces, fold per machine, sum their
  agents when folded, and a drag never leaves its machine; going to a space opens its machine,
  folder and repo; the space menu is `my-menu`;
  agents and their sub-agent trees drawn under each space, always on (the old "Agents"
  chip is gone — the Spaces/Agents tabs took its place, and init carries an old off value
  back over once), the fold chevron hides a space's worktrees and agents together;
  a moon and "Asleep" on a space the hibernate mod put to sleep; every + (Spaces, a machine's
  header, "New space there") starts the space in its machine's home, not the focused folder.
  It shares its drawn space order, and `agent.next` / `agent.prev` follow that order.
  The list scrolls itself (wheel, a draggable thumb) so it can follow the active space's row.
- `views/panel-toggle.js`: also takes `next-space` / `prev-space`, stepping through spaces in the list's order,
  `next-agent` / `prev-agent`, stepping through agents as the list draws them (sub-agents under their parent),
  and `toggle-list`, flipping the sidebar's Spaces/Agents tabs (`cmd-shift-a`).
- `views/find-node.js`: `hasSpacesView`.
- `views/ui.js`: exports `RADIUS`.
- `views/footer.js`: adapted to this layout; "N agents · N need you" while agents show in spaces.
  Its old Agents-panel toggle button is gone: it ignored the inline state and could show agents
  twice (panel open while inline) or hide both; the tab bar is the single switch. Settings and
  **Mod settings** (sliders, opens munza's `better-config` — moved out of the sidebar-nav links)
  are icon buttons together at the left, named by their tooltips; the agent count stays at the
  right.
- `views/agents.js`: sets agent order only when the layout has no spaces list; exports its helpers (status mark, icon, labels, durations) for the spaces list;
  its header is the Spaces/Agents tab bar plus the sort menu (in the rail, the icon tab bar alone);
  no rule above groups and no top border — the Spaces tab draws neither, so the tabs match;
  a sub-agent kept as a pane shows only nested under its parent (not also
  as its own row), and clicking it focuses its pane instead of peeking.
- `git/pr-status.js`: finds each checkout's issue (git-config link, PR closing references,
  "Closes #N", or a branch number checked against GitHub) and carries it with the PRs. When `gh`
  is missing or not logged in, one notification says GitHub is unavailable (once per run, deduped
  with the issues mod through shared state) instead of every badge failing silently. Repo probes
  run in parallel, so a multi-repo round takes the slowest single call, not their sum.
- `git/checkouts.js`: "not a git repository" is matched in the person's language (English and
  中文 at least) — a Chinese-localized git used to make every non-repo folder look like a read
  failure, re-probing it forever instead of caching it as null. `git/checkouts.check.cjs` (added)
  pins the porcelain parse, folder resolution and both messages.
- `mod.json`: settings for this layout.

Added files: `views/card.js`, `views/groups.js`, `views/space-agents.js`, `views/space-nav.js`, `views/list-tabs.js`, `git/project-icons.js`, and icons
(`bot`, `moon`, `copy`, `ellipsis`, `external`, `folder`, `folder-plus`, `github`, `issue`, `issue-closed`,
`panel-bottom`, `plug`, `sliders`). Removed: `mod.schema.json`, `icons/sliders.svg`.
