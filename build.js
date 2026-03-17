#!/usr/bin/env node
/**
 * build.js — Netlify build entry point.
 *
 * Suburb pages are only rebuilt when REBUILD_SUBURBS=true env var is set.
 * Otherwise, cached suburb pages from previous builds are restored.
 * This lets you deploy CSS/JS/config changes without regenerating 14,512 suburb pages.
 *
 * To trigger a suburb rebuild:
 *   - Set REBUILD_SUBURBS=true in Netlify env vars, then deploy
 *   - Or use the Admin → Suburbs tab "Rebuild Pages" button (triggers deploy hook)
 *   - The env var is automatically cleared after the build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SUBURB_DIR = path.join(ROOT, 'suburb');
const INVEST_DIR = path.join(ROOT, 'invest');
const SITEMAP_FILE = path.join(ROOT, 'sitemap-suburbs.xml');

// Netlify provides a persistent cache directory between builds
const CACHE_DIR = process.env.NETLIFY_CACHE_DIR || path.join(ROOT, '.cache');
const CACHE_SUBURB = path.join(CACHE_DIR, 'suburb');
const CACHE_INVEST = path.join(CACHE_DIR, 'invest');
const CACHE_SITEMAP = path.join(CACHE_DIR, 'sitemap-suburbs.xml');
const CACHE_STAMP = path.join(CACHE_DIR, 'suburb-build-stamp.json');

// Netlify sets INCOMING_HOOK_TITLE when a build hook triggers the deploy
// Admin "Rebuild Suburbs" button names the hook "Suburb rebuild (admin)"
const hookTitle = process.env.INCOMING_HOOK_TITLE || '';
const shouldRebuild = process.env.REBUILD_SUBURBS === 'true' || hookTitle.toLowerCase().includes('suburb');

function cacheExists() {
  return fs.existsSync(CACHE_SUBURB) && fs.existsSync(CACHE_INVEST) && fs.existsSync(CACHE_SITEMAP);
}

function copyDir(src, dest) {
  execSync(`cp -a "${src}" "${dest}"`, { stdio: 'inherit' });
}

function restoreFromCache() {
  console.log('[build] Restoring suburb pages from cache...');
  if (fs.existsSync(CACHE_SUBURB)) copyDir(CACHE_SUBURB, SUBURB_DIR);
  if (fs.existsSync(CACHE_INVEST)) copyDir(CACHE_INVEST, INVEST_DIR);
  if (fs.existsSync(CACHE_SITEMAP)) {
    fs.copyFileSync(CACHE_SITEMAP, SITEMAP_FILE);
  }
  if (fs.existsSync(CACHE_STAMP)) {
    const stamp = JSON.parse(fs.readFileSync(CACHE_STAMP, 'utf8'));
    console.log(`[build] Restored ${stamp.count} suburb pages (built ${stamp.date})`);
  }
}

function saveToCache() {
  console.log('[build] Saving suburb pages to cache...');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // Clean old cache
  if (fs.existsSync(CACHE_SUBURB)) execSync(`rm -rf "${CACHE_SUBURB}"`, { stdio: 'inherit' });
  if (fs.existsSync(CACHE_INVEST)) execSync(`rm -rf "${CACHE_INVEST}"`, { stdio: 'inherit' });
  copyDir(SUBURB_DIR, CACHE_SUBURB);
  copyDir(INVEST_DIR, CACHE_INVEST);
  if (fs.existsSync(SITEMAP_FILE)) fs.copyFileSync(SITEMAP_FILE, CACHE_SITEMAP);
  // Save timestamp
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'suburbs.json'), 'utf8'));
  fs.writeFileSync(CACHE_STAMP, JSON.stringify({
    date: new Date().toISOString(),
    count: data.length
  }));
}

function buildSuburbs() {
  console.log('[build] Rebuilding suburb pages...');
  require('./build-suburbs.js');
  saveToCache();
}

// ── Main ──

if (shouldRebuild) {
  console.log('[build] REBUILD_SUBURBS=true — regenerating all suburb pages');
  buildSuburbs();
} else if (cacheExists()) {
  restoreFromCache();
} else {
  console.log('[build] No cache found — building suburb pages for the first time');
  buildSuburbs();
}

console.log('[build] Done.');
