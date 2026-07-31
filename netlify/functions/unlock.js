const { blobStore } = require("./_blobs");

async function createHubSpotContact({ email, firstname, businessName, businessUrl }) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    // Don't block the report if HubSpot isn't configured yet — just skip lead capture.
    console.warn("HUBSPOT_ACCESS_TOKEN not set — skipping CRM sync.");
    return;
  }

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      properties: {
        email,
        firstname: firstname || "",
        company: businessName || "",
        website: businessUrl || "",
        lead_source: "BIZXRAY diagnostic tool",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A duplicate contact (409) is expected for repeat visitors — not a real error.
    if (res.status !== 409) {
      console.error(`HubSpot error ${res.status}: ${body.slice(0, 300)}`);
    }
  }
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

  const { reportId, email, firstname } = payload;
  if (!reportId || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: "reportId and email are required." }) };
  }

  const store = blobStore("reports");
  const report = await store.get(reportId, { type: "json" });
  if (!report) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "This report has expired or was not found. Please run a new diagnostic." }),
    };
  }

  if (report.status === "failed") {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: report.error || "This diagnostic failed to complete. Please run a new one." }),
    };
  }

  if (report.status !== "ready") {
    // Background research hasn't finished writing the full report yet.
    return {
      statusCode: 409,
      body: JSON.stringify({ error: "This report is still being prepared. Please wait a moment and try again." }),
    };
  }

  try {
    await createHubSpotContact({
      email,
      firstname,
      businessName: report.name,
      businessUrl: report.url,
    });
  } catch (err) {
    // Lead capture failing should not stop the user getting their report.
    console.error("HubSpot sync failed:", err.message);
  }

  return { statusCode: 200, body: JSON.stringify({ report }) };
};
