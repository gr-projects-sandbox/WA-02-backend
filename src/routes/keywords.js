const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { db } = require("../lib/db");

const router = Router();

// Helper: sprawdz czy user jest wlascicielem kampanii do ktorej nalezy ad group
async function verifyAdGroupOwnership(req, adGroupId) {
  try {
    const adGroup = await customer.query(`
      SELECT campaign.id FROM ad_group WHERE ad_group.id = ${adGroupId} LIMIT 1
    `);
    if (adGroup.length === 0) return false;
    const campaignId = adGroup[0].campaign.id;
    const owned = await db.execute({
      sql: "SELECT 1 FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
      args: [req.user.id, String(campaignId)],
    });
    return owned.rows.length > 0;
  } catch (err) {
    console.error("Ownership check error:", err.message);
    return false;
  }
}

// GET /api/adgroups/:adGroupId/keywords - lista slow kluczowych
router.get("/:adGroupId/keywords", async (req, res) => {
  const adGroupId = parseInt(req.params.adGroupId, 10);
  if (isNaN(adGroupId)) {
    return res.status(400).json({ error: "Invalid adGroupId" });
  }

  const hasAccess = await verifyAdGroupOwnership(req, adGroupId);
  if (!hasAccess) {
    return res.status(403).json({ error: "Brak dostepu do tej grupy reklam" });
  }

  try {
    const keywords = await customer.query(`
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status
      FROM ad_group_criterion
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_criterion.type = 'KEYWORD'
      ORDER BY ad_group_criterion.keyword.text
    `);
    res.json(keywords);
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("keywords error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

// POST /api/adgroups/:adGroupId/keywords - dodanie slow kluczowych
// Body: { keywords: [{ text, matchType }] }
// matchType: "EXACT" | "PHRASE" | "BROAD"
router.post("/:adGroupId/keywords", async (req, res) => {
  const { keywords } = req.body;
  const adGroupId = parseInt(req.params.adGroupId, 10);
  if (isNaN(adGroupId)) {
    return res.status(400).json({ error: "Invalid adGroupId" });
  }

  const hasAccess = await verifyAdGroupOwnership(req, adGroupId);
  if (!hasAccess) {
    return res.status(403).json({ error: "Brak dostepu do tej grupy reklam" });
  }

  if (!keywords || !keywords.length) {
    return res.status(400).json({ error: "keywords array is required" });
  }
  const badKw = keywords.find((k) => typeof k.text !== "string" || k.text.trim().length === 0 || k.text.length > 80);
  if (badKw) {
    return res.status(400).json({ error: "Kazde slowo kluczowe musi miec 1-80 znakow" });
  }
  const validMatchTypes = ["EXACT", "PHRASE", "BROAD"];
  const badMatch = keywords.find((k) => k.matchType && !validMatchTypes.includes(k.matchType));
  if (badMatch) {
    return res.status(400).json({ error: "matchType musi byc EXACT, PHRASE lub BROAD" });
  }

  const customerId = customer.credentials.customer_id;
  const adGroupResourceName = ResourceNames.adGroup(customerId, adGroupId);

  const operations = keywords.map(({ text, matchType = "BROAD" }) => ({
    entity: "ad_group_criterion",
    operation: "create",
    resource: {
      ad_group: adGroupResourceName,
      status: enums.AdGroupCriterionStatus.ENABLED,
      keyword: {
        text,
        match_type: enums.KeywordMatchType[matchType],
      },
    },
  }));

  try {
    const result = await customer.mutateResources(operations);
    res.status(201).json({ results: result });
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("keywords error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

module.exports = router;
