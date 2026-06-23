# EquitySight GSC MCP Server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes Google Search Console performance data for **equitysight.app** to Claude
Code / Claude Desktop. Lets an assistant session pull live indexing + ranking
data and diagnose traffic problems directly, instead of working from a stale
exported zip.

It shares the **same Google service-account credential** as
`netlify/functions/seo-metrics.js`, so once you've set that up for the Netlify
function, this server works too.

## 1. Create the service account (one-time)

1. [console.cloud.google.com](https://console.cloud.google.com) → create/pick a project
2. APIs & Services → Library → "**Google Search Console API**" → **Enable**
3. APIs & Services → Credentials → Create Credentials → **Service account**
4. Open the service account → **Keys** → Add Key → Create new key → **JSON** (downloads a file)
5. [search.google.com/search-console](https://search.google.com/search-console) → Settings →
   Users and permissions → Add user → paste the service account's `client_email`
   → permission **Full** → Add

## 2. Point this server at the key

Either (preferred — keeps the secret out of shell history):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
```

…or inline:

```bash
export GSC_SA_EMAIL="equitysight-gsc@yourproject.iam.gserviceaccount.com"
export GSC_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

Optional: `export GSC_SITE_PROPERTY="sc-domain:equitysight.app"` (this is the default).

## 3. Install + register with Claude Code

```bash
cd mcp/gsc-mcp
npm install
# from the repo root:
claude mcp add gsc -- node "$(pwd)/server.js"
```

Or add to `.mcp.json` at the repo root (already scaffolded — see below) and
Claude Code will auto-discover it. You'll need `GOOGLE_APPLICATION_CREDENTIALS`
(or the inline pair) present in the environment Claude Code runs in.

## Tools

| Tool | What it does |
|------|--------------|
| `gsc_summary` | Clicks / impressions / CTR / position for a window |
| `gsc_top_pages` | Top pages by impressions or clicks |
| `gsc_top_queries` | Top search queries |
| `gsc_country_breakdown` | Performance split by country |
| `gsc_device_breakdown` | Performance split by device |
| `gsc_timeseries` | Daily clicks/impressions/position (spot the day traffic dropped) |
| `gsc_page_detail` | Which queries one URL ranks for |
| `gsc_compare` | Diff two date windows → query gainers/losers |
| `gsc_list_sitemaps` | Submitted sitemaps + last-downloaded + indexed counts |

All date args are `YYYY-MM-DD`. Omit them for the last 28 days ending 3 days ago
(GSC data settles ~2-3 days behind).

## Security

- **Read-only.** Only calls `searchanalytics.query` and `sitemaps.list`. Never writes.
- The service-account key is a secret — never commit `key.json`. This directory's
  `.gitignore` and the repo `.netlifyignore` both exclude it.
- This whole `mcp/` directory is excluded from the Netlify deploy (`.netlifyignore`),
  so it never ships to the public CDN.
