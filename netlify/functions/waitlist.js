const { blobStore } = require("./_blobs");

// Captures interest in a future paid competitor-data feature. Best-effort:
// this must never block or break the user's experience, so it always returns
// 200 — even if the write fails (we just log it).
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    // Malformed body — nothing to store, but don't surface an error to the user.
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const email = (payload.email || "").trim();
  const name = (payload.name || "").trim();
  const businessName = (payload.businessName || "").trim();
  const url = (payload.url || "").trim();

  try {
    const store = blobStore("waitlist");
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await store.setJSON(
      key,
      { email, name, businessName, url, createdAt: new Date().toISOString() },
      { metadata: { email } }
    );
  } catch (err) {
    // Storage failing should never stop the user — just record it server-side.
    console.error("Waitlist write failed:", err.message);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
