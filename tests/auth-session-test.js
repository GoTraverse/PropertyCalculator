// auth-session-test.js — run with: node tests/auth-session-test.js
// Exercises the auth handler against an in-memory Redis stand-in. No network.
// Guards these rules:
//   1. verifyEmail never issues a session for an already-verified account
//   2. every function rejects sessions issued before SESSION_EPOCH_MS
//   3. an email address from a request is checked before it reaches a Redis key
//   4. the email-verification attempt count expires, and resets on success and
//      when a new code is issued
//   5. a 6-digit sign-in code gets 5 attempts however the requests are sent,
//      with hourly caps per address and per IP on top
//   6. an old HMAC password hash is replaced by scrypt at the next sign-in
//   7. a rate-limit counter that lost its expiry gets it back
//   8. a right sign-in code never wipes wrong codes counted against its IP
//   9. googleSignin applies the same address check
//  10. a field that is not a string is refused or ignored, never a crash, and
//      a password that is not a string is never stored
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
process.env.AUTH_SALT = 'salt';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
// Without these the handler skips the captcha and logs each emailed code
// instead of sending it, which is how the tests below read the codes.
delete process.env.RESEND_API_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.SITE_URL;

// ── In-memory Redis (Upstash REST) ───────────────────────────────────────────
const store = new Map();   // key → string
const expiry = new Map();  // key → ms timestamp; no entry = no expiry
const redisLog = [];       // every command, in order
let redisFail = null;      // (command array) → true to answer HTTP 500
let redisHook = null;      // async (command array, result), run after each command and before its reply
let googleToken = {};      // what the stubbed Google tokeninfo endpoint answers
const live = k => { if (expiry.has(k) && expiry.get(k) <= Date.now()) { store.delete(k); expiry.delete(k); } return store.has(k); };
const ttlOf = k => !live(k) ? -2 : expiry.has(k) ? Math.ceil((expiry.get(k) - Date.now()) / 1000) : -1;
const seed = (k, v, ttlSec) => { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)); if (ttlSec) expiry.set(k, Date.now() + ttlSec * 1000); else expiry.delete(k); };
const read = k => live(k) ? store.get(k) : null;
const readJson = k => { const v = read(k); return v == null ? null : JSON.parse(v); };
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://redis.test')) {
    const a = JSON.parse(opts.body); const cmd = a[0].toUpperCase(); let result = null;
    redisLog.push(a);
    if (redisFail && redisFail(a)) return { ok: false, status: 500, json: async () => ({ error: 'ERR simulated' }), text: async () => 'ERR simulated' };
    if (cmd === 'GET') result = read(a[1]);
    else if (cmd === 'SET') {
      const o = a.slice(3).map(x => String(x).toUpperCase());
      if (o.includes('NX') && live(a[1])) result = null;
      else { const ex = o.indexOf('EX'); seed(a[1], String(a[2]), ex >= 0 ? Number(a[3 + ex + 1]) : 0); result = 'OK'; }
    }
    else if (cmd === 'SETEX') { seed(a[1], String(a[3]), Number(a[2])); result = 'OK'; }
    else if (cmd === 'DEL') { result = live(a[1]) ? 1 : 0; store.delete(a[1]); expiry.delete(a[1]); }
    else if (cmd === 'INCR' || cmd === 'DECR') { const v = parseInt(read(a[1]) || '0', 10) + (cmd === 'INCR' ? 1 : -1); store.set(a[1], String(v)); result = v; } // keeps any expiry, like Redis
    else if (cmd === 'EXPIRE') { if (live(a[1])) { expiry.set(a[1], Date.now() + Number(a[2]) * 1000); result = 1; } else result = 0; }
    else if (cmd === 'TTL') result = ttlOf(a[1]);
    else if (cmd === 'SCAN') { const re = new RegExp('^' + a[3].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); result = ['0', [...store.keys()].filter(k => live(k) && re.test(k))]; }
    else result = 0; // RPUSH, LTRIM, SADD, SREM…
    if (redisHook) await redisHook(a, result);
    return { ok: true, json: async () => ({ result }) };
  }
  if (String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')) { const g = googleToken; return { ok: true, json: async () => g }; }
  return { ok: true, json: async () => ({}), text: async () => '' };
};

// The handler's own log lines are kept out of the output. The "[auth] … code
// for <email>: <code>" lines are how a test learns a code it was "emailed".
const authLog = [];
const print = console.log.bind(console);
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[auth]')) authLog.push(a); else print(...a); };
console.warn = (...a) => { authLog.push(a); };
const lastLogged = (re, email) => { for (let i = authLog.length - 1; i >= 0; i--) { const l = authLog[i]; if (re.test(String(l[0])) && l[1] === email) return l; } return null; };
const emailedCode = email => { const l = lastLogged(/Verification code/, email); return l && l[2]; };
const emailedMagic = email => { const l = lastLogged(/Magic link/, email); return l && { token: String(l[2]).split('magic=')[1], code: l[3] }; };

const path = require('path').join(__dirname, '..', 'netlify', 'functions') + '/';
const auth = require(path + 'auth.js');
const sess = require(path + '_session.js');
const journey = require(path + 'journey.js');
const crypto = require('crypto');
const hmac = s => crypto.createHmac('sha256', 'salt').update(s).digest('hex'); // AUTH_SALT above
const call = (h, body, cookie) => h.handler({ httpMethod: 'POST', headers: cookie ? { cookie } : {}, body: JSON.stringify(body) });
// One auth request. The general 30-requests-a-minute-per-IP limiter is cleared
// first so it only fires in the test that is about it.
const api = async (body, o) => {
  o = o || {};
  if (!o.keepLimiter) for (const k of [...store.keys()]) if (k.startsWith('authReq:')) { store.delete(k); expiry.delete(k); }
  const headers = { 'x-nf-client-connection-ip': o.ip || '198.51.100.1' };
  if (o.cookie) headers.cookie = 'es_session=' + o.cookie;
  const r = await auth.handler({ httpMethod: 'POST', headers, body: o.raw !== undefined ? o.raw : JSON.stringify(body) });
  let b = null; try { b = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, b: b || {}, cookie: (r.headers && r.headers['Set-Cookie']) || '' };
};
// Keys the handler touched since `from`, leaving out the general limiter.
const keysSince = from => redisLog.slice(from).map(c => String(c[1])).filter(k => !k.startsWith('authReq:'));
let fails = 0; const t = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fails++; };
const section = name => console.log('\n' + name);
const PW = 'Correct-horse-9';
const BAD_CODE = 'That sign-in code is invalid or has expired. Ask for a new one.';
const BURNED = 'Too many incorrect attempts. Ask for a new sign-in link.';

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
  store.set('user:new@example.com', JSON.stringify({ id: 'u2', email: 'new@example.com', name: 'N', emailVerified: false, emailVerificationExpiresAt: Date.now() + 600000, emailVerificationCodeHash: '__placeholder__' }));
  r = await call(auth, { action: 'verifyEmail', email: 'new@example.com', code: 'WRONG' });
  t('wrong code on an unverified account still fails', JSON.parse(r.body).ok === false && !(r.headers['Set-Cookie']));
  Date.now = realNow;

  // From here on the clock is fixed, a day after the session epoch, and only
  // moves when a test moves it.
  let clock = sess.SESSION_EPOCH_MS + 86400000;
  Date.now = () => clock;
  const MIN = 60000;
  store.clear(); expiry.clear();
  const seedUser = (email, extra) => seed('user:' + email, Object.assign({ id: 'id-' + email, email, name: 'T', plan: 'free', emailVerified: true, hash: null }, extra || {}));
  seedUser('admin@example.com', { id: 'a1', role: 'admin' });
  seed('token:ADMIN', { userId: 'a1', email: 'admin@example.com', role: 'admin', plan: 'free', expires: clock + TTL });

  // ───────────────────────────────────────────────────────────────────────────
  section('Email address check (normalizeEmail)');
  const n = sess.normalizeEmail;
  const good = {
    'a@b.co': 'a@b.co',
    '  Jane.Doe+Home@Mail.Example.COM.AU \n': 'jane.doe+home@mail.example.com.au',
    "o'brien@example.com": "o'brien@example.com",
    'first_last-x%y@my-company.photography': 'first_last-x%y@my-company.photography',
    'u@a.b.c.d.example.museum': 'u@a.b.c.d.example.museum',
    'u@xn--bcher-kva.example': 'u@xn--bcher-kva.example',
    '1@2.io': '1@2.io',
  };
  t('ordinary addresses pass, trimmed and lower-cased (plus-addressing, subdomains, long TLDs, apostrophes, punycode)', Object.keys(good).every(k => n(k) === good[k]));
  t('a 64-character local part and a 254-character address pass', n('a'.repeat(64) + '@example.com') !== '' && n('a'.repeat(64) + '@' + ('b'.repeat(61) + '.').repeat(3) + 'com').length === 254);
  const bad = ['', '   ', 'users', 'shares:victim@example.com', 'a@b.co:x', 'user:a@b.co', 'a b@example.com', 'a@exam ple.com', 'a\t@example.com',
    'a\u0000@example.com', 'a@example.com\nuser:x', 'a​@example.com', 'a@b', 'a@b.c', 'a@-b.com', 'a@b-.com', 'a@b..com', 'a@.b.com', 'a@b.com.',
    '"q"@example.com', 'a@b@c.com', '@b.co', 'a@', 'a@1.2.3.4', 'a@b.c0m', 'a,b@example.com', 'a;b@example.com', '<a@example.com>', 'a(b)@example.com',
    'a'.repeat(65) + '@example.com', 'a@' + 'b'.repeat(64) + '.com', 'a'.repeat(64) + '@' + ('b'.repeat(61) + '.').repeat(3) + 'comm',
    123, 0, null, undefined, true, {}, { toString: () => 'a@b.co' }, ['a@b.co']];
  t('everything else is refused: colons, whitespace, control characters, bad domains, over-length, non-strings', bad.every(v => n(v) === ''));

  section('A bad address stops before Redis');
  const badInputs = ['shares:victim@example.com', 'users', 'a b@example.com', 'a@example.com\nuser:x', 'x'.repeat(250) + '@example.com', 12345, { a: 1 }, ['a@b.co']];
  const emailActions = {
    signup: e => ({ action: 'signup', email: e, password: PW, name: 'N' }),
    signin: e => ({ action: 'signin', email: e, password: PW }),
    resendVerification: e => ({ action: 'resendVerification', email: e }),
    verifyEmail: e => ({ action: 'verifyEmail', email: e, code: 'ABCD2345' }),
    requestPasswordReset: e => ({ action: 'requestPasswordReset', email: e }),
    resetPasswordWithToken: e => ({ action: 'resetPasswordWithToken', email: e, code: 'ABCD2345', newPassword: PW }),
    sendMagicLink: e => ({ action: 'sendMagicLink', email: e }),
    verifyMagicCode: e => ({ action: 'verifyMagicCode', email: e, code: '123456' }),
  };
  for (const name of Object.keys(emailActions)) {
    let allRefused = true, touched = [];
    for (const e of badInputs) {
      const from = redisLog.length;
      const res = await api(emailActions[name](e));
      if (!(res.status === 200 && res.b.ok === false && res.b.error === 'Enter a valid email address.' && !res.cookie)) allRefused = false;
      touched = touched.concat(keysSince(from));
    }
    t(name + ' refuses each bad address in the usual {ok:false,error} shape and touches no key', allRefused && touched.length === 0);
  }
  {
    let okAll = true, touched = [];
    for (const tok of ['x', 'magic:abc', 'G'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(64) + '\n', 123, { a: 1 }]) {
      const from = redisLog.length;
      const res = await api({ action: 'verifyMagicLink', token: tok });
      if (!(res.b.ok === false && !res.cookie)) okAll = false;
      touched = touched.concat(keysSince(from));
    }
    t('verifyMagicLink refuses anything that is not 64 hex characters and touches no key', okAll && touched.length === 0);
  }
  {
    let okAll = true;
    for (const raw of ['null', '[]', '"signup"', '42', '{bad json']) {
      const res = await api(null, { raw });
      if (!(res.status === 400 && res.b.ok === false)) okAll = false;
    }
    t('a request body that is not a JSON object is a 400, not a crash', okAll);
  }
  {
    let okAll = true, touched = [];
    for (const action of ['adminResetPassword', 'adminDeleteUser', 'adminSetRole', 'adminGetUserDetails', 'adminSetPlan']) {
      for (const e of [12345, { a: 1 }, ['a@b.co'], 'a\u0000b@example.com', 'x'.repeat(300) + '@example.com']) {
        const from = redisLog.length;
        const res = await api({ action, targetEmail: e, newPassword: PW, role: 'user', plan: 'free' }, { cookie: 'ADMIN' });
        if (!(res.b.ok === false && res.b.error === 'User not found')) okAll = false;
        touched = touched.concat(keysSince(from).filter(k => k !== 'token:ADMIN'));
      }
    }
    t('the admin targetEmail actions answer "User not found" for a non-string, over-long or control-character target and look nothing up', okAll && touched.length === 0);
  }

  section('Ordinary addresses still work end to end');
  r = await api({ action: 'signup', email: '  Jane.Doe+Home@Mail.Example.COM.AU ', password: PW, name: 'Jane' });
  t('signup with a plus-address on a subdomain is accepted', r.b.ok === true && r.b.requiresEmailVerification === true && r.b.email === 'jane.doe+home@mail.example.com.au');
  t('…and stored under the trimmed, lower-cased key', readJson('user:jane.doe+home@mail.example.com.au') !== null && readJson('user:jane.doe+home@mail.example.com.au').emailVerificationAttempts === undefined);
  const janeCode = emailedCode('jane.doe+home@mail.example.com.au');
  t('…the emailed code is still 8 characters', /^[2-9A-HJ-NP-Z]{8}$/.test(String(janeCode)));
  r = await api({ action: 'verifyEmail', email: 'JANE.DOE+home@mail.example.com.au', code: String(janeCode).toLowerCase() });
  t('verifyEmail with the right code signs in (address and code in another case)', r.b.ok === true && /^es_session=[a-f0-9]{64};/.test(r.cookie) && /HttpOnly; Secure; SameSite=Lax$/.test(r.cookie));
  r = await api({ action: 'signin', email: ' jane.doe+HOME@mail.example.com.au', password: PW });
  t('signin with the password works for the same address', r.b.ok === true && r.b.email === 'jane.doe+home@mail.example.com.au' && !!r.cookie);

  section('Google sign-in');
  // googleSignin(email, fields to change in Google's reply, fields to add to the request)
  const google = (email, tok, body) => { googleToken = Object.assign({ email, email_verified: 'true', aud: process.env.GOOGLE_CLIENT_ID, name: 'G' }, tok || {}); return api(Object.assign({ action: 'googleSignin', credential: 'x' }, body || {})); };
  r = await google('Jane.Smith@Gmail.com');
  t('a mixed-case Gmail address signs in under the lower-cased key', r.b.ok === true && r.b.email === 'jane.smith@gmail.com' && !!r.cookie && readJson('user:jane.smith@gmail.com') !== null && read('user:Jane.Smith@Gmail.com') === null);
  r = await google('JANE.SMITH@GMAIL.COM');
  t('…and the same address in capitals finds that account again', r.b.ok === true && readJson('user:jane.smith@gmail.com').loginCount === 2 && [...store.keys()].filter(k => /^user:jane\.smith@/i.test(k)).length === 1);
  {
    let okAll = true, touched = [];
    for (const e of ['shares:victim@example.com', 'users', 'a b@example.com', 'x@y', 'a@example.com\nuser:x']) {
      const from = redisLog.length;
      const res = await google(e);
      if (!(res.b.ok === false && res.b.error === 'Google sign-in failed. The Google credential could not be verified.' && !res.cookie)) okAll = false;
      touched = touched.concat(keysSince(from));
    }
    t('an address Google hands back that fails the check is refused and touches no key', okAll && touched.length === 0);
  }
  r = await google('someone@example.com', { aud: 'another-client' });
  t('(still) a credential for another client ID is refused', r.b.ok === false && !r.cookie && read('user:someone@example.com') === null);
  googleToken = {};

  // ───────────────────────────────────────────────────────────────────────────
  section('Email-verification attempts');
  const unverified = (email, code, extra) => seedUser(email, Object.assign({ emailVerified: false, emailVerificationCodeHash: hmac('email-code:' + code), emailVerificationExpiresAt: clock + 15 * MIN }, extra || {}));
  r = await api({ action: 'signup', email: 'v@example.com', password: PW, name: 'V' });
  const c1 = emailedCode('v@example.com');
  let from = redisLog.length, msgs = [];
  for (let i = 0; i < 8; i++) msgs.push((await api({ action: 'verifyEmail', email: 'v@example.com', code: 'WRONG' + i })).b.error);
  t('8 wrong codes are each "Incorrect verification code."', msgs.every(m => m === 'Incorrect verification code.'));
  t('…counted in verifyTries:<email>, which has an expiry no longer than the code', read('verifyTries:v@example.com') === '8' && ttlOf('verifyTries:v@example.com') > 0 && ttlOf('verifyTries:v@example.com') <= 900);
  t('…and a wrong attempt no longer rewrites the user record', !redisLog.slice(from).some(c => /^SET/i.test(c[0]) && c[1] === 'user:v@example.com'));
  r = await api({ action: 'verifyEmail', email: 'v@example.com', code: c1 });
  t('the 9th attempt is refused even with the right code', r.b.ok === false && r.b.error === 'Too many attempts. Ask for a new code.' && !r.cookie);
  r = await api({ action: 'resendVerification', email: 'v@example.com' });
  const c2 = emailedCode('v@example.com');
  t('asking for a new code resets the count', r.b.ok === true && c2 !== c1 && read('verifyTries:v@example.com') === null);
  r = await api({ action: 'verifyEmail', email: 'v@example.com', code: c1 });
  t('…the old code no longer works', r.b.ok === false && r.b.error === 'Incorrect verification code.');
  r = await api({ action: 'verifyEmail', email: 'v@example.com', code: c2 });
  t('…and the new code verifies the account', r.b.ok === true && !!r.cookie && readJson('user:v@example.com').emailVerified === true);
  t('success deletes the count', read('verifyTries:v@example.com') === null);

  unverified('locked@example.com', 'ABCD2345', { emailVerificationAttempts: 9 });
  r = await api({ action: 'verifyEmail', email: 'locked@example.com', code: 'ABCD2345' });
  t('an account locked by the old never-resetting counter can verify again', r.b.ok === true && !!r.cookie && readJson('user:locked@example.com').emailVerificationAttempts === undefined);
  unverified('locked2@example.com', 'ABCD2345', { emailVerificationAttempts: 9 });
  await api({ action: 'resendVerification', email: 'locked2@example.com' });
  t('…and a new code drops the old counter from the record', readJson('user:locked2@example.com').emailVerificationAttempts === undefined);

  unverified('wait@example.com', 'ABCD2345', { emailVerificationExpiresAt: clock + 120 * MIN }); // a long-lived code, to watch the count alone
  for (let i = 0; i < 9; i++) r = await api({ action: 'verifyEmail', email: 'wait@example.com', code: 'WRONG' });
  t('locked after 8 wrong codes', r.b.error === 'Too many attempts. Ask for a new code.');
  clock += 15 * MIN + 1000;
  r = await api({ action: 'verifyEmail', email: 'wait@example.com', code: 'ABCD2345' });
  t('the lock lifts by itself after 15 minutes', r.b.ok === true);

  unverified('burst@example.com', 'ABCD2345');
  let rs = await Promise.all(Array.from({ length: 20 }, () => api({ action: 'verifyEmail', email: 'burst@example.com', code: 'WRONG' })));
  t('20 wrong codes sent at once get 8 attempts between them', rs.filter(x => x.b.error === 'Incorrect verification code.').length === 8 && rs.filter(x => x.b.error === 'Too many attempts. Ask for a new code.').length === 12);

  // ───────────────────────────────────────────────────────────────────────────
  section('6-digit sign-in code');
  const wrongOf = code => code === '111111' ? '222222' : '111111';
  const send = async (email, ip) => { const res = await api({ action: 'sendMagicLink', email }, { ip }); return Object.assign({ res }, emailedMagic(email) || {}); };
  const guess = (email, code, ip) => api({ action: 'verifyMagicCode', email, code }, { ip });
  let ipSeq = 0; const newIp = () => '203.0.113.' + (++ipSeq); // a fresh IP per request, so only the cap under test can fire

  seedUser('m1@example.com');
  let m = await send('m1@example.com', newIp());
  t('sendMagicLink issues a 64-hex link token and a 6-digit code', m.res.b.ok === true && /^[a-f0-9]{64}$/.test(m.token) && /^\d{6}$/.test(m.code));
  t('…both stored for 15 minutes', ttlOf('magic:' + m.token) === 900 && ttlOf('magicEmail:m1@example.com') === 900 && readJson('magic:' + m.token).expiresAt === clock + 15 * MIN);
  msgs = [];
  for (let i = 0; i < 4; i++) msgs.push((await guess('m1@example.com', wrongOf(m.code), newIp())).b.error);
  t('4 wrong codes are each refused and the code survives', msgs.every(x => x === BAD_CODE) && read('magic:' + m.token) !== null);
  r = await guess('m1@example.com', wrongOf(m.code), newIp());
  t('the 5th wrong code kills it', r.b.error === BURNED && read('magic:' + m.token) === null && read('magicEmail:m1@example.com') === null);
  r = await guess('m1@example.com', m.code, newIp());
  t('…so the right code is then refused', r.b.ok === false && r.b.error === BAD_CODE && !r.cookie);

  seedUser('m2@example.com');
  m = await send('m2@example.com', newIp());
  for (let i = 0; i < 4; i++) await guess('m2@example.com', wrongOf(m.code), newIp());
  r = await guess('m2@example.com', ' ' + m.code + ' ', newIp());
  t('the 5th attempt may be the right one, and signs in', r.b.ok === true && r.b.email === 'm2@example.com' && /^es_session=[a-f0-9]{64};/.test(r.cookie));
  t('…single use: the code and link are gone, and the address count is cleared', read('magic:' + m.token) === null && read('magicEmail:m2@example.com') === null && read('magicCodeFail:m2@example.com') === null);

  seedUser('m3@example.com');
  m = await send('m3@example.com', newIp());
  rs = await Promise.all([guess('m3@example.com', m.code, newIp()), guess('m3@example.com', m.code, newIp())]);
  t('the right code submitted twice at once (a double click) signs in and nothing throws', rs.every(x => x.status === 200) && rs.some(x => x.b.ok === true && !!x.cookie) && read('magic:' + m.token) === null);

  seedUser('m4@example.com');
  m = await send('m4@example.com', newIp());
  rs = await Promise.all(Array.from({ length: 40 }, () => guess('m4@example.com', wrongOf(m.code), newIp())));
  const tally = msg => rs.filter(x => x.b.error === msg).length;
  // The order the 40 reach each counter is not fixed, but the totals are: the
  // address cap lets 10 through, the per-code count compares the first 5 of
  // those (4 refused, the 5th kills the code) and turns the other 5 away.
  t('40 wrong codes sent at once from 40 IPs: only 5 are compared with the code', rs.every(x => x.b.ok === false && !x.cookie) && tally(BAD_CODE) === 4 && tally(BURNED) === 6 && tally('Too many incorrect codes for this email. Use the sign-in link in the email, or wait an hour.') === 30 && read('magicTries:' + m.token) === '10');
  r = await guess('m4@example.com', m.code, newIp());
  t('…and the right code no longer works', r.b.ok === false && !r.cookie);

  seedUser('m5@example.com');
  m = await send('m5@example.com', newIp());
  rs = []; for (const c of ['abcdef', '12345', '1234567', '12 456', '１２３４５６']) rs.push(await guess('m5@example.com', c, newIp()));
  t('codes that are not six digits are refused and use up attempts like any other', rs.slice(0, 4).every(x => x.b.error === BAD_CODE) && rs[4].b.error === BURNED);

  const legacyTok = 'c'.repeat(64);
  seedUser('m6@example.com');
  seed('magic:' + legacyTok, { email: 'm6@example.com', userId: 'id-m6@example.com', codeHash: hmac('magic-code:654321'), attempts: 4, expiresAt: clock + 10 * MIN }, 600);
  seed('magicEmail:m6@example.com', legacyTok, 600);
  r = await guess('m6@example.com', '111111', newIp());
  t('a code issued before this change keeps the attempts it had already used', r.b.error === BURNED && read('magic:' + legacyTok) === null);

  // per-address cap
  seedUser('cap@example.com');
  for (let round = 0; round < 2; round++) { m = await send('cap@example.com', newIp()); for (let i = 0; i < 5; i++) r = await guess('cap@example.com', wrongOf(m.code), newIp()); }
  t('two codes, five wrong guesses each: ten wrong codes for one address', r.b.error === BURNED && read('magicCodeFail:cap@example.com') === '10' && ttlOf('magicCodeFail:cap@example.com') > 0 && ttlOf('magicCodeFail:cap@example.com') <= 3600);
  m = await send('cap@example.com', newIp());
  r = await guess('cap@example.com', m.code, newIp());
  t('a third code within the hour is refused on the code path, even when right', r.b.ok === false && !r.cookie && r.b.error === 'Too many incorrect codes for this email. Use the sign-in link in the email, or wait an hour.');
  r = await api({ action: 'verifyMagicLink', token: m.token }, { ip: newIp() });
  t('…but the emailed link for it still signs in', r.b.ok === true && r.b.email === 'cap@example.com' && !!r.cookie);
  r = await api({ action: 'verifyMagicLink', token: m.token }, { ip: newIp() });
  t('…once', r.b.ok === false && !r.cookie);
  clock += 60 * MIN + 1000;
  m = await send('cap@example.com', newIp());
  r = await guess('cap@example.com', m.code, newIp());
  t('an hour later the code path works again', r.b.ok === true && !!r.cookie);

  // per-IP cap
  const noisy = '192.0.2.77';
  for (let i = 0; i < 20; i++) r = await guess('nobody' + i + '@example.com', '111111', noisy);
  t('20 wrong codes from one IP, across addresses', r.b.error === BAD_CODE && read('magicCodeFailIp:' + noisy) === '20' && ttlOf('magicCodeFailIp:' + noisy) > 0 && ttlOf('magicCodeFailIp:' + noisy) <= 3600);
  seedUser('ip@example.com');
  m = await send('ip@example.com', newIp());
  r = await guess('ip@example.com', m.code, noisy);
  t('the 21st from that IP is refused, even with a right code', r.b.ok === false && !r.cookie && r.b.error === 'Too many incorrect codes from your network. Use the sign-in link in the email, or wait an hour.');
  r = await guess('ip@example.com', m.code, newIp());
  t('…while the same code from another IP signs in', r.b.ok === true && !!r.cookie);

  seedUser('refund@example.com');
  const home = '192.0.2.10';
  m = await send('refund@example.com', home);
  await guess('refund@example.com', wrongOf(m.code), home);
  r = await guess('refund@example.com', m.code, home);
  t('a right code is not counted against the IP or the address', r.b.ok === true && read('magicCodeFailIp:' + home) === '1' && read('magicCodeFail:refund@example.com') === null);
  seedUser('refund2@example.com');
  m = await send('refund2@example.com', '192.0.2.11');
  r = await guess('refund2@example.com', m.code, '192.0.2.11');
  t('…and an IP with no wrong codes is left at 0, still with its expiry', r.b.ok === true && read('magicCodeFailIp:192.0.2.11') === '0' && ttlOf('magicCodeFailIp:192.0.2.11') > 0 && ttlOf('magicCodeFailIp:192.0.2.11') <= 3600);

  // A right code takes its own count back off the IP and nothing else. Wrong
  // codes from the same IP that arrive while it is doing so must stay counted.
  seedUser('race@example.com');
  const raceIp = '192.0.2.12';
  m = await send('race@example.com', newIp());
  let landed = null;
  redisHook = async (c, res) => {
    if (c[0] !== 'DECR' || c[1] !== 'magicCodeFailIp:' + raceIp) return;
    redisHook = null;
    landed = res;
    await Promise.all(Array.from({ length: 19 }, (_, i) => guess('racer' + i + '@example.com', '111111', raceIp)));
  };
  r = await guess('race@example.com', m.code, raceIp);
  redisHook = null;
  t('19 wrong codes from one IP that land just as a right code from it hands its count back are all still counted', r.b.ok === true && landed === 0 && read('magicCodeFailIp:' + raceIp) === '19' && ttlOf('magicCodeFailIp:' + raceIp) > 0);
  for (let i = 0; i < 2; i++) r = await guess('racer@example.com', '111111', raceIp);
  t('…so that IP is refused after its 20th wrong code, as usual', r.b.error === 'Too many incorrect codes from your network. Use the sign-in link in the email, or wait an hour.');

  // The IP count expiring between this request's INCR and its DECR: DECR then
  // makes a new key at -1 with no expiry, which must get one.
  seedUser('lapse@example.com');
  const lapseIp = '192.0.2.13';
  m = await send('lapse@example.com', newIp());
  redisHook = async c => { if (c[0] === 'GET' && c[1] === 'user:lapse@example.com') { redisHook = null; store.delete('magicCodeFailIp:' + lapseIp); expiry.delete('magicCodeFailIp:' + lapseIp); } };
  r = await guess('lapse@example.com', m.code, lapseIp);
  redisHook = null;
  t('a count that expired mid-request is left at -1 with an hour on it, not without an expiry', r.b.ok === true && read('magicCodeFailIp:' + lapseIp) === '-1' && ttlOf('magicCodeFailIp:' + lapseIp) === 3600);

  // request caps
  seedUser('often@example.com');
  for (let i = 0; i < 5; i++) m = await send('often@example.com', newIp());
  const fifth = read('magicEmail:often@example.com');
  r = (await send('often@example.com', newIp())).res;
  t('a 6th sign-in email for one address within the hour is not sent (same reply, no new code)', r.b.ok === true && read('magicEmail:often@example.com') === fifth && fifth === m.token);
  const sender = '192.0.2.50';
  for (let i = 0; i < 10; i++) { seedUser('s' + i + '@example.com'); await send('s' + i + '@example.com', sender); }
  seedUser('s10@example.com');
  r = (await send('s10@example.com', sender)).res;
  t('an 11th sign-in email from one IP within the hour is not sent', r.b.ok === true && read('magicEmail:s9@example.com') !== null && read('magicEmail:s10@example.com') === null);
  seedUser('unv@example.com', { emailVerified: false });
  r = (await send('unv@example.com', newIp())).res;
  t('an unverified account gets the same reply and no code', r.b.ok === true && read('magicEmail:unv@example.com') === null);
  r = (await send('ghost@example.com', newIp())).res;
  t('an address with no account gets the same reply and no code', r.b.ok === true && r.b.message === 'If an account exists, a sign-in link has been sent.' && read('magicEmail:ghost@example.com') === null);

  // ───────────────────────────────────────────────────────────────────────────
  section('Old HMAC password hashes');
  const isScrypt = h => /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(String(h));
  seedUser('old@example.com', { hash: hmac(PW) });
  r = await api({ action: 'signin', email: 'old@example.com', password: PW + 'x' }, { ip: newIp() });
  t('a wrong password against an old hash fails and leaves it alone', r.b.ok === false && r.b.error === 'The email or password is incorrect.' && readJson('user:old@example.com').hash === hmac(PW));
  r = await api({ action: 'signin', email: 'old@example.com', password: 12345678 }, { ip: newIp() });
  t('a password that is not a string fails the same way instead of throwing', r.b.ok === false && r.b.error === 'The email or password is incorrect.');
  seedUser('odd@example.com', { hash: 'z'.repeat(64) });
  r = await api({ action: 'signin', email: 'odd@example.com', password: PW }, { ip: newIp() });
  t('a stored value of the right length that is not a hash never matches', r.b.ok === false);
  r = await api({ action: 'signin', email: 'old@example.com', password: PW }, { ip: newIp() });
  t('the right password signs in', r.b.ok === true && !!r.cookie);
  t('…and the stored hash is now scrypt with its own salt', isScrypt(readJson('user:old@example.com').hash));
  r = await api({ action: 'signin', email: 'old@example.com', password: PW }, { ip: newIp() });
  const again = await api({ action: 'signin', email: 'old@example.com', password: PW + 'x' }, { ip: newIp() });
  t('…which accepts the same password and still refuses a wrong one', r.b.ok === true && again.b.ok === false);
  seedUser('oldunv@example.com', { hash: hmac(PW), emailVerified: false });
  r = await api({ action: 'signin', email: 'oldunv@example.com', password: PW }, { ip: newIp() });
  t('an unverified account with an old hash is upgraded too, and still has to verify', r.b.ok === false && r.b.requiresEmailVerification === true && !r.cookie && isScrypt(readJson('user:oldunv@example.com').hash));
  seedUser('g@example.com', { hash: null });
  r = await api({ action: 'signin', email: 'g@example.com', password: PW }, { ip: newIp() });
  t('an account with no password (Google only) cannot be signed in to with one', r.b.ok === false && readJson('user:g@example.com').hash === null);

  // ───────────────────────────────────────────────────────────────────────────
  section('Fields that are not strings');
  const O = { toString: 1, valueOf: 1 }; // valid JSON, and String(O) throws
  {
    let okAll = true, touched = [];
    for (const pw of [1, 12345678, { length: 99 }, ['Correct-horse-9'], true, O]) {
      const from = redisLog.length;
      const res = await api({ action: 'signup', email: 'np@example.com', password: pw, name: 'N' }, { ip: newIp() });
      if (!(res.status === 200 && res.b.ok === false && res.b.error === 'Enter your email and password.')) okAll = false;
      touched = touched.concat(keysSince(from));
    }
    t('signup refuses a password that is not a string, so none can skip the minimum length', okAll && touched.length === 0 && read('user:np@example.com') === null);
  }
  r = await api({ action: 'signup', email: 'odd1@example.com', password: PW, name: 123, ref: 456, pageTrail: [null, 5, 'x', { p: O, q: O, t: 'x' }, { p: '/journey', t: 1700000000000, q: '?near=x' }] }, { ip: newIp() });
  const odd1 = readJson('user:odd1@example.com') || {};
  t('signup with a number for the name and referral code and a damaged page trail goes through instead of throwing', r.status === 200 && r.b.ok === true && odd1.name === 'odd1' && odd1.referredBy === undefined
    && JSON.stringify(odd1.signupPageTrail) === JSON.stringify([{ p: '', t: 0 }, { p: '/journey', t: 1700000000000, q: '?near=x' }]));
  r = await api({ action: 'signup', email: 'odd2@example.com', password: PW, name: '  Sam  ', pageTrail: [null] }, { ip: newIp() });
  t('…an ordinary name is still trimmed, and a trail with nothing usable in it is not stored', r.b.ok === true && r.b.name === 'Sam' && (readJson('user:odd2@example.com') || {}).signupPageTrail === undefined);
  r = await google('odd3@example.com', null, { pageTrail: [null, { p: '/tools/', t: 2 }] });
  t('Google sign-up drops the same bad trail entries', r.b.ok === true && JSON.stringify((readJson('user:odd3@example.com') || {}).signupPageTrail) === JSON.stringify([{ p: '/tools/', t: 2 }]));

  seedUser('cp@example.com', { hash: hmac(PW) });
  seed('token:CP', { userId: 'id-cp@example.com', email: 'cp@example.com', role: 'user', plan: 'free', expires: clock + TTL });
  let typeOk = true;
  for (const np of [1, 12345678, { length: 99 }, O]) {
    const res = await api({ action: 'changePassword', currentPassword: PW, newPassword: np }, { cookie: 'CP' });
    if (!(res.b.ok === false && res.b.error === 'Enter your current password and a new one.' && !res.cookie)) typeOk = false;
  }
  t('changePassword refuses a new password that is not a string and keeps the old one', typeOk && readJson('user:cp@example.com').hash === hmac(PW) && read('token:CP') !== null);
  seed('pwreset:cp@example.com', { hash: hmac('email-code:ZZZZ3333'), email: 'cp@example.com', attempts: 0 }, 1800);
  typeOk = true;
  for (const np of [1, 12345678, O]) {
    const res = await api({ action: 'resetPasswordWithToken', email: 'cp@example.com', code: 'ZZZZ3333', newPassword: np }, { ip: newIp() });
    if (!(res.b.ok === false && res.b.error === 'Enter your email, the code and a new password.')) typeOk = false;
  }
  t('…so does resetPasswordWithToken, before the code is looked at', typeOk && readJson('pwreset:cp@example.com').attempts === 0 && readJson('user:cp@example.com').hash === hmac(PW));

  unverified('oc@example.com', 'ABCD2345');
  seedUser('om@example.com');
  m = await send('om@example.com', newIp());
  rs = [
    await api({ action: 'verifyEmail', email: 'oc@example.com', code: O }),
    await api({ action: 'resetPasswordWithToken', email: 'cp@example.com', code: O, newPassword: PW }, { ip: newIp() }),
    await guess('om@example.com', O, newIp()),
    await api({ action: 'signin', email: 'cp@example.com', password: O }, { ip: newIp() }),
    await api({ action: 'signin', email: 'cp@example.com', password: [PW] }, { ip: newIp() }),
  ];
  t('a code or password sent as an object is refused or a wrong attempt, not a crash', rs.every(x => x.status === 200 && x.b.ok === false && !x.cookie)
    && rs[0].b.error === 'Enter your email and the code.' && read('verifyTries:oc@example.com') === null
    && rs[1].b.error === 'That reset code is invalid or has expired.' && readJson('pwreset:cp@example.com').attempts === 1
    && rs[2].b.error === BAD_CODE && read('magicTries:' + m.token) === '1'
    && rs[3].b.error === 'The email or password is incorrect.' && rs[4].b.error === 'The email or password is incorrect.');
  r = await guess('om@example.com', Number(m.code), newIp());
  t('…a sign-in code sent as a number still works, as before', r.b.ok === true && !!r.cookie);
  r = await api({ action: 'resetPasswordWithToken', email: 'cp@example.com', code: 'ZZZZ3333', newPassword: 'A-new-password-2' }, { ip: newIp() });
  t('…and the right reset code still works after the object one', r.b.ok === true && isScrypt(readJson('user:cp@example.com').hash));

  // ───────────────────────────────────────────────────────────────────────────
  section('Records stored before the address check');
  seed('user:users', { id: 'j1', email: 'users', emailVerified: false });
  seed('user:shares:victim@example.com', { id: 'j2', email: 'shares:victim@example.com', emailVerified: false });
  seed('journey:users', 'the-admin-list');
  seed('journey:shares:victim@example.com', { view: 'tokV' });
  seed('journey:share:tokV', { email: 'victim@example.com', mode: 'view' });
  r = await api({ action: 'adminGetUserDetails', targetEmail: 'users' }, { cookie: 'ADMIN' });
  t('the admin can still open a record whose address fails the check', r.b.ok === true && r.b.user.email === 'users' && r.b.user.hash === undefined);
  r = await api({ action: 'adminDeleteUser', targetEmail: 'users' }, { cookie: 'ADMIN' });
  t('…and delete it, without touching journey:users', r.b.ok === true && read('user:users') === null && read('journey:users') === 'the-admin-list');
  r = await api({ action: 'adminDeleteUser', targetEmail: 'shares:victim@example.com' }, { cookie: 'ADMIN' });
  t('deleting "shares:victim@example.com" leaves the real victim@example.com share records alone', r.b.ok === true && read('user:shares:victim@example.com') === null && read('journey:shares:victim@example.com') !== null && read('journey:share:tokV') !== null);
  seedUser('norm@example.com');
  seed('journey:norm@example.com', { v: 1 }); seed('journey:shares:norm@example.com', { view: 'tokN' }); seed('journey:share:tokN', { email: 'norm@example.com', mode: 'view' });
  from = redisLog.length;
  r = await api({ action: 'adminDeleteUser', targetEmail: ' Norm@Example.com ' }, { cookie: 'ADMIN' });
  t('deleting an ordinary account still removes its journey, share links and list entry', r.b.ok === true && read('user:norm@example.com') === null && read('journey:norm@example.com') === null && read('journey:shares:norm@example.com') === null && read('journey:share:tokN') === null
    && redisLog.slice(from).some(c => c[0] === 'SREM' && c[1] === 'journey:users' && c[2] === 'norm@example.com'));

  // ───────────────────────────────────────────────────────────────────────────
  section('Counters that lost their expiry');
  seed('authReq:192.0.2.99', '31'); // over the limit, no expiry: would refuse this IP for good
  r = await api({ action: 'getPublicConfig' }, { ip: '192.0.2.99', keepLimiter: true });
  t('an over-limit request counter with no expiry is refused and given its 60 seconds back', r.status === 429 && ttlOf('authReq:192.0.2.99') === 60);
  clock += 61000;
  r = await api({ action: 'getPublicConfig' }, { ip: '192.0.2.99', keepLimiter: true });
  t('…so the IP is let in again a minute later', r.status === 200 && r.b.ok === true);
  seedUser('stuck@example.com', { hash: hmac(PW) });
  seed('loginFail:stuck@example.com', '10');
  r = await api({ action: 'signin', email: 'stuck@example.com', password: PW }, { ip: newIp() });
  t('a sign-in lockout with no expiry is refused and given its 15 minutes back', r.b.ok === false && /Too many failed sign-in attempts/.test(r.b.error) && ttlOf('loginFail:stuck@example.com') === 900);
  seed('loginFail:timed@example.com', '10', 100);
  await api({ action: 'signin', email: 'timed@example.com', password: PW }, { ip: newIp() });
  t('an expiry that is already there is never extended', ttlOf('loginFail:timed@example.com') === 100);
  redisFail = c => c[0] === 'EXPIRE' && c[1] === 'verifyTries:lost@example.com';
  unverified('lost@example.com', 'ABCD2345', { emailVerificationExpiresAt: clock + 120 * MIN });
  let threw = false; try { await api({ action: 'verifyEmail', email: 'lost@example.com', code: 'WRONG' }); } catch (e) { threw = true; }
  redisFail = null;
  t('(set-up) the first EXPIRE on a verification count is lost', threw && read('verifyTries:lost@example.com') === '1' && ttlOf('verifyTries:lost@example.com') === -1);
  for (let i = 0; i < 8; i++) r = await api({ action: 'verifyEmail', email: 'lost@example.com', code: 'WRONG' });
  t('…the refusal that follows puts the expiry back', r.b.error === 'Too many attempts. Ask for a new code.' && ttlOf('verifyTries:lost@example.com') === 900);

  seedUser('reset@example.com', { hash: hmac(PW) });
  seed('loginFail:reset@example.com', '10', 900);
  seed('pwreset:reset@example.com', { hash: hmac('email-code:ZZZZ2222'), email: 'reset@example.com', attempts: 0 }, 1800);
  r = await api({ action: 'resetPasswordWithToken', email: 'Reset@example.com', code: 'zzzz2222', newPassword: 'A-new-password-1' }, { ip: newIp() });
  const afterReset = await api({ action: 'signin', email: 'reset@example.com', password: 'A-new-password-1' }, { ip: newIp() });
  t('a completed password reset lifts the sign-in lockout, as its message promises', r.b.ok === true && read('loginFail:reset@example.com') === null && afterReset.b.ok === true);

  Date.now = realNow;
  const noise = authLog.filter(l => !/RESEND_API_KEY not configured/.test(String(l[0])));
  if (noise.length) { fails++; console.log('  ✗ unexpected handler warnings:'); noise.forEach(l => console.log('    ' + l.map(String).join(' '))); }
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  ✗ test run threw: ' + (e && e.stack || e)); console.log('1 FAILED'); process.exit(1); });
