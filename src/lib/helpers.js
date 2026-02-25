const { customer } = require("./googleAds");
const { db } = require("./db");

async function verifyCampaignOwnership(req, campaignId) {
  const owned = await db.execute({
    sql: "SELECT 1 FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
    args: [req.user.id, String(campaignId)],
  });
  return owned.rows.length > 0;
}

async function verifyAdGroupOwnership(req, adGroupId) {
  try {
    const adGroup = await customer.query(
      `SELECT campaign.id FROM ad_group WHERE ad_group.id = ${adGroupId} LIMIT 1`
    );
    if (adGroup.length === 0) return false;
    return verifyCampaignOwnership(req, adGroup[0].campaign.id);
  } catch (err) {
    console.error("Ownership check error:", err.message);
    return false;
  }
}

function handleGoogleAdsError(res, err, context = "") {
  const details = err.errors || [{ message: err.message }];
  console.error(`${context} error:`, JSON.stringify(details, null, 2));
  res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
}

function extractResourceId(result, type) {
  const responses = result?.mutate_operation_responses || result?.results || [];
  const entry = responses.find((r) => r[`${type}_result`]);
  return entry?.[`${type}_result`]?.resource_name?.split("/").pop() || null;
}

function parseId(value) {
  return /^\d+$/.test(value) ? parseInt(value, 10) : null;
}

module.exports = {
  verifyCampaignOwnership, verifyAdGroupOwnership,
  handleGoogleAdsError, extractResourceId, parseId,
};
