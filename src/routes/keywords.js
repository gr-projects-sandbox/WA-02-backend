const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { verifyAdGroupOwnership, handleGoogleAdsError, parseId } = require("../lib/helpers");
const { KEYWORD_MAX } = require("../lib/constants");

const router = Router();

// GET /api/adgroups/:adGroupId/keywords - lista slow kluczowych
router.get("/:adGroupId/keywords", async (req, res) => {
  const adGroupId = parseId(req.params.adGroupId);
  if (!adGroupId) {
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
    handleGoogleAdsError(res, err, "GET keywords");
  }
});

// POST /api/adgroups/:adGroupId/keywords - dodanie slow kluczowych
// Body: { keywords: [{ text, matchType }] }
// matchType: "EXACT" | "PHRASE" | "BROAD"
router.post("/:adGroupId/keywords", async (req, res) => {
  const { keywords } = req.body;
  const adGroupId = parseId(req.params.adGroupId);
  if (!adGroupId) {
    return res.status(400).json({ error: "Invalid adGroupId" });
  }

  const hasAccess = await verifyAdGroupOwnership(req, adGroupId);
  if (!hasAccess) {
    return res.status(403).json({ error: "Brak dostepu do tej grupy reklam" });
  }

  if (!keywords || !keywords.length) {
    return res.status(400).json({ error: "keywords array is required" });
  }
  const badKw = keywords.find((k) => typeof k.text !== "string" || k.text.trim().length === 0 || k.text.length > KEYWORD_MAX);
  if (badKw) {
    return res.status(400).json({ error: `Kazde slowo kluczowe musi miec 1-${KEYWORD_MAX} znakow` });
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
    handleGoogleAdsError(res, err, "POST keywords");
  }
});

module.exports = router;
