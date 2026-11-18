#!/bin/sh
# Prints ZCode's usage as one JSON line and exits.
#
# Reads magpie's own usage card (GET /v1/magpie/quotas on its local HTTP
# server), which magpie keeps from its Z.ai conversations with ZCode; the
# answer carries magpie's whole card, and providers/zcode.js picks the
# zcode entry. Magpie does the vendor talking with its own sign-in, so
# this script reads no tokens or credential files.
#
# Finding the server: $HERDR_USAGE_MAGPIE_URL wins, then any magpie
# process listening on localhost, then the default port 3425.
#
# Exit: 0 = printed the answer, 127 = magpie isn't running,
# 1 = magpie is running but didn't answer.
# Override the URL with HERDR_USAGE_MAGPIE_URL.

print_body() {
  # The mod parses one JSON document; anything else (an error page, an
  # empty reply) is not a reading. Line breaks are stripped so a
  # pretty-printed answer still arrives as one line (JSON has no raw
  # newline or tab inside it).
  body=$(curl -sf -m 8 "$1/v1/magpie/quotas" 2>/dev/null) || return 1
  case "$body" in
    "{"*) printf '%s\n' "$(printf '%s' "$body" | tr -d '\n\r\t')"; return 0 ;;
  esac
  return 1
}

if [ -n "$HERDR_USAGE_MAGPIE_URL" ]; then
  print_body "${HERDR_USAGE_MAGPIE_URL%/}" && exit 0
  exit 1
fi

# Any magpie listening on loopback, oldest convention first.
port=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '$1 == "magpie" && $9 ~ /^127\.0\.0\.1:/ { sub(/^.*:/, "", $9); print $9; exit }')
if [ -n "$port" ]; then
  print_body "http://127.0.0.1:$port" && exit 0
  exit 1
fi

# Not listening where lsof can see it: magpie isn't running (or its socket
# is out of sight), say not installed, like a missing CLI.
if print_body "http://127.0.0.1:3425"; then exit 0; fi

exit 127
