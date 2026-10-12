#!/usr/bin/env bash
# Resolve aifocus's gate command configuration: TRACKED default first, per-VM override second.
#
# The tracked file (tools/check.conf) is what a fresh VM gets and what a reviewer can read in a PR.
# `tools/check-cmd.sh --install` writes its values into ~/.fleet/check.conf, which is the file the
# deployed gate (~/fleet/bin/fleet-check) actually sources. To tune, edit tools/check.conf and re-run
# --install; do not hand-edit ~/.fleet/check.conf, or a hand-edit and a stale install become
# indistinguishable from the files alone.
#
# Usage:
#   tools/check-cmd.sh                 print the resolved set
#   tools/check-cmd.sh CHECK_CMD       print one resolved value
#   tools/check-cmd.sh --install       install the tracked values into ~/.fleet/check.conf
#
# IT FAILS LOUD. This file is sourced, so a syntax error in either config is fatal, and a missing
# CHECK_CMD is an error rather than an empty string: a gate that silently substitutes a command nobody
# chose reports a verdict about the wrong thing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRACKED="$ROOT/tools/check.conf"
OVERRIDE="${FLEET_CHECK_CONF:-$HOME/.fleet/check.conf}"

if [ ! -r "$TRACKED" ]; then
  echo "check-cmd: the TRACKED gate config is missing: $TRACKED" >&2
  echo "  It is the default a fresh VM gets and the file a reviewer can read. Refusing." >&2
  exit 2
fi

# shellcheck source=tools/check.conf
. "$TRACKED"

: "${CHECK_CMD:?check-cmd: CHECK_CMD is unset or empty in $TRACKED - refusing to report a verdict about a command nobody chose}"

if [ "${1:-}" = "--install" ]; then
  dest="$OVERRIDE"
  mkdir -p "$(dirname "$dest")"

  # ~/.fleet/check.conf is machine-global. Say so when replacing a file not stamped by this project.
  if [ -f "$dest" ] && ! grep -q "Project: aifocus" "$dest" 2>/dev/null; then
    echo "check-cmd: WARNING: overwriting $dest which was not stamped by aifocus (shared-HOME host)" >&2
  fi

  # Review P3 (rev-1, 2026-10-12): build the file BESIDE the target and rename it into place. The
  # deployed gate sources this file from every lane on this VM, and truncating it in place leaves a
  # window where a concurrent fleet-check reads a half-written config — an empty CHECK_CMD, which is
  # exactly the "gate ran a command nobody chose" failure this file exists to remove. A failing grep
  # (no assignment lines) would also leave the truncation behind forever. mv is atomic within a
  # filesystem, so a reader sees the old config or the new one, never a partial file.
  tmp="$dest.tmp.$$"; trap 'rm -f "$tmp"' EXIT
  {
    printf '%s\n' "# Written by tools/check-cmd.sh --install from tools/check.conf (aifocus-c80)."
    printf '%s\n' "# Project: aifocus ($ROOT)"
    printf '%s\n' "# WARNING: MACHINE-GLOBAL (~/.fleet/check.conf). fleet-check reads this file for any repo"
    printf '%s\n' "# invoked on this host; running --install replaces the active gate command."
    printf '%s\n' "# DO NOT HAND-EDIT FOR TUNING: a hand-edit and a stale install are indistinguishable"
    printf '%s\n' "# from the files alone. To tune, edit tools/check.conf and re-run --install."
    grep -E '^[A-Z_]+=' "$TRACKED"
  } > "$tmp"
  mv -f "$tmp" "$dest"; trap - EXIT
  echo "check-cmd: installed the project's gate command into $dest"
  exit 0
fi

# The per-VM override is optional, and it is sourced second so its values win - the deployed gate
# (~/fleet/bin/fleet-check) reads that file and nothing else, so printing the override's values is how
# this command reports what is ACTUALLY deployed.
if [ -r "$OVERRIDE" ]; then
  # aifocus-c80: the override is MACHINE-GLOBAL, and on this VM it arrived holding another project's
  # command (agents-factory's `python3 -m unittest discover`), so every aifocus gate ran a command
  # nobody chose and failed on missing python tests. A foreign override is a defect that must not be
  # reported as a quiet success: name it and name the fix.
  if ! grep -q '^# Project: aifocus' "$OVERRIDE" 2>/dev/null; then
    echo "check-cmd: WARNING: $OVERRIDE is not stamped for aifocus, so the DEPLOYED gate is NOT running" >&2
    echo "  aifocus's command. Fix it with: bash tools/check-cmd.sh --install" >&2
  fi
  # shellcheck disable=SC1090
  . "$OVERRIDE"
fi

: "${CHECK_CMD:?check-cmd: CHECK_CMD is unset or empty after reading $OVERRIDE - refusing to report a verdict about a command nobody chose}"

case "${1:-}" in
  "") printf 'CHECK_CMD=%s\nCHECK_FAST_CMD=%s\nCHECK_TIMEOUT=%s\nCHECK_FAST_TIMEOUT=%s\n' \
        "${CHECK_CMD}" "${CHECK_FAST_CMD:-}" "${CHECK_TIMEOUT:-}" "${CHECK_FAST_TIMEOUT:-}" ;;
  CHECK_CMD|CHECK_FAST_CMD|CHECK_TIMEOUT|CHECK_FAST_TIMEOUT) printf '%s\n' "${!1:-}" ;;
  *) echo "usage: tools/check-cmd.sh [--install|CHECK_CMD|CHECK_FAST_CMD|CHECK_TIMEOUT|CHECK_FAST_TIMEOUT]" >&2; exit 2 ;;
esac
