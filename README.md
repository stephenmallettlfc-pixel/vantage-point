# Vantage Point

Business diagnostic tool — free preview + email-gated full report.

## What's in here

```
netlify.toml                     — routes /api/* to the functions
public/index.html                — the site itself
public/privacy.html              — starter UK GDPR privacy notice (edit before publishing)
netlify/functions/_claude.js     — shared helper that calls the Anthropic API
netlify/functions/diagnose.js    — runs the research, returns a teaser, stores full report (24h TTL)
netlify/functions/unlock.js      — captures the lead into HubSpot, releases the full report
package.json                     — one dependency: @netlify/blobs (used for temp report storage + rate limiting)
```

## Before you deploy — two secrets to add

These must be set as **environment variables in the Netlify dashboard** (Site settings → Environment variables), not committed to code:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. This is separate from a claude.ai login. |
| `HUBSPOT_ACCESS_TOKEN` | Your HubSpot account → Settings → Integrations → Private Apps → create one with `crm.objects.contacts.write` scope, copy the token it generates. |

The site will run without `HUBSPOT_ACCESS_TOKEN` set (it just skips CRM sync and logs a warning) — so you can deploy and test the report flow before HubSpot is wired up. It will **not** run without `ANTHROPIC_API_KEY`.

## Deploying

**Easiest path — Netlify CLI (recommended, works well from Claude Code if you want help with this step too):**
```
npm install -g netlify-cli
cd vantage-point
netlify init      # links this folder to a new or existing Netlify site
netlify deploy --prod
```

**Alternative — Git-based deploy:** push this folder to a GitHub/GitLab repo, then in Netlify: "Add new site" → "Import an existing project" → pick the repo. Netlify will pick up `netlify.toml` automatically.

After the first deploy, add the two environment variables above in the Netlify dashboard, then trigger a redeploy so the functions pick them up.

## What it does

1. Visitor enters business name + URL + optional context.
2. `/api/diagnose` runs three research passes (market, website, competitive) via Claude with web search, synthesises strengths/weaknesses/priorities, stores the full result in Netlify Blobs for 24 hours, and returns only the market-context section as a teaser.
3. Visitor enters name + email to unlock.
4. `/api/unlock` creates/updates a HubSpot contact (tagged with the business they looked up) and returns the full stored report.

## Known limits, by design (see the production scoping doc)

- Rate-limited to 5 reports per IP per day (edit `MAX_REPORTS_PER_IP_PER_DAY` in `diagnose.js`) — controls cost during early testing.
- Research is grounded in public web search only — no PageSpeed/DataForSEO/etc. yet. That's Phase 2, deliberately deferred until usage data justifies the spend.
- No accounts or saved report history — reports expire after 24 hours by design.

## Before going live

- [ ] Replace the placeholders in `public/privacy.html` with your actual business/ICO details, then have it reviewed.
- [ ] Add a cookie consent banner if you add any analytics.
- [ ] Point a `.co.uk` domain at the Netlify site (Site settings → Domain management).
- [ ] Confirm the HubSpot private app token only has the scopes it needs.
