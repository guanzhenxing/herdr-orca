# Third-party notices

| Component | Source | License | Where |
| --- | --- | --- | --- |
| herdr-automations | [DnzzL/herdr-automations](https://github.com/DnzzL/herdr-automations), © 2026 Thomas Legrand | MIT | `mods/automations/` is its app mod (only `mod.json` adapted); its Go CLI is vendored in `cli/herdr-automations/` with two atomic-write patches — see its `VENDOR.md` |
| Better Sidebar 3.0.0 | [munza/herdr-mods](https://github.com/munza/herdr-mods), © 2026 Tawsif Aqib | Apache-2.0 | `mods/orca-sidebar/`, modified: see its `CHANGES.md` |
| Better Changes 2.5.0 | [munza/herdr-mods](https://github.com/munza/herdr-mods), © 2026 Tawsif Aqib | Apache-2.0 | `mods/better-changes/`, unmodified; `place` set to `"none"` (the layout has its own slot) |
| Better Config 0.1.0 | [munza/herdr-mods](https://github.com/munza/herdr-mods), © 2026 Tawsif Aqib | Apache-2.0 | `mods/better-config/`, unmodified |
| Image Viewer | [dougcunha/herdr-mods](https://github.com/dougcunha/herdr-mods), © 2026 Douglas Cunha | MIT | `mods/image-viewer/`, unmodified; `mods/files-open-with/` opens it for image files (its `mod` menu action and `tabs.js` route) |
| t3-actions | [JinJieBeWater/herdr-t3](https://github.com/JinJieBeWater/herdr-t3) | Apache-2.0 | `mods/t3-actions/`, modified: see its `CHANGES.md` |
| herdr-mod-ai-usage (approach only) | [jmalicki/herdr-mod-ai-usage](https://github.com/jmalicki/herdr-mod-ai-usage), © 2026 Joseph Malicki | MIT | `mods/usage-limits/helpers/` asks the `claude` and `codex` CLIs for usage the same way; no code copied |
| Herdr Desktop shipped mods | [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app) | Apache-2.0 | `my-menu`, `my-new-menu`, `my-pane`, `my-status`, `my-tabs`, `my-worktree`, `files-open-with` and `file-icons` are modified copies of Herdr's `menu`, `new-menu`, `pane`, `workspace-status`, `tabs`, `worktree` and `files` mods; parts of `issues`, `new-worktree` and Better Sidebar adapt its code and icons |
| Excalidraw | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) | MIT | bundled in `mods/excalidraw/`, notices in its `LICENSE*` files |
| Material Icon Theme | [material-extensions/vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) | MIT | icons in `mods/file-icons/`, notice in `LICENSE-material-icon-theme.txt` |
| herdr-cowork skill | [ninehills' gist](https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096), © 2026 ninehills, v1.1.0 | none stated | `skills/herdr-cowork/SKILL.md`; frontmatter `name` renamed cowork → herdr-cowork; its `version:` field is outside the Agent Skills spec and kept verbatim |

munza/herdr-mods' license and NOTICE are kept, unmodified, in `licenses/`.

Lucide icons (ISC) appear throughout, as in Herdr's own mods.
