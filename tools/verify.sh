#!/usr/bin/env bash
# Full verification pass. Every check either exits 0 or explains itself.
set -u
cd "$(dirname "$0")/.."
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}
fail=0
step() {
  echo ""
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
  shift
  if "$@"; then echo "  -> PASS"; else echo "  -> FAIL"; fail=1; fi
}
step "syntax"        bash -c 'for f in src/game/*.js; do node --check "$f" || exit 1; done'
step "build"         node tools/build.mjs
step "balance"       node tools/harness/check-balance.mjs
step "level"         node tools/harness/check-level.mjs
step "navigation"    node tools/harness/check-nav.mjs
step "input + audio" node tools/harness/check-input-audio.mjs
step "runtime smoke" node tools/harness/run.mjs
echo ""
if [ $fail -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit $fail
