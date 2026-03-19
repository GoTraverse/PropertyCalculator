/**
 * EquitySight.app — Malicious / nuisance bot blocker
 *
 * Runs at the Netlify edge before any page is served. Returns 403 for
 * known bad bots so they never reach the HTML, GA never fires, and they
 * never consume function invocations.
 *
 * Deliberately NOT blocked: Googlebot, Bingbot, DuckDuckBot, Slurp,
 * Baiduspider, Twitterbot, facebookexternalhit, LinkedInBot, AdsBot-Google
 * (needed for AdSense), and ia_archiver (Internet Archive).
 */

const BAD_BOTS = [
  // ── SEO crawlers / link analysers (high-volume, no visitor value) ──────
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'blexbot',
  'petalbot', 'dataforseobot', 'serpstatbot', 'seokicks', 'rogerbot',
  'sitebulb', 'siteauditbot', 'seznambot', 'yandexbot',
  // ── AI training scrapers ────────────────────────────────────────────────
  'gptbot', 'ccbot', 'bytespider', 'claude-web', 'anthropic-ai',
  'cohere-ai', 'perplexitybot', 'omgili', 'diffbot', 'timpibot',
  'friendlycrawler', 'img2dataset',
  // ── Exploit / vulnerability scanners ───────────────────────────────────
  'nikto', 'zgrab', 'masscan', 'sqlmap', 'nmap', 'nuclei',
  'dirbuster', 'gobuster', 'wfuzz', 'acunetix',
  // ── Generic scraper frameworks (clear bot signals) ──────────────────────
  'scrapy', 'wget/', 'libwww-perl',
];

export default async (request, context) => {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();

  for (const bot of BAD_BOTS) {
    if (ua.includes(bot)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return context.next();
};

export const config = { path: '/*' };
