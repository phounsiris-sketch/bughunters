#!/bin/sh
# Run before every commit that bumps a version:  sh tools/release-guard.sh
# Catches: an emptied file, app and service-worker versions out of step, a JS syntax error.
cd "$(dirname "$0")/.." || exit 1
bad=0
for f in $(git ls-files); do [ -f "$f" ] && [ ! -s "$f" ] && echo "EMPTY $f" && bad=1; done
v1=$(grep -o 'APP_VERSION = "v[0-9]*"' js/app.js | grep -o 'v[0-9]*')
v2=$(grep -o "godsmash-v[0-9]*" sw.js | grep -o 'v[0-9]*')
[ "$v1" = "$v2" ] && [ -n "$v1" ] || { echo "VERSION MISMATCH app=$v1 sw=$v2"; bad=1; }
for f in js/*.js sw.js; do node --check "$f" || { echo "SYNTAX $f"; bad=1; }; done
for t in tests/*.test.js; do [ -f "$t" ] && { node "$t" >/dev/null || { echo "TEST FAILED $t"; bad=1; }; }; done
grep -q addEventListener sw.js || { echo "sw.js has no handlers"; bad=1; }
[ $bad = 0 ] && echo "GUARD OK $v1"
exit $bad
