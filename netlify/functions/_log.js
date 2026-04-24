/**
 * _log.js — tiny structured-logging helper shared across Netlify functions.
 *
 * Why: Netlify's log viewer filters JSON lines much better than plain strings.
 * A single-line JSON record lets us grep by event, severity, user, or custom
 * fields without fragile regex over freeform log messages.
 *
 * Usage:
 *   const log = require('./_log');
 *   log('info',  'auth.signin_success',  { userId, email });
 *   log('warn',  'stripe.user_not_found', { email, eventId });
 *   log('error', 'auth.redis_down',       { op: 'rGet', err: e.message });
 *
 * Output shape (one JSON line per record, stdout):
 *   {"ts":"2026-04-24T09:11:22.331Z","fn":"auth","lvl":"info","evt":"auth.signin_success","userId":"u_abc","email":"..."}
 *
 * Fields:
 *   ts   — ISO-8601 timestamp (server-side)
 *   fn   — derived from the calling function's filename (stack inspection on
 *          first call is cheap and cached; falls back to 'unknown')
 *   lvl  — 'debug' | 'info' | 'warn' | 'error'
 *   evt  — caller-supplied dotted event name (namespace.action)
 *   ...  — any additional fields passed in `data`
 *
 * Keep it minimal: no external deps, no batching, no buffering. Console.log /
 * .warn / .error map to Netlify's log levels directly.
 */
'use strict';

let _cachedFn = null;
function _callerFnName() {
  if (_cachedFn) return _cachedFn;
  try {
    const stack = new Error().stack || '';
    // Frames: [0]=Error, [1]=_callerFnName, [2]=log, [3]=actual caller
    const m = stack.split('\n')[3] || '';
    const path = (m.match(/\((.*?):\d+/) || m.match(/at (.*?):\d+/) || [])[1] || '';
    const base = path.split('/').pop() || '';
    _cachedFn = base.replace(/\.[cm]?js$/, '') || 'unknown';
  } catch (e) { _cachedFn = 'unknown'; }
  return _cachedFn;
}

function log(lvl, evt, data) {
  const record = Object.assign({
    ts: new Date().toISOString(),
    fn: _callerFnName(),
    lvl: lvl || 'info',
    evt: evt || 'unspecified',
  }, data || {});
  // Serialise errors sensibly — Error instances JSON.stringify to {} otherwise.
  for (const k in record) {
    if (record[k] instanceof Error) record[k] = { message: record[k].message, stack: record[k].stack };
  }
  const line = JSON.stringify(record);
  if (lvl === 'error')      console.error(line);
  else if (lvl === 'warn')  console.warn(line);
  else                      console.log(line);
}

module.exports = log;
module.exports.info  = (evt, data) => log('info',  evt, data);
module.exports.warn  = (evt, data) => log('warn',  evt, data);
module.exports.error = (evt, data) => log('error', evt, data);
module.exports.debug = (evt, data) => log('debug', evt, data);
