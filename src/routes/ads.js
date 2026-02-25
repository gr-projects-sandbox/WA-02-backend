const { Router } = require("express");
const { enums, ResourceNames } = require("google-ads-api");
const { customer } = require("../lib/googleAds");
const { verifyAdGroupOwnership, handleGoogleAdsError, parseId } = require("../lib/helpers");
const { HEADLINE_MAX, DESCRIPTION_MAX, MIN_HEADLINES, MIN_DESCRIPTIONS } = require("../lib/constants");

const router = Router();

// POST /api/adgroups/:adGroupId/ads - nowa reklama Responsive Search Ad
// Body: { headlines: string[], descriptions: string[], finalUrl: string }
router.post("/:adGroupId/ads", async (req, res) => {
  const { headlines, descriptions, finalUrl } = req.body;
  const adGroupId = parseId(req.params.adGroupId);
  if (!adGroupId) {
    return res.status(400).json({ error: "Invalid adGroupId" });
  }

  const hasAccess = await verifyAdGroupOwnership(req, adGroupId);
  if (!hasAccess) {
    return res.status(403).json({ error: "Brak dostepu do tej grupy reklam" });
  }

  if (!headlines || headlines.length < MIN_HEADLINES) {
    return res.status(400).json({ error: `At least ${MIN_HEADLINES} headlines are required` });
  }
  if (!descriptions || descriptions.length < MIN_DESCRIPTIONS) {
    return res.status(400).json({ error: `At least ${MIN_DESCRIPTIONS} descriptions are required` });
  }
  const badHeadline = headlines.find((h) => typeof h !== "string" || h.length > HEADLINE_MAX);
  if (badHeadline !== undefined) {
    return res.status(400).json({ error: `Kazdy headline max ${HEADLINE_MAX} znakow` });
  }
  const badDesc = descriptions.find((d) => typeof d !== "string" || d.length > DESCRIPTION_MAX);
  if (badDesc !== undefined) {
    return res.status(400).json({ error: `Kazdy description max ${DESCRIPTION_MAX} znakow` });
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
    handleGoogleAdsError(res, err, "POST ads");
  }
});

module.exports = router;
