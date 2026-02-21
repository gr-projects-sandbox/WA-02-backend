const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { db } = require("../lib/db");

const router = Router();

// GET /api/campaigns/:campaignId/adgroups - lista grup reklam
router.get("/:campaignId/adgroups", async (req, res) => {
  const campaignId = req.params.campaignId;
  if (!/^\d+$/.test(campaignId)) {
    return res.status(400).json({ error: "Invalid campaignId" });
  }

  const owned = await db.execute({
    sql: "SELECT 1 FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
    args: [req.user.id, campaignId],
  });
  if (owned.rows.length === 0) {
    return res.status(403).json({ error: "Brak dostepu do tej kampanii" });
  }
  try {
    const adGroups = await customer.query(`
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros
      FROM ad_group
      WHERE campaign.id = ${campaignId}
      ORDER BY ad_group.name
    `);
    res.json(adGroups);
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("adGroups error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

// POST /api/campaigns/:campaignId/adgroups - nowa grupa reklam
// Body: { name, cpcBidMicros }
router.post("/:campaignId/adgroups", async (req, res) => {
  const { name, cpcBidMicros = 1000000 } = req.body;
  const campaignId = req.params.campaignId;
  if (!/^\d+$/.test(campaignId)) {
    return res.status(400).json({ error: "Invalid campaignId" });
  }

  const owned = await db.execute({
    sql: "SELECT 1 FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
    args: [req.user.id, campaignId],
  });
  if (owned.rows.length === 0) {
    return res.status(403).json({ error: "Brak dostepu do tej kampanii" });
  }

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const customerId = customer.credentials.customer_id;
  const campaignResourceName = ResourceNames.campaign(customerId, campaignId);

  try {
    const result = await customer.mutateResources([
      {
        entity: "ad_group",
        operation: "create",
        resource: {
          name,
          campaign: campaignResourceName,
          status: enums.AdGroupStatus.ENABLED,
          type: enums.AdGroupType.SEARCH_STANDARD,
          cpc_bid_micros: cpcBidMicros,
        },
      },
    ]);
    const agResponses = result?.mutate_operation_responses || result?.results || [];
    const agEntry = agResponses.find((r) => r.ad_group_result);
    const adGroupId = agEntry?.ad_group_result?.resource_name?.split("/").pop();

    res.status(201).json({ results: result, adGroupId });
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("adGroups error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

module.exports = router;
