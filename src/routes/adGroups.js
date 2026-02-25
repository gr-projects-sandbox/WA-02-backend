const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { verifyCampaignOwnership, handleGoogleAdsError, extractResourceId, parseId } = require("../lib/helpers");

const router = Router();

// GET /api/campaigns/:campaignId/adgroups - lista grup reklam
router.get("/:campaignId/adgroups", async (req, res) => {
  const campaignId = parseId(req.params.campaignId);
  if (!campaignId) {
    return res.status(400).json({ error: "Invalid campaignId" });
  }

  const owned = await verifyCampaignOwnership(req, campaignId);
  if (!owned) {
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
    handleGoogleAdsError(res, err, "GET adGroups");
  }
});

// POST /api/campaigns/:campaignId/adgroups - nowa grupa reklam
// Body: { name, cpcBidMicros }
router.post("/:campaignId/adgroups", async (req, res) => {
  const { name, cpcBidMicros = 1000000 } = req.body;
  const campaignId = parseId(req.params.campaignId);
  if (!campaignId) {
    return res.status(400).json({ error: "Invalid campaignId" });
  }

  const owned = await verifyCampaignOwnership(req, campaignId);
  if (!owned) {
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
    const adGroupId = extractResourceId(result, "ad_group");
    res.status(201).json({ results: result, adGroupId });
  } catch (err) {
    handleGoogleAdsError(res, err, "POST adGroups");
  }
});

module.exports = router;
