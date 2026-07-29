// Shared helper — fetches real performance data from Google's PageSpeed Insights API.
// Requires GOOGLE_PAGESPEED_API_KEY to be set as a Netlify environment variable.
//
// Best-effort by design: if the key isn't set or the request fails, this returns
// null rather than throwing, so a diagnostic still generates without PageSpeed data.

function pct(score) {
  // Lighthouse category scores are 0..1; present them as an X/100 figure.
  return typeof score === "number" ? Math.round(score * 100) : null;
}

async function getPageSpeed(url) {
  try {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey || !url) {
      return null;
    }

    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("strategy", "mobile");
    for (const category of ["performance", "seo", "accessibility"]) {
      endpoint.searchParams.append("category", category);
    }

    const res = await fetch(endpoint.toString());
    if (!res.ok) {
      console.warn(`PageSpeed API error ${res.status} — continuing without PageSpeed data.`);
      return null;
    }

    const data = await res.json();
    const lh = data.lighthouseResult || {};
    const categories = lh.categories || {};
    const audits = lh.audits || {};

    const lcpAudit = audits["largest-contentful-paint"] || {};
    const clsAudit = audits["cumulative-layout-shift"] || {};

    return {
      performance: pct(categories.performance && categories.performance.score),
      seo: pct(categories.seo && categories.seo.score),
      accessibility: pct(categories.accessibility && categories.accessibility.score),
      // LCP in seconds (numericValue is in ms), CLS as a unitless number.
      lcpSeconds:
        typeof lcpAudit.numericValue === "number"
          ? Math.round((lcpAudit.numericValue / 1000) * 10) / 10
          : null,
      cls:
        typeof clsAudit.numericValue === "number"
          ? Math.round(clsAudit.numericValue * 1000) / 1000
          : null,
    };
  } catch (err) {
    console.warn("PageSpeed lookup failed — continuing without it:", err.message);
    return null;
  }
}

module.exports = { getPageSpeed };
