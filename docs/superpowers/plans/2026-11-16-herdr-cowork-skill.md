# herdr-cowork Skill Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the herdr-cowork agent skill into this repo and add an opt-in `--with-skills` stage to `install.sh` that installs it to `~/.agents/skills/` and symlinks it for Claude Code, Codex, Gemini, OpenCode and pi.

**Architecture:** The skill file is vendored once (frontmatter `name` renamed to match the directory). `install.sh` gains a three-part stage following its existing decide-early / report / write-late pattern: a flag + front guard, a decision phase that runs **before** the `--dry-run` exit gate (install.sh:93), and a write block after the CLI stage (install.sh:159). Docs (README / THIRD_PARTY.md / NOTICE) disclose the write surface and the skill's runtime behavior.

**Tech Stack:** POSIX sh (install.sh), Markdown docs. No build step. Spec: `docs/superpowers/specs/2026-11-16-herdr-cowork-skill-design.md`.

**Repo conventions:** Commits land on `main` directly, message format `type(scope): description` (no emoji). All verification uses a throwaway `$HOME` — never the real one.

---

### Task 1: Vendor the SKILL.md

**Files:**
- Create: `skills/herdr-cowork/SKILL.md`

- [ ] **Step 1: Fetch the gist and rename the frontmatter name in one pass**

```bash
mkdir -p skills/herdr-cowork
curl -sfL https://gist.githubusercontent.com/ninehills/eef70810238f779362a820786ae4a096/raw \
  | sed 's/^name: cowork$/name: herdr-cowork/' > skills/herdr-cowork/SKILL.md
```

- [ ] **Step 2: Verify the rename is the only change**

```bash
head -8 skills/herdr-cowork/SKILL.md
curl -sfL https://gist.githubusercontent.com/ninehills/eef70810238f779362a820786ae4a096/raw | diff - skills/herdr-cowork/SKILL.md
```

Expected: frontmatter shows `name: herdr-cowork`, `version: 1.1.0`, `allowed-tools` with `Bash(hc *)` / `Bash(herdr-app *)`; diff output is exactly one changed line (`< name: cowork` / `> name: herdr-cowork`).

- [ ] **Step 3: Commit**

```bash
git add skills/herdr-cowork/SKILL.md
git commit -m "feat(skills): vendor herdr-cowork SKILL.md (cowork v1.1.0, renamed)"
```

---

### Task 2: Flag parsing and front guard

**Files:**
- Modify: `install.sh` (usage comment lines 7-9, flag case lines 15-21, guard after line 24)

- [ ] **Step 1: Show current behavior — the flag is rejected**

```bash
sh install.sh --with-skills --dry-run
```

Expected: `unknown flag: --with-skills (use --yes, --dry-run)` and exit 2.

- [ ] **Step 2: Add the flag and guard**

In the usage comment block after the `--dry-run` line add:

```sh
#   sh install.sh --with-skills  also install the herdr-cowork skill (opt-in; see README)
```

In the flag loop add the case (before the `*)` arm):

```sh
    --with-skills) WITH_SKILLS=1 ;;
```

Add `WITH_SKILLS=0` beside `YES=0` / `DRY=0` (line 13-14). After the `layouts/orca.json` guard (line 24) add:

```sh
if [ "$WITH_SKILLS" = 1 ] && [ ! -f skills/herdr-cowork/SKILL.md ]; then
  echo "skills/herdr-cowork/SKILL.md missing from the repo"; exit 1
fi
```

- [ ] **Step 3: Verify syntax, the guard, and pass-through**

```bash
sh -n install.sh
mv skills skills.bak && sh install.sh --with-skills --dry-run; echo "exit=$?"; mv skills.bak skills
sh install.sh --with-skills --dry-run 2>&1 | head -3
```

Expected: `sh -n` silent; with the folder moved away the script prints the missing-file error and `exit=1`; with it back, the run proceeds past the guard (dies later at layout check or reports normally into your real HOME dry-run — dry-run writes nothing, so this is safe).

- [ ] **Step 4: Commit**

```bash
git add install.sh
git commit -m "feat(install): parse --with-skills and guard the vendored skill file"
```

---

### Task 3: Decision phase and report (before the dry-run gate)

**Files:**
- Modify: `install.sh` (decision block after the keys.json merge block, i.e. after line 81; report lines after line 91, before the `DRY` gate at line 93)

- [ ] **Step 1: Show the report is currently unreachable for skills**

```bash
T=$(mktemp -d); mkdir -p "$T/bin"; printf '#!/bin/sh\n' > "$T/bin/herdr-automations"; chmod +x "$T/bin/herdr-automations"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --dry-run | grep -c skill
```

Expected: `0` (no skill lines yet).

- [ ] **Step 2: Add the decision block** — insert after line 81 (the `fi` closing the keys.json block), before `echo "Install from ..."`:

```sh
# herdr-cowork skill (--with-skills): everything is decided here, before the dry-run
# gate, and only written after it. Agent homes that don't exist are skipped, not
# created. "Correct link" means it resolves to the shared copy, not string equality.
skill_target_state=""; skill_copy=0; skill_links=""; skill_link_notes=""
skill_home_target="$HOME/.agents/skills/herdr-cowork"
skill_agents="claude|$HOME/.claude|2 codex|$HOME/.codex|2 gemini|$HOME/.gemini|2 opencode|$HOME/.config/opencode|3 pi|$HOME/.pi/agent|3"
if [ "$WITH_SKILLS" = 1 ]; then
  if [ -L "$skill_home_target" ]; then
    skill_target_state="kept (is a symlink; never touched, even with --yes)"
  elif [ ! -e "$skill_home_target" ]; then
    skill_target_state="install"; skill_copy=1
  elif cmp -s skills/herdr-cowork/SKILL.md "$skill_home_target/SKILL.md"; then
    skill_target_state="up to date"
  elif [ "$YES" = 1 ]; then
    skill_target_state="replace"; skill_copy=1
  else
    skill_target_state="kept (differs; rerun with --with-skills --yes to overwrite)"
  fi
  for entry in $skill_agents; do
    name=${entry%%|*}; rest=${entry#*|}; home=${rest%%|*}; levels=${rest##*|}
    link="$home/skills/herdr-cowork"
    if [ ! -d "$home" ]; then
      skill_link_notes="$skill_link_notes
$name: skipped ($home not installed)"
    elif [ -L "$link" ] && [ -e "$skill_home_target" ] \
      && [ "$(cd -P "$link" 2>/dev/null && pwd)" = "$(cd -P "$skill_home_target" 2>/dev/null && pwd)" ]; then
      skill_link_notes="$skill_link_notes
$name: up to date"
    elif [ "$YES" = 1 ] || [ ! -e "$link" ]; then
      skill_links="$skill_links $name"
    elif [ -L "$link" ]; then
      skill_link_notes="$skill_link_notes
$name: kept (link points elsewhere; --yes replaces it)"
    else
      skill_link_notes="$skill_link_notes
$name: kept (real directory; --yes replaces it)"
    fi
  done
fi
```

- [ ] **Step 3: Add the report lines** — insert after the keys report (line 91), still before the dry-run gate:

```sh
if [ "$WITH_SKILLS" = 1 ]; then
  say "skill herdr-cowork: $skill_target_state"
  [ -n "$skill_links" ] && say "skill links to create:$skill_links"
  printf '%s' "$skill_link_notes" | while IFS= read -r note || [ -n "$note" ]; do
    [ -n "$note" ] && say "skill $note"
  done
fi
```

(The `|| [ -n "$note" ]` is required: without a trailing newline in `skill_link_notes`, plain `read` returns non-zero on the final unterminated line and silently drops it — the last agent's note. Found during Task 3 execution.)

- [ ] **Step 4: Verify decisions and dry-run reachability (acceptance items 2, 3, 5)**

```bash
sh -n install.sh
T=$(mktemp -d); mkdir -p "$T/bin"; printf '#!/bin/sh\n' > "$T/bin/herdr-automations"; chmod +x "$T/bin/herdr-automations"
# no flag -> no skill lines
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --dry-run | grep -c 'skill'   # expected: 0
# with flag, no agent homes -> everything skipped, copy installs
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --dry-run | grep 'skill'
# with flag, four agent homes present (no pi) -> pi skipped
mkdir -p "$T/.claude" "$T/.codex" "$T/.gemini" "$T/.config/opencode"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --dry-run | grep 'skill'
ls "$T/.agents" 2>/dev/null || echo "nothing written"
```

Expected second run: `skill herdr-cowork: install`, `skill links to create: claude codex gemini opencode`, `pi: skipped (...not installed)`. Third run: five-name decision minus pi, `pi: skipped`. Final `ls`: `nothing written` (dry-run wrote nothing).

- [ ] **Step 5: Commit**

```bash
git add install.sh
git commit -m "feat(install): decide herdr-cowork skill state before the dry-run gate"
```

---

### Task 4: Write block (after the CLI stage)

**Files:**
- Modify: `install.sh` (write block between the CLI stage's closing `fi` at line 159 and `check_failed=""` at line 161; line numbers shift after Task 3 — anchor on the comment/`check_failed` text)

- [ ] **Step 1: Add the write block** — every fallible command is guarded (`set -e` is on; the CLI stage's `|| echo` style at line 128 is the precedent). Insert before `check_failed=""`:

```sh
# herdr-cowork skill (--with-skills): the copy first; links only if it landed, so a
# failed copy never leaves five dangling links for every agent to list as a bad skill.
if [ "$WITH_SKILLS" = 1 ]; then
  skill_ok=1
  if [ "$skill_copy" = 1 ]; then
    if mkdir -p "$skill_home_target" && cp skills/herdr-cowork/SKILL.md "$skill_home_target/SKILL.md"; then
      echo "skill herdr-cowork: SKILL.md -> $skill_home_target"
    else
      echo "skill herdr-cowork: copy failed — agent links skipped"
      skill_ok=0
    fi
  fi
  if [ "$skill_ok" = 1 ] && { [ -d "$skill_home_target" ] || [ -L "$skill_home_target" ]; }; then
    for entry in $skill_agents; do
      name=${entry%%|*}; rest=${entry#*|}; home=${rest%%|*}; levels=${rest##*|}
      case " $skill_links " in *" $name "*) ;; *) continue ;; esac
      if ! mkdir -p "$home/skills"; then
        echo "skill herdr-cowork: cannot create $home/skills"; continue
      fi
      link="$home/skills/herdr-cowork"
      if [ -d "$link" ] && [ ! -L "$link" ]; then
        rm -rf "$link" || { echo "skill herdr-cowork: cannot remove your $link"; continue; }
      fi
      case "$levels" in
        2) rel="../../.agents/skills/herdr-cowork" ;;
        *) rel="../../../.agents/skills/herdr-cowork" ;;
      esac
      if ln -sfn "$rel" "$link"; then
        echo "skill herdr-cowork: linked $link"
      else
        echo "skill herdr-cowork: link failed at $link"
      fi
    done
  fi
fi
```

Notes for the implementer: real directories are only in `skill_links` when `--yes` decided so (Task 3 logic); `ln -sfn` handles missing and dangling links; the canonical target being a user symlink never blocks linking (resolution passes through).

- [ ] **Step 2: Verify fresh install, links, idempotence (acceptance items 4, 6)**

```bash
sh -n install.sh
T=$(mktemp -d); mkdir -p "$T/bin"; printf '#!/bin/sh\n' > "$T/bin/herdr-automations"; chmod +x "$T/bin/herdr-automations"
mkdir -p "$T/.claude" "$T/.codex" "$T/.gemini" "$T/.config/opencode" "$T/.pi/agent"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills | grep -E 'skill|Done'
cmp skills/herdr-cowork/SKILL.md "$T/.agents/skills/herdr-cowork/SKILL.md" && echo "copy identical"
for p in "$T/.claude/skills/herdr-cowork" "$T/.codex/skills/herdr-cowork" "$T/.gemini/skills/herdr-cowork" "$T/.config/opencode/skills/herdr-cowork" "$T/.pi/agent/skills/herdr-cowork"; do
  [ "$(cd -P "$p" && pwd)" = "$(cd -P "$T/.agents/skills/herdr-cowork" && pwd)" ] && echo "OK $p" || echo "BAD $p -> $(readlink "$p")"
done
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills | grep 'skill'
```

Expected: copy identical; five `OK` lines; the rerun reports only `up to date` states (no `linked` lines).

- [ ] **Step 3: Commit**

```bash
git add install.sh
git commit -m "feat(install): install the herdr-cowork skill copy and agent symlinks"
```

---

### Task 5: Edge-state matrix (tamper, --yes, dangling, target-is-symlink, real dir)

**Files:**
- Modify: `install.sh` (only if a check below fails)

- [ ] **Step 1: Tamper + keep, then --yes restore (acceptance 7a)**

```bash
T=$(mktemp -d); mkdir -p "$T/bin"; printf '#!/bin/sh\n' > "$T/bin/herdr-automations"; chmod +x "$T/bin/herdr-automations"
mkdir -p "$T/.claude"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills >/dev/null
echo "# local edit" >> "$T/.agents/skills/herdr-cowork/SKILL.md"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills | grep 'skill herdr-cowork:'
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --yes | grep -E 'skill herdr-cowork:|linked'
cmp skills/herdr-cowork/SKILL.md "$T/.agents/skills/herdr-cowork/SKILL.md" && echo "restored"
```

Expected: middle run says `kept (differs...)`; `--yes` run says `replace` and `SKILL.md -> ...`; `restored`. Also: the already-correct `~/.claude/skills/herdr-cowork` link is NOT relinked under `--yes` (no `linked` line for claude).

- [ ] **Step 2: Dangling links repair themselves (acceptance 8)**

```bash
rm -rf "$T/.agents/skills/herdr-cowork"        # the five links are now dangling
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --yes | grep -cE 'linked'
[ "$(cd -P "$T/.claude/skills/herdr-cowork" && pwd)" = "$(cd -P "$T/.agents/skills/herdr-cowork" && pwd)" ] && echo "dangling repaired"
```

Expected: the count equals the number of agent homes present (≥ 1; five in this fixture), `dangling repaired`.

- [ ] **Step 3: Canonical target is a user symlink — never touched (acceptance 9)**

```bash
T2=$(mktemp -d); mkdir -p "$T2/bin" "$T2/myskills/herdr-cowork" "$T2/.agents"
cp skills/herdr-cowork/SKILL.md "$T2/myskills/herdr-cowork/"
printf '#!/bin/sh\n' > "$T2/bin/herdr-automations"; chmod +x "$T2/bin/herdr-automations"
ln -s "$T2/myskills/herdr-cowork" "$T2/.agents/skills/herdr-cowork"    # the target itself is a user symlink
HOME="$T2" PATH="$T2/bin:$PATH" sh install.sh --with-skills --yes | grep 'skill herdr-cowork:'
[ -L "$T2/.agents/skills/herdr-cowork" ] && [ "$(readlink "$T2/.agents/skills/herdr-cowork")" = "$T2/myskills/herdr-cowork" ] && echo "user symlink preserved"
```

Expected: report says `kept (is a symlink; never touched...)` even with `--yes`, and the symlink is preserved.

- [ ] **Step 4: Real directory at a link location (acceptance 10)**

```bash
rm -rf "$T/.claude/skills/herdr-cowork"; mkdir -p "$T/.claude/skills/herdr-cowork"; echo mine > "$T/.claude/skills/herdr-cowork/SKILL.md"
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills | grep 'claude'
HOME="$T" PATH="$T/bin:$PATH" sh install.sh --with-skills --yes | grep -E 'claude|linked'
[ -L "$T/.claude/skills/herdr-cowork" ] && echo "replaced by link"
```

Expected: without `--yes`: `kept (real directory; --yes replaces it)` and the file survives; with `--yes`: replaced by the link.

- [ ] **Step 5: Fix any failure and commit**

If every check passed, commit nothing here and note it in the task list. If a fix was needed:

```bash
git add install.sh
git commit -m "fix(install): herdr-cowork edge states (detail what failed)"
```

---

### Task 6: README

**Files:**
- Modify: `README.md` (Install section ~lines 29-32; "What this runs" end of Files bullet ~line 84; "Updating this repo" ~line 86)

- [ ] **Step 1: Update the `--yes` parenthetical (line 29-30)**

Replace `(`--yes` overwrites mods and the layout you already have, `--dry-run` looks first)` with:

```markdown
(`--yes` overwrites mods and the layout you already have — and, with `--with-skills`,
replaces a differing skill copy and **deletes user-installed `herdr-cowork` directories
at the link locations below**; `--dry-run` looks first)
```

- [ ] **Step 2: Add the `--with-skills` paragraph** — after the keys.json paragraph (the one ending `never touches mods it doesn't ship.`), insert:

```markdown
Add `--with-skills` to also install the [herdr-cowork](https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096)
agent skill (vendored in `skills/`, opt-in). The SKILL.md goes to `~/.agents/skills/herdr-cowork/`
— the cross-agent skills root that DeepSeek Harness, Codex, OpenCode, Gemini and pi read
natively — plus symlinks into Claude Code (`~/.claude/skills/`), Codex (`~/.codex/skills/`,
legacy path), Gemini (`~/.gemini/skills/`), OpenCode (`~/.config/opencode/skills/`) and pi
(`~/.pi/agent/skills/`); agents whose home folder doesn't exist are skipped and listed, not
created. Uninstall: `rm -rf ~/.agents/skills/herdr-cowork` and the five `herdr-cowork` symlinks.
```

- [ ] **Step 3: Add the runtime-surface bullet** — at the end of the **Files:** bullet (after `No credentials are read.`), as a new bullet:

```markdown
- **Skills (opt-in, `--with-skills`):** nothing is fetched — the vendored
  `skills/herdr-cowork/SKILL.md` is copied and symlinked (locations above). The skill is a
  prompt protocol: an agent that adopts it as commander runs `hc` to spawn member agent CLIs
  (each under its own permissions), writes `TEAM.md` in the current workspace and renames tabs
  through `herdr-app`. Its frontmatter `allowed-tools` pre-authorizes `hc`/`herdr-app` only in
  Claude Code; other agents apply their own approval flow.
```

- [ ] **Step 4: Updating section** — after the `sync.sh` sentence add:

```markdown
The vendored skill is refreshed by hand: fetch the gist, change its frontmatter `name` to
`herdr-cowork`, replace `skills/herdr-cowork/SKILL.md` and commit; installed users upgrade with
`sh install.sh --with-skills --yes` (links point at the directory, so they follow the new copy).
```

- [ ] **Step 5: Verify and commit**

```bash
grep -n 'with-skills\|herdr-cowork' README.md | head
git add README.md
git commit -m "docs(readme): document --with-skills, its write surface and the skill's runtime behavior"
```

---

### Task 7: THIRD_PARTY.md and NOTICE

**Files:**
- Modify: `THIRD_PARTY.md` (table row), `NOTICE` (paragraph)

- [ ] **Step 1: Add the THIRD_PARTY row** — append to the table (before the `munza/herdr-mods' license` paragraph):

```markdown
| herdr-cowork skill | [ninehills' gist](https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096), © 2026 ninehills, v1.1.0 | none stated | `skills/herdr-cowork/SKILL.md`; frontmatter `name` renamed cowork → herdr-cowork; its `version:` field is outside the Agent Skills spec and kept verbatim |
```

- [ ] **Step 2: Add the NOTICE paragraph** — at the end of `NOTICE`:

```markdown
skills/herdr-cowork/SKILL.md is the cowork skill (v1.1.0) from ninehills' gist
(https://gist.github.com/ninehills/eef70810238f779362a820786ae4a096); no license is stated
upstream. Only its frontmatter name field is changed (cowork → herdr-cowork).
```

- [ ] **Step 3: Verify and commit**

```bash
grep -c 'herdr-cowork' THIRD_PARTY.md NOTICE
git add THIRD_PARTY.md NOTICE
git commit -m "docs(licenses): credit the vendored herdr-cowork skill in THIRD_PARTY and NOTICE"
```

---

### Task 8: Full acceptance sweep

- [ ] **Step 1: Run the complete matrix from spec acceptance items 1-10 with a fresh temp HOME**

Repeat the Task 3/4/5 command sequences in one fresh temp HOME, checking each expected output from the spec's acceptance list. Include `sh -n install.sh` first.

- [ ] **Step 2: Confirm no skill output without the flag (item 2) and dry-run zero-write (item 3)**

```bash
T3=$(mktemp -d); mkdir -p "$T3/bin"; printf '#!/bin/sh\n' > "$T3/bin/herdr-automations"; chmod +x "$T3/bin/herdr-automations"
HOME="$T3" PATH="$T3/bin:$PATH" sh install.sh | grep -c skill                      # 0
HOME="$T3" PATH="$T3/bin:$PATH" sh install.sh --with-skills --dry-run >/dev/null
find "$T3/.agents" "$T3/.claude" 2>/dev/null | wc -l                               # 0 (nothing created)
```

- [ ] **Step 3: Optional live discovery smoke test (item 12, real machine, read-only)**

```bash
claude  # in a fresh session, the skill list should offer herdr-cowork once installed for real
```

Only meaningful after a real `sh install.sh --with-skills`; skip with a note if the user prefers not to touch the real HOME.

- [ ] **Step 4: Fix and commit anything the sweep surfaced**

```bash
git add -A && git commit -m "fix(install): acceptance sweep findings (detail)"
```

Skip if the sweep was clean.
