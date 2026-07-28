const { blobStore } = require("./_blobs");

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
    const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const store = blobStore("reports");
    // Reports expire after 24h — this is a one-shot diagnostic tool, not a saved-history product (yet).
    // Write a placeholder immediately; the background function fills in the results.
    await store.setJSON(
      reportId,
      { status: "pending", name, url, context, createdAt: new Date().toISOString() },
      { metadata: { name }, ttl: { seconds: 60 * 60 * 24 } }
    );

    // Kick off the slow research work in a Netlify background function, which can run
    // far longer than a normal function (avoiding this request timing out).
    const base = process.env.URL;
    await fetch(`${base}/.netlify/functions/run-diagnostic-background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId, name, url, context }),
    });

    return {
      statusCode: 202,
      body: JSON.stringify({ reportId, status: "pending" }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
