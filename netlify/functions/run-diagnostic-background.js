const { blobStore } = require("./_blobs");
const { askClaude } = require("./_claude");

// Netlify "background function" — the trailing "-background" in the filename tells
// Netlify to invoke this asynchronously (it responds 202 immediately and may run
// far longer than a normal function). This does the slow AI research + synthesis
// that would otherwise time out a synchronous request.
exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    // Nothing to write back to without a reportId — just bail.
    return { statusCode: 400 };
  }

  const { reportId } = payload;
  const name = (payload.name || "").trim();
  const url = (payload.url || "").trim();
  const context = (payload.context || "").trim();

  if (!reportId || !name || !url) {
    return { statusCode: 400 };
  }

  const store = blobStore("reports");
  const ttl = { seconds: 60 * 60 * 24 }; // Match the 24h expiry set when the report was created.

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

    const fullReport = {
      status: "ready",
      name,
      url,
      context,
      market,
      website,
      competitive,
      synthesis,
      createdAt: new Date().toISOString(),
    };

    await store.setJSON(reportId, fullReport, { metadata: { name }, ttl });

    return { statusCode: 200 };
  } catch (err) {
    // Record the failure so the frontend polling /api/status can surface a clear error
    // instead of waiting forever.
    try {
      await store.setJSON(
        reportId,
        { status: "failed", name, url, context, error: err.message, createdAt: new Date().toISOString() },
        { metadata: { name }, ttl }
      );
    } catch (writeErr) {
      console.error("Failed to record diagnostic failure:", writeErr.message);
    }
    return { statusCode: 500 };
  }
};
