#!/bin/sh
# Installs this layout and its mods from the repo into your Herdr home — the reverse of
# sync.sh, for a fresh install or an upgrade after merging upstream. Never touches mods it
# doesn't ship, keeps the key actions you already use, and keeps Mod settings where a
# mod.schema.json describes them.
#
#   sh install.sh              fresh install; mods you already have that differ are kept and listed
#   sh install.sh --yes        upgrade: overwrite differing mods and the layout too
#   sh install.sh --dry-run    report only, write nothing
#   sh install.sh --with-skills  also install the herdr-cowork skill (opt-in; see README)
set -e
cd "$(dirname "$0")"
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
YES=0
DRY=0
WITH_SKILLS=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --dry-run) DRY=1 ;;
    --with-skills) WITH_SKILLS=1 ;;
    *) echo "unknown flag: $arg (use --yes, --dry-run, --with-skills)"; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "install.sh needs jq"; exit 1; }
[ -f layouts/orca.json ] || { echo "layouts/orca.json missing from the repo"; exit 1; }
if [ "$WITH_SKILLS" = 1 ] && [ ! -f skills/herdr-cowork/SKILL.md ]; then
  echo "skills/herdr-cowork/SKILL.md missing from the repo"; exit 1
fi
say() { if [ "$DRY" = 1 ]; then echo "[dry] $*"; else echo "$*"; fi; }
# The home copies carry files the app writes itself (type files, jsconfig, caches): they
# don't count as a difference.
same() { diff -rq -x gpui-kit.d.ts -x jsconfig.json -x .DS_Store -x .cache "$1" "$2" >/dev/null 2>&1; }

install_mods=""
kept_mods=""
uptodate_mods=""
for mod in mods/*/; do
  name=$(basename "$mod")
  target="$HOME_DIR/mods/$name"
  if [ ! -e "$target" ]; then
    install_mods="$install_mods $name"
  elif same "$mod" "$target"; then
    uptodate_mods="$uptodate_mods $name"
  elif [ "$YES" = 1 ]; then
    install_mods="$install_mods $name"
  else
    kept_mods="$kept_mods $name"
  fi
done

if [ ! -e "$HOME_DIR/layouts/orca.json" ]; then
  install_layout=1
elif [ "$YES" = 1 ] || cmp -s layouts/orca.json "$HOME_DIR/layouts/orca.json"; then
  install_layout=1
else
  install_layout=0
  kept_layout=1
fi

# keys.json is merged, not replaced: new sections and keys are added, an action you
# already bound keeps yours.
keys_changed=0
keys_conflicts=""
if [ ! -f "$HOME_DIR/keys.json" ]; then
  install_keys=1
else
  install_keys=0
  merged=$(mktemp)
  cp "$HOME_DIR/keys.json" "$merged"
  entries=$(mktemp)
  trap 'rm -f "$merged" "$entries"' EXIT
  for section in $(jq -r 'keys_unsorted[]' keys.json); do
    jq -r --arg s "$section" '.[$s] | to_entries[] | "\(.key)	\(.value | tojson)"' keys.json > "$entries"
    while IFS="	" read -r key value; do
      home_value=$(jq -r --arg s "$section" --arg k "$key" '(.[$s][$k] // null) | if . == null then "absent" else tojson end' "$merged")
      if [ "$home_value" = "absent" ]; then
        merged=$(printf '%s' "$merged" | jq --arg s "$section" --arg k "$key" --argjson v "$value" '.[$s] //= {} | .[$s][$k] = $v')
        keys_changed=1
      elif [ "$home_value" != "$value" ]; then
        keys_conflicts="$keys_conflicts
  $section / $key: keeping yours ($home_value); the package binds $value"
      fi
    done < "$entries"
  done
fi

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

echo "Install from $(pwd) into $HOME_DIR"
[ -n "$uptodate_mods" ] && say "up to date:$uptodate_mods"
[ -n "$install_mods" ] && say "mods to install:$install_mods"
[ -n "$kept_mods" ] && say "kept, you already have different ones:$kept_mods (rerun with --yes to overwrite)"
if [ "$install_layout" = 1 ]; then say "layout: layouts/orca.json"; elif [ "$kept_layout" = 1 ]; then say "kept your layouts/orca.json (differs; rerun with --yes to overwrite)"; fi
if [ "$install_keys" = 1 ]; then say "keys.json: none yet, installing the package's"
elif [ "$keys_changed" = 1 ]; then say "keys.json: merging in new bindings"
elif [ "$keys_conflicts" = "" ]; then say "keys.json: already merged"; fi
[ -n "$keys_conflicts" ] && say "keys.json conflicts:$keys_conflicts"

if [ "$WITH_SKILLS" = 1 ]; then
  say "skill herdr-cowork: $skill_target_state"
  [ -n "$skill_links" ] && say "skill links to create:$skill_links"
  printf '%s' "$skill_link_notes" | while IFS= read -r note || [ -n "$note" ]; do
    [ -n "$note" ] && say "skill $note"
  done
fi

if [ "$DRY" = 1 ]; then
  echo "dry run: nothing written."
  exit 0
fi

mkdir -p "$HOME_DIR/mods" "$HOME_DIR/layouts"
for name in $install_mods; do
  # Mod settings a schema describes are the person's choices: keep them across the upgrade.
  prev=null
  if [ -f "mods/$name/mod.schema.json" ] && [ -f "$HOME_DIR/mods/$name/mod.json" ]; then
    prev=$(jq '.settings // null' "$HOME_DIR/mods/$name/mod.json")
  fi
  rsync -a --delete "mods/$name/" "$HOME_DIR/mods/$name/"
  if [ "$prev" != "null" ]; then
    jq --argjson s "$prev" '.settings = $s' "mods/$name/mod.json" > "$HOME_DIR/mods/$name/mod.json.tmp"
    mv "$HOME_DIR/mods/$name/mod.json.tmp" "$HOME_DIR/mods/$name/mod.json"
  fi
done
[ "$install_layout" = 1 ] && cp layouts/orca.json "$HOME_DIR/layouts/orca.json"
if [ "$install_keys" = 1 ]; then
  cp keys.json "$HOME_DIR/keys.json"
elif [ "$keys_changed" = 1 ]; then
  cp "$merged" "$HOME_DIR/keys.json"
fi

# The Automations panel needs the herdr-automations CLI. Build it from the vendored
# source when Go is here; otherwise download the pinned release and verify its
# checksum. Already-installed copies (PATH or ~/.local/bin) are left alone.
if command -v herdr-automations >/dev/null 2>&1 || [ -x "$HOME/.local/bin/herdr-automations" ]; then
  echo "herdr-automations CLI: already installed"
else
  cli_bin="$HOME/.local/bin/herdr-automations"
  tag="v0.12.1"
  if command -v go >/dev/null 2>&1; then
    echo "herdr-automations CLI: building from vendored source (cli/herdr-automations)"
    (cd cli/herdr-automations && go build -o "$cli_bin" .) || echo "  go build failed — the Automations panel will say so until it is installed."
  else
    case "$(uname -sm)" in
      Darwin\ arm64) asset="darwin_arm64" ;;
      Darwin\ x86_64) asset="darwin_amd64" ;;
      Linux\ x86_64) asset="linux_amd64" ;;
      Linux\ aarch64) asset="linux_arm64" ;;
      *) asset="" ;;
    esac
    if [ -z "$asset" ]; then
      echo "herdr-automations CLI: no release binary for $(uname -sm); install Go and rerun, or build cli/herdr-automations."
    else
      rel="https://github.com/DnzzL/herdr-automations/releases/download/$tag"
      tmp=$(mktemp -d)
      if curl -fsSL -o "$tmp/herdr-automations_$asset" "$rel/herdr-automations_$asset" \
         && curl -fsSL -o "$tmp/checksums.txt" "$rel/checksums.txt"; then
        if command -v shasum >/dev/null 2>&1; then
          grep "herdr-automations_$asset" "$tmp/checksums.txt" | shasum -a 256 -c -
        elif command -v sha256sum >/dev/null 2>&1; then
          grep "herdr-automations_$asset" "$tmp/checksums.txt" | sha256sum -c -
        else
          echo "herdr-automations CLI: no sha256 tool found; refusing to install an unverified binary."
        fi
        [ $? = 0 ] && mkdir -p "$HOME/.local/bin" && install -m 755 "$tmp/herdr-automations_$asset" "$cli_bin" \
          && echo "herdr-automations CLI: installed $tag to $cli_bin"
      else
        echo "herdr-automations CLI: download failed ($rel) — the Automations panel will say so until it is installed."
      fi
      rm -rf "$tmp"
    fi
  fi
fi

check_failed=""
if command -v herdr-app >/dev/null 2>&1; then
  for name in $install_mods; do
    herdr-app check "$HOME_DIR/mods/$name" >/dev/null 2>&1 || check_failed="$check_failed $name"
  done
  [ -n "$check_failed" ] && echo "check FAILED:$check_failed" || echo "herdr-app check: all installed mods pass"
else
  echo "herdr-app not on PATH: run herdr-app check on each installed mod yourself."
fi

optional_missing=""
for name in better-changes better-config; do
  [ -d "$HOME_DIR/mods/$name" ] || optional_missing="$optional_missing $name"
done
if [ -n "$optional_missing" ]; then
  echo "Still to add (this repo doesn't bundle them):$optional_missing"
  echo "  Ask your Herdr agent: Add this mod: https://github.com/munza/herdr-mods/tree/main/better-changes (in the layout's Changes slot)"
  echo "  Ask your Herdr agent: Add this mod: https://github.com/munza/herdr-mods/tree/main/better-config"
fi
[ -n "$keys_conflicts" ] && echo "Keys you kept are listed above; take the package's binding by editing $HOME_DIR/keys.json."
echo "Done. Switch with: herdr-app do layout.switch '{\"name\":\"orca\"}'  (ctrl-shift-l switches back)"
