const { Router } = require("express");
const { customer } = require("../lib/googleAds");
const { db } = require("../lib/db");

const router = Router();

// GET /api/admin/users — lista userow z liczba kampanii
router.get("/users", async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT u.id, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM user_campaigns uc WHERE uc.user_id = u.id) AS campaign_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Blad pobierania userow" });
  }
});

// DELETE /api/admin/users/:id — usun usera
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: "Nie mozesz usunac siebie" });
  }

  try {
    await db.execute({ sql: "DELETE FROM user_campaigns WHERE user_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Blad usuwania usera" });
  }
});

// GET /api/admin/campaigns — WSZYSTKIE kampanie z Google Ads
router.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status
      FROM campaign
      WHERE campaign.advertising_channel_type = 'SEARCH'
      ORDER BY campaign.name
    `);
    res.json(campaigns);
  } catch (err) {
    const details = err.errors || [{ message: err.message }];
    console.error("admin campaigns error:", JSON.stringify(details, null, 2));
    res.status(400).json({ error: details[0]?.message || "Google Ads API error" });
  }
});

// GET /api/admin/users/:id/campaigns — kampanie przypisane do usera
router.get("/users/:id/campaigns", async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT campaign_id FROM user_campaigns WHERE user_id = ?",
      args: [req.params.id],
    });
    res.json(result.rows.map((r) => r.campaign_id));
  } catch (err) {
    console.error("Admin user campaigns error:", err);
    res.status(500).json({ error: "Blad pobierania kampanii usera" });
  }
});

// POST /api/admin/users/:id/campaigns — przypisz kampanie do usera
router.post("/users/:id/campaigns", async (req, res) => {
  const { campaignId } = req.body;
  if (!campaignId) {
    return res.status(400).json({ error: "campaignId is required" });
  }

  try {
    await db.execute({
      sql: "INSERT OR IGNORE INTO user_campaigns (user_id, campaign_id) VALUES (?, ?)",
      args: [req.params.id, campaignId],
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Admin assign campaign error:", err);
    res.status(500).json({ error: "Blad przypisywania kampanii" });
  }
});

// DELETE /api/admin/users/:id/campaigns/:campaignId — odepnij kampanie
router.delete("/users/:id/campaigns/:campaignId", async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM user_campaigns WHERE user_id = ? AND campaign_id = ?",
      args: [req.params.id, req.params.campaignId],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin unassign campaign error:", err);
    res.status(500).json({ error: "Blad odpinania kampanii" });
  }
});

module.exports = router;
