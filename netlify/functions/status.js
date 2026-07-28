const { blobStore } = require("./_blobs");

// Fast polling endpoint — the frontend hits this every few seconds after kicking off
// a diagnostic, until the background function marks the report "ready" or "failed".
exports.handler = async (event) => {
  const reportId = (event.queryStringParameters && event.queryStringParameters.reportId) || "";
  if (!reportId) {
    return { statusCode: 400, body: JSON.stringify({ error: "reportId is required." }) };
  }

  const store = blobStore("reports");
  const report = await store.get(reportId, { type: "json" });

  if (!report) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "This report has expired or was not found. Please run a new diagnostic." }),
    };
  }

  if (report.status === "ready") {
    // Only release the teaser (first section) here — the rest stays locked until unlock.
    return {
      statusCode: 200,
      body: JSON.stringify({
        reportId,
        status: "ready",
        teaser: { market: report.market },
        locked: true,
      }),
    };
  }

  if (report.status === "failed") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        reportId,
        status: "failed",
        error: report.error || "The diagnostic failed to complete. Please try again.",
      }),
    };
  }

  // Still pending.
  return {
    statusCode: 200,
    body: JSON.stringify({ reportId, status: "pending" }),
  };
};
