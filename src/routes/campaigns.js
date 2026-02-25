const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { db } = require("../lib/db");
const { verifyCampaignOwnership, handleGoogleAdsError, extractResourceId, parseId } = require("../lib/helpers");

const router = Router();

// GET /api/campaigns - lista kampanii usera z metrykami
router.get("/", async (req, res) => {
  try {
    const owned = await db.execute({
      sql: "SELECT campaign_id FROM user_campaigns WHERE user_id = ?",
      args: [req.user.id],
    });
    const ids = owned.rows.map((r) => r.campaign_id);

    if (ids.length === 0) {
      return res.json([]);
    }

    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.advertising_channel_type = 'SEARCH'
        AND campaign.id IN (${ids.join(",")})
      ORDER BY campaign.name
    `);
    res.json(campaigns);
  } catch (err) {
    handleGoogleAdsError(res, err, "GET /api/campaigns");
  }
});

// POST /api/campaigns - nowa kampania Search
// Body: { name, budgetAmountMicros, biddingStrategy }
// biddingStrategy: "MAXIMIZE_CLICKS" | "MANUAL_CPC" | "TARGET_CPA"
router.post("/", async (req, res) => {
  const { name, budgetAmountMicros, biddingStrategy = "MAXIMIZE_CLICKS" } = req.body;

  if (!name || !budgetAmountMicros) {
    return res.status(400).json({ error: "name and budgetAmountMicros are required" });
  }

  const customerId = customer.credentials.customer_id;
  const budgetResourceName = ResourceNames.campaignBudget(customerId, -1);

  const budgetResource = {
    resource_name: budgetResourceName,
    name: `${name} Budget`,
    amount_micros: budgetAmountMicros,
    delivery_method: enums.BudgetDeliveryMethod.STANDARD,
    explicitly_shared: false,
  };

  const campaignResource = {
    name,
    campaign_budget: budgetResourceName,
    advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
    status: enums.CampaignStatus.PAUSED,
    network_settings: {
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    },
    contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
  };

  if (biddingStrategy === "MANUAL_CPC") {
    campaignResource.manual_cpc = { enhanced_cpc_enabled: false };
  } else if (biddingStrategy === "TARGET_CPA") {
    campaignResource.target_cpa = { target_cpa_micros: 1000000 };
  } else {
    // "Maximize Clicks" in Google Ads API = target_spend
    campaignResource.target_spend = { cpc_bid_ceiling_micros: 10000000 };
  }

  try {
    const result = await customer.mutateResources([
      { entity: "campaign_budget", operation: "create", resource: budgetResource },
      { entity: "campaign", operation: "create", resource: campaignResource },
    ]);

    const campaignId = extractResourceId(result, "campaign");
    if (!campaignId) {
      console.error("No campaign_result in response:", JSON.stringify(result, null, 2));
      return res.status(500).json({ error: "Kampania utworzona w Google Ads, ale nie udalo sie odczytac ID" });
    }
    await db.execute({
      sql: "INSERT INTO user_campaigns (user_id, campaign_id) VALUES (?, ?)",
      args: [req.user.id, campaignId],
    });

    res.status(201).json({ results: result, campaignId });
  } catch (err) {
    handleGoogleAdsError(res, err, "POST /api/campaigns");
  }
});

// PATCH /api/campaigns/:campaignId/status - zmiana statusu kampanii
// Body: { status: "ENABLED" | "PAUSED" }
router.patch("/:campaignId/status", async (req, res) => {
  const { status } = req.body;
  const campaignId = parseId(req.params.campaignId);
  if (!campaignId) {
    return res.status(400).json({ error: "Invalid campaignId" });
  }

  const owned = await verifyCampaignOwnership(req, campaignId);
  if (!owned) {
    return res.status(403).json({ error: "Brak dostepu do tej kampanii" });
  }

  if (!status || !["ENABLED", "PAUSED"].includes(status)) {
    return res.status(400).json({ error: 'status must be "ENABLED" or "PAUSED"' });
  }

  const customerId = customer.credentials.customer_id;
  const resourceName = ResourceNames.campaign(customerId, campaignId);

  try {
    const result = await customer.mutateResources([
      {
        entity: "campaign",
        operation: "update",
        resource: {
          resource_name: resourceName,
          status: enums.CampaignStatus[status],
        },
      },
    ]);
    res.json({ results: result });
  } catch (err) {
    handleGoogleAdsError(res, err, "PATCH campaign status");
  }
});

module.exports = router;
