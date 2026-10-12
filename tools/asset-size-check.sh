#!/usr/bin/env bash
# tools/asset-size-check.sh - a size ratchet on the binary assets that go live verbatim.
#
# WHY (aifocus-ppk): Hugo publishes static/ byte-for-byte, so an oversized file there is paid for by
# every clone, every deploy and every reader's data plan. 29 tracked files already exceed 512 KiB and
# static/ is ~42 MiB, mostly screenshots. That cannot be undone by fiat - the images are the content -
# but it must not GROW silently, which is what this check is for.
#
# RULES
#   1. A file that is not in the baseline may not exceed $ASSET_SIZE_LIMIT (default 512 KiB).
#   2. A file that is in the baseline may not grow past its recorded size. The baseline is a ratchet:
#      it tightens freely (re-run --update after optimising a file) and loosens only deliberately.
#   3. A baseline entry whose file is gone, or now smaller, is reported as information so the ratchet
#      can be tightened - never a failure.
#
# It scans tracked files AND new unignored ones, so an implementer sees a violation in their own
# worktree instead of handing the merger a gate that goes red only once the file is committed.
#
# A FILE WITH A NEWLINE OR A TAB IN ITS PATH CANNOT BE RECORDED IN THE BASELINE (the format is
# path<TAB>bytes, one record per line), so such a file is never grandfathered: if it is over the limit
# it is reported as a violation and has to be renamed or optimised. Paths are carried NUL-separated
# throughout, so spaces and newlines never split a path into two fragments that both go unscanned
# (review P1 on c1352b0: the earlier version wrote the list newline-separated and silently skipped
# such a file). stat -L dereferences symlinks, so a symlink cannot hide a large target's size.
#
# Usage: bash tools/asset-size-check.sh            check (exit 1 on a violation)
#        bash tools/asset-size-check.sh --update   rewrite the baseline from the current tree
#        bash tools/asset-size-check.sh --list     print the baseline with live sizes
#        ASSET_SIZE_LIMIT=<bytes>                  override the limit for one run
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="${ASSET_SIZE_BASELINE:-$ROOT/tools/asset-size-baseline.tsv}"
LIMIT="${ASSET_SIZE_LIMIT:-524288}"

TMP="$(mktemp -d -t asset-size.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FILELIST="$TMP/files"   # NUL-separated paths

human() { awk -v b="$1" 'BEGIN { if (b >= 1048576) printf "%.1f MiB", b / 1048576; else if (b >= 1024) printf "%.0f KiB", b / 1024; else printf "%d B", b }'; }

usage() {
  printf '%s\n' \
    'usage: bash tools/asset-size-check.sh [--update | --list]' \
    '  (no argument)  fail if any file over the limit is new, or any baseline file has grown' \
    '  --update       rewrite tools/asset-size-baseline.tsv from the current tree (a deliberate act)' \
    '  --list         print the baseline entries with their live sizes' \
    '  ASSET_SIZE_LIMIT=<bytes>  override the default 512 KiB limit for one run'
}

# size_of <path> - bytes of the real file, symlinks dereferenced; empty if it cannot be stat'ed.
size_of() { stat -Lc %s -- "$1" 2>/dev/null || true; }

# Paths that the baseline format cannot represent. Such a file is still scanned; it just cannot be
# grandfathered, so the message names the rename as the fix rather than pretending it was recorded.
unrepresentable() { case "$1" in *$'\n'*|*$'\t'*) return 0 ;; *) return 1 ;; esac; }

# Validate the mode FIRST: a bad flag has to be refused even when the baseline is corrupt (aifocus-6xr
# review round 2 - the baseline parse used to run before the flag check).
MODE="${1:-}"
case "$MODE" in ""|--update|--list) ;; *) usage; exit 2 ;; esac

# Every path in the tree, tracked or new-and-unignored, NUL-separated so no path can be split.
# public/ and node_modules/ are gitignored, so --exclude-standard keeps generated output out of this.
git -C "$ROOT" ls-files --cached --others --exclude-standard -z > "$FILELIST"

# The baseline is read once. A malformed line - no tab, no byte count, or an empty path - is a hard
# error for a CHECK: a line without a usable byte count used to make both `-gt`/`-lt` comparisons fail
# *inside an if*, which bash does not treat as fatal, so an oversized file was declared OK (review P1 on
# c1352b0). A duplicate path is refused for the same reason: it makes `base[$p]` ambiguous and used to be
# counted as two drops. `--update` is the REPAIR path, so there the same lines are reported and skipped:
# it only needs the old sizes for its summary, and it rewrites the file from the tree (aifocus-6xr
# review round 2: the check told the reader to run --update, which then refused the very file).
declare -A base=()
baseline_paths=()
if [ -r "$BASELINE" ]; then
  lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    case "$line" in ''|'#'*) continue ;; esac
    p="${line%%$'\t'*}"; b="${line#*$'\t'}"
    if [ "$b" = "$line" ] || [ -z "$p" ] || ! [[ "$b" =~ ^[0-9]+$ ]]; then
      printf 'asset-size: malformed baseline line %d in %s: %s\n' "$lineno" "$BASELINE" "$line" >&2
      if [ "$MODE" = --update ]; then
        printf 'asset-size: ignoring it - --update rewrites this file from the tree\n' >&2
        continue
      fi
      printf 'asset-size: expected `path<TAB>bytes`; fix or delete that line, or run: bash tools/asset-size-check.sh --update\n' >&2
      exit 2
    fi
    if [ -n "${base[$p]+x}" ]; then
      printf 'asset-size: duplicate baseline entry for %s at line %d in %s\n' "$p" "$lineno" "$BASELINE" >&2
      if [ "$MODE" = --update ]; then
        printf 'asset-size: keeping the first size and dropping the rest - --update rewrites this file from the tree\n' >&2
        continue
      fi
      printf 'asset-size: the file is generated from the tree; fix or delete that line, or run: bash tools/asset-size-check.sh --update\n' >&2
      exit 2
    fi
    base["$p"]="$b"
    baseline_paths+=("$p")
  done < "$BASELINE"
fi

case "$MODE" in
  --update)
    out="$TMP/baseline.tsv"
    {
      printf '%s\n' "# tools/asset-size-baseline.tsv - generated by tools/asset-size-check.sh --update (aifocus-ppk)."
      printf '%s\n' "# path<TAB>bytes as recorded. A listed file may not grow past its recorded size;"
      printf '%s\n' "# optimise it and re-run --update to tighten the ratchet, and delete a line once the file is gone."
      printf '%s\n' "# Do not hand-edit: a hand-edit and a stale generation are indistinguishable from the file."
    } > "$out"
    : > "$TMP/body"
    n_files=0 added=0 loosened=0 tightened=0 unchanged=0
    # Membership is a set lookup, not a `|path|` string tested with a wildcard: the string was O(N^2)
    # (~190 ms at 300 entries, ~23 s at 3000) and a path containing `|` could match another entry's
    # boundary (aifocus-6xr, review round 3 of aifocus-ppk).
    declare -A seen_new=()
    while IFS= read -r -d '' f; do
      n_files=$((n_files + 1))
      size=$(size_of "$ROOT/$f"); [ -n "$size" ] || continue
      [ "$size" -gt "$LIMIT" ] || continue
      if unrepresentable "$f"; then
        printf 'asset-size: refusing to record %q - a path with a newline or tab cannot be represented in the baseline; rename it\n' "$f" >&2
        continue
      fi
      printf '%s\t%s\n' "$f" "$size" >> "$TMP/body"
      seen_new["$f"]=1
      # Counts are per entry class, never a subtraction: `old_count - loosened` called every unchanged
      # entry "tightened or removed", which is a false claim about a deliberate ratchet (review P2 on
      # 95e1fc7).
      if [ -z "${base[$f]+x}" ]; then
        added=$((added + 1)); printf 'asset-size: recorded new entry %s (%s)\n' "$f" "$(human "$size")"
      elif [ "$size" -gt "${base[$f]}" ]; then
        loosened=$((loosened + 1)); printf 'asset-size: LOOSENED %s: %s -> %s (both recorded; say why in the commit)\n' "$f" "$(human "${base[$f]}")" "$(human "$size")"
      elif [ "$size" -lt "${base[$f]}" ]; then
        tightened=$((tightened + 1)); printf 'asset-size: tightened %s: %s -> %s\n' "$f" "$(human "${base[$f]}")" "$(human "$size")"
      else
        unchanged=$((unchanged + 1))
      fi
    done < "$FILELIST"
    removed=0
    for p in "${baseline_paths[@]+${baseline_paths[@]}}"; do
      case "${seen_new[$p]+x}" in '') removed=$((removed + 1)); printf 'asset-size: dropped %s from the baseline (no longer over the limit, or gone)\n' "$p" ;; esac
    done
    sort "$TMP/body" >> "$out"
    mv -f "$out" "$BASELINE"
    # grep exits 1 when it selects nothing, which under `set -e` killed --update outright as soon as no
    # asset exceeded the limit (review P2 on 95e1fc7: `ASSET_SIZE_LIMIT=10000000` exited 1).
    entries=$(grep -vc '^#' "$BASELINE" || true)
    printf 'asset-size: baseline rewritten from %d files: %d entries over %s (%d new, %d loosened, %d tightened, %d dropped, %d unchanged).\n' \
      "$n_files" "$entries" "$(human "$LIMIT")" "$added" "$loosened" "$tightened" "$removed" "$unchanged"
    printf 'asset-size: commit tools/asset-size-baseline.tsv with the change that altered it, or the next gate will disagree with this tree.\n'
    exit 0
    ;;
  --list)
    printf 'limit: %s (%s bytes); baseline: %s\n' "$(human "$LIMIT")" "$LIMIT" "$BASELINE"
    for p in "${baseline_paths[@]+${baseline_paths[@]}}"; do
      size=$(size_of "$ROOT/$p"); size=${size:-0}
      printf '%10s recorded %10s  %s\n' "$(human "$size")" "$(human "${base[$p]}")" "$p"
    done
    exit 0
    ;;
  "") ;;
  *) usage; exit 2 ;;
esac

if [ ! -r "$BASELINE" ]; then
  printf 'asset-size: no baseline at %s - run `bash tools/asset-size-check.sh --update` to record the current tree\n' "$BASELINE"
fi

scanned=0 total=0 new_bad=0 grown=0 shrunk=0 stale=0
declare -A seen=()
while IFS= read -r -d '' f; do
  size=$(size_of "$ROOT/$f"); [ -n "$size" ] || continue
  scanned=$((scanned + 1))
  total=$((total + size))
  if [ -n "${base[$f]+x}" ]; then
    seen["$f"]=1
    if [ "$size" -gt "${base[$f]}" ]; then
      printf 'FAIL %s: %s, over its recorded %s (the baseline grows only via --update)\n' \
        "$f" "$(human "$size")" "$(human "${base[$f]}")"
      grown=$((grown + 1))
    elif [ "$size" -lt "${base[$f]}" ]; then
      shrunk=$((shrunk + 1))
    fi
  elif [ "$size" -gt "$LIMIT" ]; then
    printf 'FAIL %s: %s, over the %s limit and not in the baseline\n' "$f" "$(human "$size")" "$(human "$LIMIT")"
    unrepresentable "$f" && printf '     (this path has a newline or tab, so it cannot be recorded at all - rename it)\n'
    new_bad=$((new_bad + 1))
  fi
done < "$FILELIST"

for p in "${baseline_paths[@]+${baseline_paths[@]}}"; do
  case "${seen[$p]+x}" in '') stale=$((stale + 1)); printf 'info %s: in the baseline but not in this tree - delete its line\n' "$p" ;; esac
done
[ "$shrunk" -gt 0 ] && printf 'info %d baseline file(s) shrank - re-run --update to tighten the ratchet\n' "$shrunk"

if [ "$new_bad" -gt 0 ] || [ "$grown" -gt 0 ]; then
  printf 'asset-size: %d violation(s) (%d new over limit, %d grown) across %d files, %s tracked in total.\n' \
    "$((new_bad + grown))" "$new_bad" "$grown" "$scanned" "$(human "$total")"
  printf 'asset-size: optimise the file (or move it out of static/), or record the new size deliberately with: bash tools/asset-size-check.sh --update\n'
  exit 1
fi

printf 'asset-size: OK - %d files, %s tracked, %d over %s all at or under their recorded size.\n' \
  "$scanned" "$(human "$total")" "${#baseline_paths[@]}" "$(human "$LIMIT")"
