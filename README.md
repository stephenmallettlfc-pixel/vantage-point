# BIZXRAY

Business diagnostic tool — free preview + email-gated full report.

## What's in here

```
netlify.toml                     — routes /api/* to the functions
public/index.html                — the site itself
public/privacy.html              — starter UK GDPR privacy notice (edit before publishing)
netlify/functions/_claude.js     — shared helper that calls the Anthropic API
netlify/functions/_pagespeed.js  — shared helper: real PageSpeed Insights scores (best-effort, returns null on failure)
netlify/functions/diagnose.js    — validates + rate-limits, kicks off the background job, returns a reportId (24h TTL)
netlify/functions/run-diagnostic-background.js — Netlify background function that does the slow research + synthesis
netlify/functions/status.js      — fast polling endpoint: pending / ready (teaser) / failed
netlify/functions/unlock.js      — captures the lead into HubSpot, releases the full report
netlify/functions/waitlist.js    — best-effort capture of interest in the future paid competitor-data feature
package.json                     — one dependency: @netlify/blobs (used for temp report storage + rate limiting)
```

## Before you deploy — two secrets to add

These must be set as **environment variables in the Netlify dashboard** (Site settings → Environment variables), not committed to code:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. This is separate from a claude.ai login. |
| `HUBSPOT_ACCESS_TOKEN` | Your HubSpot account → Settings → Integrations → Private Apps → create one with `crm.objects.contacts.write` scope, copy the token it generates. |
| `GOOGLE_PAGESPEED_API_KEY` *(optional)* | Google Cloud console → enable the PageSpeed Insights API → create an API key. Grounds the website audit in real Lighthouse scores. |

The site will run without `HUBSPOT_ACCESS_TOKEN` set (it just skips CRM sync and logs a warning) — so you can deploy and test the report flow before HubSpot is wired up. `GOOGLE_PAGESPEED_API_KEY` is also optional: if it's absent (or a lookup fails) the website audit simply falls back to search-based inference. It will **not** run without `ANTHROPIC_API_KEY`.

## Deploying

**Easiest path — Netlify CLI (recommended, works well from Claude Code if you want help with this step too):**
```
npm install -g netlify-cli
cd bizxray
netlify init      # links this folder to a new or existing Netlify site
netlify deploy --prod
```

**Alternative — Git-based deploy:** push this folder to a GitHub/GitLab repo, then in Netlify: "Add new site" → "Import an existing project" → pick the repo. Netlify will pick up `netlify.toml` automatically.

After the first deploy, add the environment variables above in the Netlify dashboard, then trigger a redeploy so the functions pick them up.

## What it does

1. Visitor enters business name + URL + optional context.
2. `/api/diagnose` validates the input, checks the rate limit, writes a `pending` record to Netlify Blobs, triggers the background function, and immediately returns a `reportId`. This keeps the request well under Netlify's function timeout.
3. `run-diagnostic-background` (a Netlify background function, which can run far longer than a normal function) does the three research passes (market, website, competitive) via Claude with web search — with the website audit grounded in real PageSpeed Insights scores when `GOOGLE_PAGESPEED_API_KEY` is set — synthesises strengths/weaknesses/priorities, and writes the full `ready` result back to the same Blobs record (24h TTL).
4. The frontend polls `/api/status?reportId=…` every 3 seconds until the report is `ready` (then shows the market-context teaser) or `failed` (then shows an error).
5. Visitor enters name + email to unlock.
6. `/api/unlock` checks the report is `ready` (409 if still pending), creates/updates a HubSpot contact (tagged with the business they looked up), and returns the full stored report.
7. On the unlocked report, a "Join the waitlist" button posts the already-captured name/email to `/api/waitlist` (stored in a `waitlist` Blobs store) to gauge interest in a future paid competitor-data feature.

## Known limits, by design (see the production scoping doc)

- Rate-limited to 5 reports per IP per day (edit `MAX_REPORTS_PER_IP_PER_DAY` in `diagnose.js`) — controls cost during early testing.
- Research is grounded in public web search, plus real PageSpeed Insights scores when `GOOGLE_PAGESPEED_API_KEY` is set. Deeper competitor data (DataForSEO/traffic/keywords) is still Phase 2 — the "Join the waitlist" button gauges demand for it before the spend is justified.
- No accounts or saved report history — reports expire after 24 hours by design.

## Before going live

- [ ] Replace the placeholders in `public/privacy.html` with your actual business/ICO details, then have it reviewed.
- [ ] Add a cookie consent banner if you add any analytics.
- [ ] Point a `.co.uk` domain at the Netlify site (Site settings → Domain management).
- [ ] Confirm the HubSpot private app token only has the scopes it needs.
