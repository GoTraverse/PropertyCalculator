/**
 * share-view.js — Netlify Function
 *
 * Server-renders a public, read-only view of a shared property scenario at
 * /s/:token (wired via a netlify.toml rewrite → ?t=:splat).
 *
 * WHY SERVER-RENDERED: Reddit / Facebook / Twitter / iMessage link scrapers
 * do NOT execute JavaScript. For a shared link to preview as a rich card
 * ("$785k home in Holland Park — see the full breakdown") the Open Graph
 * tags must be in the initial HTML. A client-fetched SPA would only ever
 * show the generic site card. This is the whole growth mechanic, so it has
 * to be rendered here.
 *
 * The page is link-only + noindex: anyone with the token can view, but it is
 * never discoverable via Google (avoids thin/duplicate pages + protects PII).
 *
 * Data: pubshare:<token> in Redis is a snapshot of the already-COMPUTED
 * display values the sharer was looking at (see createPublicShare in
 * scenarios.js). Every value is escaped here before it touches the HTML.
 */

'use strict';

const REDIS_URL   = (process.env.UPSTASH_REDIS_REST_URL   || '').replace(/^["']|["']$/g, '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();
const SITE = (process.env.SITE_URL || 'https://equitysight.app').split(',')[0].trim().replace(/\/$/, '');

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('UPSTASH env vars missing');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  const raw = (await r.json()).result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

// HTML-escape everything user-supplied. Belt: also neutralise the few chars
// that matter inside attribute context.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow a property photo if it's a data: image or an https URL — never
// arbitrary markup. Mirrors safePhotoSrc() on the client.
function safePhoto(src) {
  const s = String(src || '');
  if (/^data:image\/(jpeg|png|webp|gif);base64,/.test(s)) return s;
  if (/^https:\/\//.test(s)) return s;
  return '';
}

function htmlResponse(body, status) {
  return {
    statusCode: status || 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Link-only pages must never be indexed.
      'X-Robots-Tag': 'noindex, follow',
      // Shared snapshots are immutable; let the CDN cache briefly.
      'Cache-Control': 'public, max-age=300',
    },
    body,
  };
}

function notFoundPage() {
  return htmlResponse(`<!DOCTYPE html><html lang="en-AU"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>Scenario not found — EquitySight</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;700&display=swap" rel="stylesheet">
<style>body{font-family:'Geist',system-ui,sans-serif;background:#f6f4ef;color:#1C1C1E;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px;}
.card{max-width:460px}h1{font-size:24px;margin:0 0 10px}p{color:#4A4A52;line-height:1.6}
a{display:inline-block;margin-top:18px;background:#1C1C1E;color:#C9A84C;text-decoration:none;padding:13px 26px;border-radius:6px;font-weight:700;font-size:14px}</style>
</head><body><div class="card">
<div style="font-size:40px;margin-bottom:8px">🔗</div>
<h1>This shared scenario isn't available</h1>
<p>The link may have expired or been revoked by its owner. You can still build your own property scenario in seconds — free, no signup to start.</p>
<a href="${SITE}/app">Open the calculator →</a>
</div></body></html>`, 404);
}

// ── Render helpers ──────────────────────────────────────────────────────
function tile(val, label, color) {
  if (val == null || val === '') return '';
  const style = color ? ` style="color:${esc(color)}"` : '';
  return `<div class="tile"><div class="tile-val"${style}>${esc(val)}</div><div class="tile-lbl">${esc(label)}</div></div>`;
}
function kv(label, val, color) {
  if (val == null || val === '') return '';
  const style = color ? ` style="color:${esc(color)}"` : '';
  return `<div class="kv"><span class="lbl">${esc(label)}</span><span class="val"${style}>${esc(val)}</span></div>`;
}

function renderReport(snap, includeAddress) {
  const s = snap || {};
  const showAddr = includeAddress && s.addr;
  const heading = showAddr ? s.addr : (s.suburbState || 'Property scenario');
  const photo = (showAddr && s.photo) ? safePhoto(s.photo) : '';

  const photoHTML = photo
    ? `<div class="hphoto"><img src="${esc(photo)}" alt="${esc(heading)}" loading="lazy"></div>`
    : `<div class="hphoto hphoto-ph">🏠</div>`;

  // Financial snapshot tiles
  const tiles = [
    tile(s.price, 'Purchase Price'),
    tile(s.deposit, 'Deposit'),
    (s.hasGovt ? tile(s.govt, 'Govt Contribution') : ''),
    tile(s.remaining, 'Remaining Cash', s.remainingColor),
  ].filter(Boolean).join('');

  // Cash picture
  const cashCard = (s.savings || s.outOfPocket || s.cashLeft) ? `
    <div class="card card-rel"><div class="card-accent" style="background:#C9A84C"></div>
      <div class="card-tag" style="color:#C9A84C">CASH PICTURE</div>
      ${kv('Your Savings', s.savings)}
      ${kv('Total Out-of-Pocket', s.outOfPocket, '#C4704A')}
      ${kv('Remaining Cash', s.cashLeft, '#5A7D63')}
    </div>` : '';

  // Upfront costs
  const costRows = Array.isArray(s.costRows) ? s.costRows : [];
  const costCard = (s.crTotal || costRows.length) ? `
    <div class="card card-rel"><div class="card-accent" style="background:#5B8FAB"></div>
      <div class="card-tag" style="color:#5B8FAB">UPFRONT COSTS</div>
      ${kv('Deposit', s.crDeposit)}
      ${costRows.map(r => kv(r.name, r.amt)).join('')}
      <div class="kv kv-total"><span class="lbl">Total Required</span><span class="val">${esc(s.crTotal || '')}</span></div>
    </div>` : '';

  const financeSection = (tiles || cashCard || costCard) ? `
    <div class="section-title">Financial Snapshot</div>
    ${tiles ? `<div class="tiles">${tiles}</div>` : ''}
    ${(cashCard || costCard) ? `<div class="grid2">${cashCard}${costCard}</div>` : ''}` : '';

  // Renovation
  const renoItems = Array.isArray(s.renoItems) ? s.renoItems : [];
  const renoSection = (s.renoOn && (renoItems.length || s.renoTotal)) ? `
    <div class="section-title">Renovation Budget</div>
    <div class="grid2">
      <div class="card center">
        <div class="card-tag">POOL</div>
        <div class="big-num" style="color:#5A7D63">${esc(s.poolVal || '—')}</div>
        <div class="muted">Available for reno</div>
        <div class="divider"></div>
        <div class="card-tag">UNSPENT</div>
        <div class="big-num" style="color:${esc(s.unspentColor || '#5A7D63')}">${esc(s.unspent || '—')}</div>
        <div class="muted">After planned reno</div>
      </div>
      <div class="card">
        <table>
          <tr><th>Item</th><th>Cost</th></tr>
          ${renoItems.map(it => `<tr><td>${esc(it.name)}</td><td class="num">${esc(it.amt)}</td></tr>`).join('')}
          ${s.contingency ? `<tr><td>Contingency</td><td class="num">${esc(s.contingency)}</td></tr>` : ''}
          ${s.renoTotal ? `<tr class="tr-total"><td>Total</td><td class="num">${esc(s.renoTotal)}</td></tr>` : ''}
        </table>
      </div>
    </div>` : '';

  // Repayments
  const repaySection = (s.monthly || s.totalInterest) ? `
    <div class="section-title">Loan Repayments</div>
    <div class="grid2">
      <div class="card">
        <div class="repay-row">
          <div class="repay-col"><div class="big-num">${esc(s.monthly || '—')}</div><div class="muted">Monthly</div><div class="micro">${esc(s.rateLabel || '')}</div></div>
          <div class="repay-col"><div class="big-num">${esc(s.weekly || '—')}</div><div class="muted">Fortnightly</div><div class="micro">26×/yr</div></div>
          <div class="repay-col"><div class="big-num">${esc(s.annual || '—')}</div><div class="muted">Annual</div><div class="micro">${esc(s.loanLabel || '')}</div></div>
        </div>
      </div>
      <div class="card">
        ${kv('Total Interest', s.totalInterest, '#C45A5A')}
        ${kv('Total Amount Paid', s.totalPaid)}
        ${kv('LVR', s.lvr)}
      </div>
    </div>` : '';

  // Rent overlap
  const overlapSection = (s.rentOn && (s.overlapTotal || s.overlapWeekly)) ? `
    <div class="section-title">Rent Overlap</div>
    <div class="card">
      ${kv('Weekly Combined Cost', s.overlapWeekly)}
      ${kv('Total Overlap Cost', s.overlapTotal, '#C4704A')}
      ${kv('Cash Left After Overlap', s.overlapAfter, '#5A7D63')}
    </div>` : '';

  // Risk & reward
  const riskSection = (s.riskScore || s.rewardScore) ? `
    <div class="section-title">Risk &amp; Reward</div>
    <div class="card">
      ${s.riskScore ? `<div class="meter-block">
        <div class="meter-head"><strong>Risk Level</strong><span>${esc(s.riskScore)}</span></div>
        <div class="meter-wrap"><div class="meter-fill" style="width:${esc(s.riskScore)};background:linear-gradient(to right,#C9A84C,#C4704A)"></div></div>
        ${s.riskDesc ? `<div class="muted">${esc(s.riskDesc)}</div>` : ''}
      </div>` : ''}
      ${s.rewardScore ? `<div class="meter-block">
        <div class="meter-head"><strong>Reward Potential</strong><span>${esc(s.rewardScore)}</span></div>
        <div class="meter-wrap"><div class="meter-fill" style="width:${esc(s.rewardScore)};background:linear-gradient(to right,#7B9E87,#5A9E7B)"></div></div>
        ${s.rewardDesc ? `<div class="muted">${esc(s.rewardDesc)}</div>` : ''}
      </div>` : ''}
    </div>` : '';

  return { heading, photoHTML, financeSection, renoSection, repaySection, overlapSection, riskSection };
}

exports.handler = async (event) => {
  // Resolve the token robustly. Netlify's query-string splat rewrite to a
  // function is unreliable, so we accept the token from any of:
  //   1. ?t=<token>           (query rewrite)
  //   2. the path tail        (/s/<token> or /.netlify/functions/share-view/<token>)
  //   3. rawUrl as a backstop
  let token = (event.queryStringParameters && event.queryStringParameters.t) || '';
  if (!token) {
    const src = event.path || event.rawUrl || '';
    const m = src.match(/(?:\/s\/|share-view\/)([A-Za-z0-9_-]{16,64})/);
    if (m) token = m[1];
  }
  // Tokens are base64url; reject anything else fast (no Redis hit).
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return notFoundPage();

  let rec;
  try { rec = await redisGet('pubshare:' + token); }
  catch (e) { return notFoundPage(); }
  if (!rec || !rec.snapshot) return notFoundPage();

  const snap = rec.snapshot;
  const includeAddress = !!rec.includeAddress;
  const R = renderReport(snap, includeAddress);

  // ── OG / social card (per-scenario) ───────────────────────────────────
  const ogTitle = (snap.price ? snap.price + ' · ' : '') +
    (includeAddress && snap.addr ? snap.addr : (snap.suburbState || 'Property scenario')) +
    ' — EquitySight';
  const descBits = [];
  if (snap.monthly) descBits.push('Repayments ' + snap.monthly + '/mo');
  if (snap.deposit) descBits.push('Deposit ' + snap.deposit);
  if (snap.lvr) descBits.push('LVR ' + snap.lvr);
  const ogDesc = (descBits.length ? descBits.join(' · ') + '. ' : '') +
    'See the full property breakdown free on EquitySight.';
  const shareUrl = SITE + '/s/' + token;
  const ogImage = SITE + '/images/og-image.png';

  // UTM-tag the conversion CTAs so a viewer who clicks through from a shared
  // scenario is attributed to social/share traffic in GA4 (otherwise these
  // land in "Direct" and the channel is invisible — same dark-social problem
  // the Reddit links have). The destination is unchanged.
  const appCta = SITE + '/app?utm_source=scenario-share&utm_medium=referral&utm_campaign=scenario';
  const homeCta = SITE + '/?utm_source=scenario-share&utm_medium=referral&utm_campaign=scenario';

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(ogTitle)}</title>
<meta name="description" content="${esc(ogDesc)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${esc(shareUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="EquitySight.app">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" type="image/svg+xml" href="${SITE}/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@300..600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Geist',system-ui,sans-serif;background:#f6f4ef;color:#1C1C1E;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .wrap{max-width:760px;margin:0 auto;padding:0 18px 60px}
  /* Top growth bar */
  .topbar{background:#1C1C1E;color:#F5F0E8;position:sticky;top:0;z-index:10}
  .topbar-in{max-width:760px;margin:0 auto;padding:11px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .brand{font-family:'Geist',sans-serif;font-weight:800;font-size:15px;letter-spacing:-0.2px;color:#F5F0E8;text-decoration:none}
  .brand span{color:#C9A84C}
  .topcta{background:#C9A84C;color:#1C1C1E;text-decoration:none;font-family:'Geist Mono',monospace;font-size:11px;font-weight:600;padding:8px 14px;border-radius:5px;white-space:nowrap;letter-spacing:0.3px}
  /* Hero */
  header.hero{background:#1C1C1E;color:#F5F0E8;border-radius:10px;overflow:hidden;display:flex;margin:18px 0 22px}
  .htext{flex:1;padding:22px 24px;min-width:0}
  .htag{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:2px;color:#C9A84C;margin-bottom:6px;text-transform:uppercase}
  h1{font-size:22px;font-weight:800;line-height:1.2;word-wrap:break-word}
  .hsub{font-size:12px;color:rgba(245,240,232,0.55);margin-top:6px}
  .hphoto{width:190px;flex-shrink:0;background:#2C2C2E;display:flex;align-items:center;justify-content:center}
  .hphoto img{width:100%;height:100%;object-fit:cover;display:block}
  .hphoto-ph{font-size:46px;color:rgba(255,255,255,0.18)}
  .section-title{font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#8a8a90;margin:26px 0 12px;display:flex;align-items:center;gap:10px}
  .section-title::after{content:'';flex:1;height:1px;background:rgba(28,28,30,0.1)}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px}
  .tile{background:#1C1C1E;color:#F5F0E8;border-radius:7px;padding:14px 16px}
  .tile-val{font-family:'Geist Mono',monospace;font-size:21px;font-weight:500}
  .tile-lbl{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(245,240,232,0.5);margin-top:3px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .card{background:#fff;border:1px solid rgba(28,28,30,0.08);border-radius:8px;padding:16px 18px;position:relative}
  .card-rel{overflow:hidden}
  .card-accent{position:absolute;left:0;top:0;bottom:0;width:4px}
  .card-tag{font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:1.5px;margin-bottom:9px;color:#8a8a90}
  .kv{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #f1efe9;font-size:13px}
  .kv:last-child{border-bottom:none}
  .kv .lbl{color:#5A5A60}
  .kv .val{font-family:'Geist Mono',monospace;font-weight:500;text-align:right}
  .kv-total{border-top:2px solid #1C1C1E;margin-top:5px;padding-top:8px;font-weight:700}
  .kv-total .lbl,.kv-total .val{font-weight:700}
  .center{text-align:center}
  .big-num{font-family:'Geist Mono',monospace;font-size:26px;font-weight:500}
  .muted{font-size:11px;color:#8a8a90;margin-top:2px}
  .micro{font-size:10px;color:#a8a8ae;margin-top:1px}
  .divider{border-top:1px solid #f1efe9;margin:12px 0}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#8a8a90;padding:6px 0;border-bottom:1px solid #f1efe9}
  td{padding:6px 0;border-bottom:1px solid #f6f4ef}
  td.num,th:last-child{text-align:right;font-family:'Geist Mono',monospace}
  tr.tr-total td{font-weight:700;border-bottom:none;border-top:2px solid #1C1C1E;padding-top:8px}
  .repay-row{display:flex;gap:14px}
  .repay-col{flex:1;text-align:center}
  .repay-col .big-num{font-size:20px}
  .meter-block{margin-bottom:14px}
  .meter-block:last-child{margin-bottom:0}
  .meter-head{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}
  .meter-head span{font-family:'Geist Mono',monospace}
  .meter-wrap{height:8px;background:#eceae4;border-radius:4px;overflow:hidden;margin-bottom:5px}
  .meter-fill{height:100%;border-radius:4px}
  /* CTA band */
  .cta{background:#1C1C1E;color:#F5F0E8;border-radius:10px;padding:30px 26px;text-align:center;margin-top:30px}
  .cta h2{font-size:20px;font-weight:800;margin-bottom:8px}
  .cta p{color:rgba(245,240,232,0.6);font-size:13px;max-width:440px;margin:0 auto 18px;line-height:1.6}
  .cta a{display:inline-block;background:#C9A84C;color:#1C1C1E;text-decoration:none;font-family:'Geist Mono',monospace;font-size:13px;font-weight:700;padding:13px 28px;border-radius:6px;letter-spacing:0.3px}
  .disc{font-size:11px;color:#9a9aa0;line-height:1.6;margin-top:22px;text-align:center}
  .foot{text-align:center;margin-top:18px;font-size:12px}
  .foot a{color:#5A5A60;text-decoration:none}
  @media(max-width:560px){
    header.hero{flex-direction:column}
    .hphoto{width:100%;height:150px}
    .grid2{grid-template-columns:1fr}
    .repay-row{flex-direction:column;gap:14px}
    h1{font-size:19px}
  }
</style>
</head>
<body>
<div class="topbar"><div class="topbar-in">
  <a href="${homeCta}" class="brand">EquitySight<span>.app</span></a>
  <a href="${appCta}" class="topcta">Build your own free →</a>
</div></div>

<div class="wrap">
  <header class="hero">
    <div class="htext">
      <div class="htag">Shared property scenario</div>
      <h1>${esc(R.heading)}</h1>
      ${snap.sub ? `<div class="hsub">${esc(snap.sub)}</div>` : ''}
    </div>
    ${R.photoHTML}
  </header>

  ${R.financeSection}
  ${R.renoSection}
  ${R.repaySection}
  ${R.overlapSection}
  ${R.riskSection}

  <div class="cta">
    <h2>Model your own purchase in 60 seconds</h2>
    <p>This scenario was built with EquitySight — Australia's smartest property finance calculator. Stamp duty, repayments, renovation budget, risk &amp; reward, all free.</p>
    <a href="${appCta}">Build your own scenario →</a>
  </div>

  <div class="disc">
    Figures are estimates shared by an EquitySight user for general information only — not financial advice. Always confirm with your lender, conveyancer and accountant before committing.
  </div>
  <div class="foot"><a href="${homeCta}">EquitySight.app</a> · <a href="${SITE}/tools?utm_source=scenario-share&utm_medium=referral&utm_campaign=scenario">Free calculators</a> · <a href="${SITE}/pricing?utm_source=scenario-share&utm_medium=referral&utm_campaign=scenario">Pricing</a></div>
</div>
</body>
</html>`;

  return htmlResponse(html, 200);
};
