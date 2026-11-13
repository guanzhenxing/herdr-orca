# Orca for Herdr

A Herdr Desktop layout after the Orca app: projects with nested worktrees and their issue/PR
badges, each one's agents and sub-agents right under it, spaces you can put to sleep (and agents
resumed after a restart), a resource meter, a hover card per worktree, in-app GitHub issues and pull requests, a Create worktree dialog
(from a branch, an issue, a PR or a new name), Files and Git changes panels, run actions, usage
limits and live ports.

![Orca](preview.png)

See [RECIPE.md](RECIPE.md) for what it does and how it's built, and
[THIRD_PARTY.md](THIRD_PARTY.md) for credits and licenses. The issues, live ports, usage limits and
actions mods are also published on their own in
[VladTemp27/herdr-mods](https://github.com/VladTemp27/herdr-mods).

## Install

Ask your Herdr agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/VladTemp27/herdr-orca

Then two mods by [munza](https://github.com/munza/herdr-mods) that the layout uses but this repo
doesn't include:

> Add this mod: https://github.com/munza/herdr-mods/tree/main/better-changes (in the layout's Changes slot)
>
> Add this mod: https://github.com/munza/herdr-mods/tree/main/better-config

By hand:

1. Copy `layouts/orca.json` into `~/.config/herdr-app/layouts/` and each folder in `mods/` into
   `~/.config/herdr-app/mods/`. Rename anything whose name you already use.
2. Install Better Changes and Better Config from munza/herdr-mods. Set Better Changes'
   `"place"` to `"none"` in its `mod.json`: the layout already has a slot for it.
3. Merge `keys.json` into `~/.config/herdr-app/keys.json` (its `layout:orca` section applies only
   while this layout shows).
4. Run `herdr-app check ~/.config/herdr-app/mods/<name>` for each mod, then
   `herdr-app do layout.switch '{"name":"orca"}'`. `ctrl-shift-l` switches back.

Keys follow Herdr's own conventions: `cmd-n` stays "New space", and the Create worktree
dialog opens with `cmd-alt-n` instead. Everything in `keys.json`'s `layout:orca` section
(agent navigation, the sidebar panel toggle, closing tabs and panes) applies only while this
layout is shown, so it never shadows the keys of your other layouts.

Needs `git` and a logged-in `gh`. Usage limits read the `claude` and `codex` CLIs; Automations uses
the `herdr-automations` CLI; desktop notifications use `terminal-notifier` when installed. Built and
tested on macOS with Herdr 0.1.13 — macOS first: Linux misses the issue prefill's `pbcopy`/`pbpaste`,
and Windows has no sleep for spaces (the hibernate mod warns at runtime); the rest follows the same
paths. See "What this runs" below for everything the mods execute and reach.

## What this runs

The mods shell out and touch the network; this is the whole surface, so you can judge it before
installing:

- **Programs:** `git` (branches, remotes, worktrees), `gh` (issues, PRs, repos — needs a logged-in
  `gh`), `lsof`, `ss`, `ps`, `pgrep` and `kill` (live ports, the resource meter, sleep), `sysctl`
  (the resource meter), `curl` (Network below), `open` / `xdg-open` / `powershell` / `code` (open a
  file, folder or link), `sips` / `convert` (project icons), `osascript` / `terminal-notifier` /
  `notify-send` (desktop notifications), `pbcopy` / `pbpaste` (issue prefill), `printenv` (a remote
  machine's home folder), `herdr-automations` (Automations), `hc` (Herdr's own CLI), and small `sh`
  scripts with the usual tools (`grep`, `sed`, `awk`, `jq`, `mkdir`, `find`, `cp`, `rm`, `date`,
  `sleep`). Usage limits ask the `claude` and `codex` CLIs: the CLIs authenticate themselves, and
  nothing here sees their tokens.
- **Network:** GitHub only. `gh` talks to the GitHub API. `curl` downloads avatar and project
  pictures from `github.com`, and pictures an issue or PR body refers to. For a picture on a private
  repository, the `gh` token reaches curl through stdin — never an argument or a command line — and
  only for `https://github.com/` URLs; curl drops it when GitHub redirects to its storage host.
  Nothing else is fetched.
- **Files:** the usage-limits helpers read the session logs (`~/.claude/sessions/`, honoring
  `CLAUDE_CONFIG_DIR`, and Codex's rollout files) to count tokens and calls — only numbers leave
  those scripts. Hibernate reads just the session id out of the same files, to resume an agent after
  sleep. No credentials are read.

## Updating this repo

`./sync.sh` copies the layout and these mods from your Herdr home into the repo.
`previews/render.sh` redraws `preview.png` from `previews/preview.html` with headless Chrome:
the preview is an HTML mockup with demo data, so no screenshot of your own work is published.

## License

Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
