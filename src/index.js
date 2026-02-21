require("dotenv").config();

const requiredEnv = ["JWT_SECRET", "TURSO_URL", "TURSO_AUTH_TOKEN"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const express = require("express");
const { authMiddleware, adminOnly } = require("./lib/auth");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const campaignRoutes = require("./routes/campaigns");
const adGroupRoutes = require("./routes/adGroups");
const adRoutes = require("./routes/ads");
const keywordRoutes = require("./routes/keywords");
const onboardingRoutes = require("./routes/onboarding");

const app = express();
app.use(express.json());

// Public auth routes
app.use("/api/auth", authRoutes);

// Protect all other /api/* routes
app.use("/api", authMiddleware);

app.use("/api/admin", adminOnly, adminRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/campaigns", adGroupRoutes);
app.use("/api/adgroups", adRoutes);
app.use("/api/adgroups", keywordRoutes);
app.use("/api/onboarding", onboardingRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`wise-ads running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  POST /api/auth/register");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/campaigns");
  console.log("  POST /api/campaigns");
  console.log("  PATCH /api/campaigns/:id/status");
  console.log("  GET  /api/campaigns/:id/adgroups");
  console.log("  POST /api/campaigns/:id/adgroups");
  console.log("  POST /api/adgroups/:id/ads");
  console.log("  GET  /api/adgroups/:id/keywords");
  console.log("  POST /api/adgroups/:id/keywords");
  console.log("  POST /api/onboarding/generate");
});
