#!/usr/bin/env node
/**
 * fetch-reviews.js — Build helper
 *
 * Scans Upstash Redis for approved suburb reviews and prints a JSON object
 * to stdout keyed by "STATE:slug":
 *
 *   {
 *     "NSW:bondi": {
 *       "agg": { "count": 7, "sum": 32 },
 *       "reviews": [ { id, rating, title, body, userName, created_at }, ... ]
 *     },
 *     ...
 *   }
 *
 * build-suburbs.js invokes this via execSync and injects the output into
 * suburb pages at build time so Googlebot crawls real static text.
 *
 * Env vars (same as runtime functions):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *
 * If env vars are missing, outputs "{}" and exits 0 (non-fatal).
 */

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g,'').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g,'').trim();

const MAX_PER_SUBURB = 10;

async function redisCmd(...args) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  return (await r.json()).result;
}

async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await redisCmd('SCAN', cursor, 'MATCH', pattern, 'COUNT', '500');
    cursor = res[0];
    if (Array.isArray(res[1])) keys.push(...res[1]);
  } while (cursor !== '0');
  return keys;
}

async function hGetAll(key) {
  const r = await redisCmd('HGETALL', key);
  if (!Array.isArray(r) || !r.length) return {};
  const out = {};
  for (let i = 0; i < r.length; i += 2) out[r[i]] = r[i + 1];
  return out;
}

async function main() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    process.stdout.write('{}');
    return;
  }

  const out = {};
  try {
    // Find all aggregates — one per suburb that has at least one approved review.
    const aggKeys = await scanKeys('reviews:agg:*');
    for (const aggKey of aggKeys) {
      // reviews:agg:NSW:bondi → NSW, bondi
      const rest = aggKey.slice('reviews:agg:'.length);
      const colonIdx = rest.indexOf(':');
      if (colonIdx < 0) continue;
      const state = rest.slice(0, colonIdx);
      const slug  = rest.slice(colonIdx + 1);
      if (!state || !slug) continue;

      const agg = await hGetAll(aggKey);
      const count = parseInt(agg.count, 10) || 0;
      const sum   = parseInt(agg.sum, 10)   || 0;
      if (count <= 0) continue;

      // Fetch up to MAX_PER_SUBURB review IDs
      const listKey = 'reviews:' + state + ':' + slug;
      const ids = await redisCmd('LRANGE', listKey, '0', String(MAX_PER_SUBURB - 1));
      if (!Array.isArray(ids) || !ids.length) continue;

      const reviews = [];
      for (const id of ids) {
        const raw = await redisCmd('GET', 'review:' + id);
        if (!raw) continue;
        let r;
        try { r = JSON.parse(raw); } catch(e) { continue; }
        if (!r || r.status !== 'approved') continue;
        reviews.push({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          userName: r.userName,
          created_at: r.created_at,
        });
      }
      if (!reviews.length) continue;

      out[state + ':' + slug] = { agg: { count, sum }, reviews };
    }
  } catch (e) {
    // Non-fatal: emit empty map and note on stderr. build-suburbs.js treats
    // missing cache as "no reviews yet" and renders pages without review blocks.
    process.stderr.write('[fetch-reviews] ' + e.message + '\n');
    process.stdout.write('{}');
    return;
  }

  process.stdout.write(JSON.stringify(out));
}

main().catch(err => {
  process.stderr.write('[fetch-reviews] ' + (err && err.message || err) + '\n');
  process.stdout.write('{}');
});
