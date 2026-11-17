/**
 * _session.js — shared session-freshness check for every function that reads
 * a `token:<token>` record.
 *
 * SESSION_EPOCH_MS is a floor on when a session may have been issued. Any
 * session issued before it is rejected, which signs every device out once.
 * Raise it (to a time shortly after the deploy) whenever sessions that already
 * exist can no longer be trusted, e.g. after fixing a bug in how sessions are
 * issued. Token records carry `expires` = issue time + TOKEN_TTL, so the issue
 * time is recovered from that; a record without a numeric `expires` is stale.
 *
 * Not a function endpoint: the leading underscore marks it as a helper, the
 * same convention as _log.js.
 */
'use strict';

const TOKEN_TTL_MS = 60 * 60 * 24 * 30 * 1000; // must match TOKEN_TTL in auth.js
const SESSION_EPOCH_MS = Date.parse('2026-11-17T11:35:00Z');

function isStaleSession(data) {
  if (!data || typeof data.expires !== 'number') return true;
  return (data.expires - TOKEN_TTL_MS) < SESSION_EPOCH_MS;
}

module.exports = { isStaleSession, SESSION_EPOCH_MS, TOKEN_TTL_MS };
