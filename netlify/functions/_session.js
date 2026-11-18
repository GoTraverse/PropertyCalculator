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
 * normalizeEmail() is the one check for an email address that came from a
 * request and is about to be used in a Redis key ('user:<email>',
 * 'journey:<email>', the rate-limit counters). It lives here because every
 * function already loads this file.
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

// ── Email addresses ──────────────────────────────────────────────────────────
// Returns the address trimmed and lower-cased (the spelling every 'user:<email>'
// key already uses), or '' if it is not one I accept. Callers must stop on ''
// before touching Redis.
//
// The format is deliberately narrow:
//   local part  1 to 64 of the characters a browser accepts in
//               <input type="email">: letters, digits and . ! # $ % & ' * + / = ? ^ _ ` { | } ~ -
//   domain      labels of letters, digits and inner hyphens joined by dots,
//               ending in a top-level domain of 2 or more letters (or punycode)
//   whole thing 254 characters at most (the SMTP limit)
// So plus-addressing, subdomains and long top-level domains pass. A colon,
// whitespace, a control character, a quote or a second @ never does, which is
// what keeps an address from running into another key namespace: without this
// an account called "shares:someone@example.com" would own the key
// 'journey:shares:someone@example.com', which is someone else's share record,
// and one called "users" would own 'journey:users'.
// Everything the sign-up form's own check lets through with a real domain
// passes here, and so does every address Google hands back.
const EMAIL_MAX_LEN = 254;
const EMAIL_FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > EMAIL_MAX_LEN) return '';
  const email = trimmed.toLowerCase();
  return EMAIL_FORMAT.test(email) ? email : '';
}

module.exports = { isStaleSession, SESSION_EPOCH_MS, TOKEN_TTL_MS, normalizeEmail, EMAIL_MAX_LEN };
