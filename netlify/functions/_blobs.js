const { getStore } = require("@netlify/blobs");

// Netlify is supposed to auto-configure Blobs for Functions, but this fails
// intermittently on some sites/deploys with "MissingBlobsEnvironmentError"
// even when everything is set up correctly (a known platform quirk).
// Falling back to explicit siteID + token avoids relying on that auto-injection.
function blobStore(name) {
  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name, siteID, token });
  }

  // No manual credentials configured yet — try the automatic context.
  return getStore(name);
}

module.exports = { blobStore };
