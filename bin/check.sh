#!/usr/bin/env bash
# bin/check.sh — run every tests/*-test.js with node. Exit 1 if any fails.
#
#   bin/check.sh        one line per test, and the end of the output of any
#                       test that fails
#   bin/check.sh -v     also the last line each passing test prints
#
# The Playwright checks (tests/*-check.js, tests/surfaces-agree.js) need a
# local server and are not run here. Dev-only: bin/ is never deployed.
set -u
cd "$(dirname "$0")/.." || exit 2

verbose=0
[ "${1:-}" = "-v" ] && verbose=1

status=0
failed=()
for t in tests/*-test.js; do
  [ -e "$t" ] || continue
  out=$(node "$t" 2>&1)
  code=$?
  if [ "$code" -eq 0 ]; then
    if [ "$verbose" -eq 1 ]; then
      printf 'pass  %s  %s\n' "$t" "$(printf '%s\n' "$out" | tail -n 1)"
    else
      printf 'pass  %s\n' "$t"
    fi
  else
    printf 'FAIL  %s (exit %s)\n' "$t" "$code"
    printf '%s\n' "$out" | tail -n 25 | sed 's/^/      /'
    status=1
    failed+=("$t")
  fi
done

if [ "$status" -ne 0 ]; then
  printf '\n%s test file(s) failed: %s\n' "${#failed[@]}" "${failed[*]}"
else
  printf '\nall tests passed\n'
fi
exit "$status"
