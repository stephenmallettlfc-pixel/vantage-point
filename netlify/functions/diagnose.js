const { blobStore } = require("./_blobs");
const { askClaude } = require("./_claude");

const MAX_REPORTS_PER_IP_PER_DAY = 5;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function checkAndIncrementRateLimit(ip) {
  const store = blobStore("rate-limits");
  const key = `${ip}:${todayKey()}`;
  const current = (await store.get(key, { type: "json" })) || { count: 0 };
  if (current.count >= MAX_REPORTS_PER_IP_PER_DAY) {
    return false;
  }
  current.count += 1;
  await store.setJSON(key, current, { metadata: { ip } });
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const name = (payload.name || "").trim();
  const url = (payload.url || "").trim();
  const context = (payload.context || "").trim();

  if (!name || !url) {
    return { statusCode: 400, body: JSON.stringify({ error: "Business name and website URL are required." }) };
  }

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    "unknown";

  const allowed = await checkAndIncrementRateLimit(ip);
  if (!allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Free diagnostic limit reached for today (${MAX_REPORTS_PER_IP_PER_DAY} per day). Please try again tomorrow.`,
      }),
    };
  }

  try {
    const marketPrompt = `You are a business analyst. Business: "${name}". Website: ${url}. Additional context: "${context || "none given"}".
Use web search to establish: the industry/sector, who the target customers likely are, the apparent business model, and 2-3 relevant current market trends or pressures for a business like this.
Respond ONLY in concise markdown bullet points (5-8 bullets), under 180 words total. No preamble, no headings, no closing remarks.`;

    const websitePrompt = `You are a website auditor. Business: "${name}". Website: ${url}.
Use web search (searching the domain, the business name + "reviews", the business name + "google business") to assess: whether the site appears to have a blog/content section, whether a Google Business Profile / reviews presence is visible, what the site's title/description looks like in search results, and any obvious content or trust-signal gaps (no address, no reviews, thin content, etc).
Respond ONLY in concise markdown bullet points (5-8 bullets), under 180 words total. No preamble, no headings, no closing remarks.`;

    const competitivePrompt = `You are a competitive analyst. Business: "${name}". Website: ${url}. Context: "${context || "none given"}".
Use web search to find who the top 2-4 competitors are, and search for the core service/product this business likely offers to see whether "${name}" appears prominently in results or is overshadowed by competitors, directories, or marketplaces.
Respond ONLY in concise markdown bullet points (5-8 bullets), under 180 words total. No preamble, no headings, no closing remarks.`;

    const [market, website, competitive] = await Promise.all([
      askClaude(marketPrompt),
      askClaude(websitePrompt),
      askClaude(competitivePrompt),
    ]);

    const synthPrompt = `You are a senior marketing consultant. Business: "${name}" (${url}).
Here is research gathered about it:

MARKET CONTEXT:
${market}

WEBSITE & DIGITAL PRESENCE:
${website}

COMPETITIVE & SEARCH LANDSCAPE:
${competitive}

Based only on the above, produce:
1. Three genuine strengths (bold the label, one line each)
2. Three genuine weaknesses (bold the label, one line each)
3. Top three priority actions, ordered by impact, each one line, specific enough to act on

Respond ONLY in concise markdown bullet points, under 220 words total.`;

    const synthesis = await askClaude(synthPrompt, 700);

    const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const fullReport = { name, url, context, market, website, competitive, synthesis, createdAt: new Date().toISOString() };

    const store = blobStore("reports");
    // Reports expire after 24h — this is a one-shot diagnostic tool, not a saved-history product (yet).
    await store.setJSON(reportId, fullReport, { metadata: { name }, ttl: { seconds: 60 * 60 * 24 } });

    // Teaser: first section in full, plus a locked headline for the rest.
    return {
      statusCode: 200,
      body: JSON.stringify({
        reportId,
        teaser: {
          market,
        },
        locked: true,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
