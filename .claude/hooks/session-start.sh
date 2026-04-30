#!/bin/bash
# .claude/hooks/session-start.sh
#
# Installs Lighthouse + a Puppeteer-managed Chrome binary so Claude Code on
# the web can run real Lighthouse audits against this repo's static pages.
# Runs only in remote (web) sessions — local development is unaffected.
#
# All tooling is installed under .claude/tooling/ which is git-ignored.
# Nothing here ends up in the Netlify deploy.
#
# Network constraint: Anthropic's web sandbox blocks general outbound HTTP
# (equitysight.app returns "Host not in allowlist"). It DOES allow npm and
# Puppeteer's Chrome CDN. Audits therefore run against a localhost static
# server (see bin/lighthouse-local.sh) rather than the production URL.
# Production audits still need to be run from a laptop.

set -euo pipefail

# Skip on local sessions — keep developer machines clean.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
TOOLING_DIR="$REPO_ROOT/.claude/tooling"
CHROME_DIR="$TOOLING_DIR/chrome"

mkdir -p "$TOOLING_DIR"

# 1. npm package manifest — kept inside .claude/tooling/ so the repo root
# stays package.json-free (this is a static site with no build step). Pinning
# major versions to dodge surprise breakage; minor/patch updates auto-resolve.
if [ ! -f "$TOOLING_DIR/package.json" ]; then
  cat > "$TOOLING_DIR/package.json" <<'PKG'
{
  "name": "equitysight-claude-tooling",
  "private": true,
  "description": "Lighthouse + Puppeteer Chrome for Claude Code on the web sessions. Not deployed; not used in local dev.",
  "version": "1.0.0",
  "dependencies": {
    "lighthouse": "^12.0.0",
    "@puppeteer/browsers": "^2.0.0",
    "serve": "^14.0.0"
  }
}
PKG
fi

# 2. Install npm deps. `npm install` (not `npm ci`) so we benefit from the
# Claude container cache between sessions — repeated runs are near-instant.
if [ ! -d "$TOOLING_DIR/node_modules/lighthouse" ]; then
  echo "[session-start-hook] Installing Lighthouse + serve via npm…"
  (cd "$TOOLING_DIR" && npm install --no-audit --no-fund --silent)
else
  echo "[session-start-hook] Lighthouse already installed (cached)."
fi

# 3. Install Chrome for Testing via Puppeteer's browser fetcher.
#
# Pin to an explicit version (not "@stable") to skip the version-discovery
# step. The Anthropic sandbox blocks googlechromelabs.github.io (where Chrome
# for Testing publishes the "last-known-good" JSON) but allows the actual
# binaries on storage.googleapis.com. Pinning a version sidesteps the blocked
# lookup. To bump: pick a recent version listed at
#   https://googlechromelabs.github.io/chrome-for-testing/  (from your laptop)
# and update the line below.
CHROME_VERSION="138.0.7204.0"

CHROME_BIN_CANDIDATE="$(find "$CHROME_DIR" -name chrome -type f 2>/dev/null | head -1 || true)"
if [ -z "$CHROME_BIN_CANDIDATE" ]; then
  echo "[session-start-hook] Installing Chrome for Testing $CHROME_VERSION (~150 MB)…"
  (cd "$TOOLING_DIR" && \
    npx --yes @puppeteer/browsers install "chrome@$CHROME_VERSION" --path "$CHROME_DIR" >/dev/null)
  CHROME_BIN_CANDIDATE="$(find "$CHROME_DIR" -name chrome -type f 2>/dev/null | head -1)"
else
  echo "[session-start-hook] Chrome already installed (cached)."
fi

if [ -z "$CHROME_BIN_CANDIDATE" ]; then
  echo "[session-start-hook] ERROR: Chrome install completed but binary not found." >&2
  exit 1
fi

# 4. Persist env for the session — adds lighthouse/serve to PATH and tells
# Lighthouse where Chrome lives. CLAUDE_ENV_FILE is sourced by the harness
# before each tool invocation, so subsequent bash commands in this session
# see the values.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$TOOLING_DIR/node_modules/.bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  echo "export CHROME_PATH=\"$CHROME_BIN_CANDIDATE\"" >> "$CLAUDE_ENV_FILE"
fi

echo "[session-start-hook] Ready."
echo "  Lighthouse:  $TOOLING_DIR/node_modules/.bin/lighthouse"
echo "  Chrome:      $CHROME_BIN_CANDIDATE"
echo "  Run audits:  bin/lighthouse-local.sh /tools/stamp-duty-calculator-qld"
