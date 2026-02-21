const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { db } = require("../lib/db");

const router = Router();

// POST /api/adgroups/:adGroupId/ads - nowa reklama Responsive Search Ad
// Body: { headlines: string[], descriptions: string[], finalUrl: string }
router.post("/:adGroupId/ads", async (req, res) => {
  const { headlines, descriptions, finalUrl } = req.body;
  const adGroupId = parseInt(req.params.adGroupId, 10);
  if (isNaN(adGroupId)) {
    return res.status(400).json({ error: "Invalid adGroupId" });
  }

  // Ownership check: ad group -> campaign -> user
  try {
    const adGroup = await customer.query(`
      SELECT campaign.id FROM ad_group WHERE ad_group.id = ${adGroupId} LIMIT 1
    `);
    if (adGroup.length === 0) {
      return res.status(404).json({ error: "Ad group not found" });
    }
    const campaignId = adGroup[0].campaign.id;
    const owned = await db.execute({
      sql: "SELECT 1 FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
      args: [req.user.id, String(campaignId)],
    });
    if (owned.rows.length === 0) {
      return res.status(403).json({ error: "Brak dostepu do tej grupy reklam" });
    }
  } catch (err) {
    console.error("Ownership check error:", err);
    return res.status(500).json({ error: "Blad weryfikacji dostepu" });
  }

  if (!headlines || headlines.length < 3) {
    return res.status(400).json({ error: "At least 3 headlines are required" });
  }
  if (!descriptions || descriptions.length < 2) {
    return res.status(400).json({ error: "At least 2 descriptions are required" });
  }
  const badHeadline = headlines.find((h) => typeof h !== "string" || h.length > 30);
  if (badHeadline !== undefined) {
    return res.status(400).json({ error: "Kazdy headline max 30 znakow" });
  }
  const badDesc = descriptions.find((d) => typeof d !== "string" || d.length > 90);
  if (badDesc !== undefined) {
    return res.status(400).json({ error: "Kazdy description max 90 znakow" });
  }
  if (!finalUrl) {
    return res.status(400).json({ error: "finalUrl is required" });
  }
  try {
    new URL(finalUrl);
  } catch {
    return res.status(400).json({ error: "finalUrl musi byc prawidlowym URL" });
  }

  const customerId = customer.credentials.customer_id;
  const adGroupResourceName = ResourceNames.adGroup(customerId, adGroupId);

  try {
    const result = await customer.mutateResources([
      {
        entity: "ad_group_ad",
        operation: "create",
        resource: {
          ad_group: adGroupResourceName,
          status: enums.AdGroupAdStatus.PAUSED,
          ad: {
            responsive_search_ad: {
              headlines: headlines.map((text, i) => ({
                text,
                pinned_field: i === 0 ? enums.ServedAssetFieldType.HEADLINE_1 : undefined,
              })),
              descriptions: descriptions.map((text) => ({ text })),
            },
            final_urls: [finalUrl],
          },
        },
      },
    ]);
    res.status(201).json({ results: result });
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("ads error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

module.exports = router;
