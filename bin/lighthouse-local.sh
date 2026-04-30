#!/bin/bash
# bin/lighthouse-local.sh
#
# Runs Lighthouse against this repo's static pages, served from a local
# `serve` instance on localhost. Used inside Claude Code on the web sessions
# (the sandbox proxy blocks equitysight.app, so production audits aren't
# possible from the cloud).
#
# Usage:
#   bin/lighthouse-local.sh                        # audits a default URL set
#   bin/lighthouse-local.sh /tools/x-calculator    # audits a single path
#   bin/lighthouse-local.sh /a /b /c               # audits multiple paths
#
# Requires Lighthouse + Chrome installed by .claude/hooks/session-start.sh.
# CHROME_PATH env var is set by the hook.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLING_DIR="$REPO_ROOT/.claude/tooling"
LH="$TOOLING_DIR/node_modules/.bin/lighthouse"
SERVE="$TOOLING_DIR/node_modules/.bin/serve"
PORT="${PORT:-3987}"
OUT_DIR="$REPO_ROOT/.claude/tooling/lh-reports"

if [ ! -x "$LH" ] || [ -z "${CHROME_PATH:-}" ]; then
  echo "Lighthouse or Chrome not installed. Run .claude/hooks/session-start.sh first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Default URL set: light pages that don't need a full suburb/blog rebuild.
# To audit /invest/qld/ or /suburb/{state}/{slug}/ first run `node build.js`
# (pull suburb pages from cache or rebuild from data/suburbs.json).
if [ "$#" -eq 0 ]; then
  PATHS=(
    "/"
    "/tools/"
    "/tools/stamp-duty-calculator-qld"
    "/methodology"
  )
else
  PATHS=("$@")
fi

# 1. Boot a static server in the background. `serve` resolves clean URLs to
# .html files automatically, matching Netlify's pretty-URL behavior.
echo "[lighthouse-local] Starting static server on :$PORT (root=$REPO_ROOT)…"
"$SERVE" "$REPO_ROOT" -l "$PORT" --no-clipboard --no-port-switching > /tmp/serve.log 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID 2>/dev/null || true' EXIT

# Poll until the server is responsive (max 10s).
for i in {1..20}; do
  if curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then break; fi
  sleep 0.5
done
if ! curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  echo "[lighthouse-local] Server failed to start. See /tmp/serve.log" >&2
  exit 1
fi

# 2. Audit each URL. Output JSON for programmatic consumption + an HTML report
# for visual inspection. --chrome-flags accommodate running as root in the
# sandbox.
SUMMARY="$OUT_DIR/summary.tsv"
echo -e "url\tperformance\taccessibility\tbest-practices\tseo\tlcp\tcls\ttbt" > "$SUMMARY"

for path in "${PATHS[@]}"; do
  slug=$(echo "$path" | sed 's|^/||;s|/$||;s|/|_|g')
  [ -z "$slug" ] && slug=root
  url="http://localhost:$PORT$path"
  # When --output is given multiple times, Lighthouse appends ".report.<ext>"
  # to --output-path (e.g. foo → foo.report.json + foo.report.html).
  json="$OUT_DIR/$slug.report.json"
  html="$OUT_DIR/$slug.report.html"

  echo "[lighthouse-local] Auditing $url…"
  "$LH" "$url" \
    --output=json --output=html \
    --output-path="$OUT_DIR/$slug" \
    --only-categories=performance,accessibility,best-practices,seo \
    --form-factor=mobile \
    --quiet \
    --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu" \
    >/dev/null 2>&1 || { echo "[lighthouse-local]   ✗ Lighthouse failed for $path" >&2; continue; }

  if [ ! -f "$json" ]; then
    echo "[lighthouse-local]   ✗ JSON report missing for $path (expected $json)" >&2
    continue
  fi

  # Extract scores into a tab-separated row.
  node -e "
    const r = JSON.parse(require('fs').readFileSync('$json'));
    const c = r.categories;
    const a = r.audits;
    const sc = (x) => Math.round((x?.score ?? 0) * 100);
    const num = (k) => a[k]?.numericValue ?? '';
    process.stdout.write([
      '$path',
      sc(c.performance),
      sc(c.accessibility),
      sc(c['best-practices']),
      sc(c.seo),
      Math.round(num('largest-contentful-paint')) + 'ms',
      (num('cumulative-layout-shift') || 0).toFixed(3),
      Math.round(num('total-blocking-time')) + 'ms',
    ].join('\t') + '\n');
  " >> "$SUMMARY"
done

echo ""
echo "[lighthouse-local] Reports in: $OUT_DIR"
echo "[lighthouse-local] Summary:"
# `column` isn't installed in every sandbox; use awk for column alignment.
awk -F '\t' '{
  for (i=1; i<=NF; i++) {
    if (length($i) > w[i]) w[i] = length($i)
  }
  rows[NR] = $0
}
END {
  for (n=1; n<=NR; n++) {
    split(rows[n], cols, "\t")
    line = ""
    for (i=1; i<=length(cols); i++) {
      pad = w[i] - length(cols[i])
      line = line cols[i] sprintf("%*s", pad+2, "")
    }
    print line
  }
}' "$SUMMARY"
