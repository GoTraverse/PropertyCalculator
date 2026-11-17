// auth-session-test.js — run with: node tests/auth-session-test.js
// Exercises the auth handler against an in-memory Redis stand-in. Guards two
// rules: verifyEmail never issues a session for an already-verified account,
// and every function rejects sessions issued before SESSION_EPOCH_MS.
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
process.env.AUTH_SALT = 'salt';
const store = new Map();
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://redis.test')) {
    const a = JSON.parse(opts.body); const cmd = a[0].toUpperCase(); let result = null;
    if (cmd === 'GET') result = store.has(a[1]) ? store.get(a[1]) : null;
    else if (cmd === 'SET') { store.set(a[1], a[2]); result = 'OK'; }
    else if (cmd === 'SETEX') { store.set(a[1], a[3]); result = 'OK'; }
    else if (cmd === 'DEL') { result = store.delete(a[1]) ? 1 : 0; }
    else if (cmd === 'INCR') { const v = (parseInt(store.get(a[1]) || '0', 10) + 1); store.set(a[1], String(v)); result = v; }
    else if (cmd === 'SCAN') { const re = new RegExp('^' + a[3].replace(/\*/g, '.*') + '$'); result = ['0', [...store.keys()].filter(k => re.test(k))]; }
    else result = 0; // EXPIRE, RPUSH, LTRIM, SADD…
    return { ok: true, json: async () => ({ result }) };
  }
  return { ok: true, json: async () => ({}), text: async () => '' };
};
const path = require('path').join(__dirname, '..', 'netlify', 'functions') + '/';
const auth = require(path + 'auth.js');
const sess = require(path + '_session.js');
const journey = require(path + 'journey.js');
const call = (h, body, cookie) => h.handler({ httpMethod: 'POST', headers: cookie ? { cookie } : {}, body: JSON.stringify(body) });
let fails = 0; const t = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails++; };
(async () => {
  store.set('user:victim@example.com', JSON.stringify({ id: 'u1', email: 'victim@example.com', name: 'V', role: 'admin', emailVerified: true, hash: 'x' }));
  let r = await call(auth, { action: 'verifyEmail', email: 'victim@example.com', code: 'x' });
  let b = JSON.parse(r.body);
  t('verifyEmail on a verified account returns ok:false', b.ok === false);
  t('…sets no cookie', !(r.headers && r.headers['Set-Cookie']));
  t('…leaks no id/role', b.id === undefined && b.role === undefined);
  t('…creates no token record', ![...store.keys()].some(k => k.startsWith('token:')));

  // session epoch
  const TTL = sess.TOKEN_TTL_MS;
  t('session issued before the epoch is stale', sess.isStaleSession({ expires: sess.SESSION_EPOCH_MS - 1000 + TTL }) === true);
  t('session issued after the epoch is fresh', sess.isStaleSession({ expires: sess.SESSION_EPOCH_MS + 1000 + TTL }) === false);
  t('record without expires is stale', sess.isStaleSession({ userId: 'u1' }) === true);

  const old = { userId: 'u1', email: 'victim@example.com', role: 'admin', expires: sess.SESSION_EPOCH_MS - 5000 + TTL };
  const fresh = { userId: 'u1', email: 'victim@example.com', role: 'admin', expires: sess.SESSION_EPOCH_MS + 5000 + TTL };
  store.set('token:OLD', JSON.stringify(old)); store.set('token:NEW', JSON.stringify(fresh));
  const realNow = Date.now; Date.now = () => sess.SESSION_EPOCH_MS + 60000; // pretend it is just after the epoch
  r = await call(auth, { action: 'verify' }, 'es_session=OLD'); t('auth verify rejects pre-epoch session', JSON.parse(r.body).ok === false);
  r = await call(auth, { action: 'verify' }, 'es_session=NEW'); t('auth verify accepts post-epoch session', JSON.parse(r.body).ok === true);
  r = await call(journey, { action: 'get' }, 'es_session=OLD'); t('journey rejects pre-epoch session', JSON.parse(r.body).ok === false);
  r = await call(journey, { action: 'get' }, 'es_session=NEW'); t('journey accepts post-epoch session', JSON.parse(r.body).ok !== false || !/auth|sign/i.test(JSON.parse(r.body).error || ''));

  // genuine verification still works
  const crypto = require('crypto');
  store.set('user:new@example.com', JSON.stringify({ id: 'u2', email: 'new@example.com', name: 'N', emailVerified: false, emailVerificationExpiresAt: Date.now() + 600000, emailVerificationCodeHash: '__placeholder__' }));
  r = await call(auth, { action: 'verifyEmail', email: 'new@example.com', code: 'WRONG' });
  t('wrong code on an unverified account still fails', JSON.parse(r.body).ok === false && !(r.headers['Set-Cookie']));
  Date.now = realNow;
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
