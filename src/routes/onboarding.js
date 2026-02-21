const { Router } = require("express");
const router = Router();

router.post("/generate", async (req, res) => {
  const { websiteUrl } = req.body;

  if (!websiteUrl) {
    return res.status(400).json({ error: "websiteUrl is required" });
  }

  try {
    new URL(websiteUrl);
  } catch {
    return res.status(400).json({ error: "Nieprawidlowy adres URL" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API not configured" });
  }

  const prompt = `Jestes ekspertem Google Ads. Na podstawie adresu strony internetowej wygeneruj kompletna strukture kampanii Google Ads Search.

Strona: ${websiteUrl}

Sam przeanalizuj strone, okresl branze i kategorie biznesowa, i na tej podstawie wygeneruj kampanie.

Wygeneruj JSON:
{
  "campaignName": "krotka nazwa kampanii (max 50 znakow)",
  "category": "wykryta kategoria biznesowa",
  "adGroup": {
    "name": "nazwa grupy reklam (max 50 znakow)",
    "headlines": ["headline1", "headline2"],
    "descriptions": ["description1", "description2"],
    "keywords": [
      {"text": "slowo kluczowe", "matchType": "BROAD"}
    ]
  }
}

Zasady:
- campaignName: zwiezla nazwa kampanii, max 50 znakow
- category: krotka nazwa wykrytej kategorii (np. "E-commerce", "Uslugi lokalne", "IT/SaaS")
- headlines: 5 do 10 tekstow, kazdy max 30 znakow, po polsku
- descriptions: 2 do 4 teksty, kazdy MUSI miec max 90 znakow (NIGDY nie przekraczaj 90 znakow!), po polsku
- keywords: 5 do 10 slow kluczowych po polsku, matchType: BROAD, PHRASE lub EXACT
- Headline 1 powinien zawierac nazwe firmy lub strony
- Headlines i descriptions powinny zawierac wezwania do dzialania (CTA)
- Keywords powinny byc trafne dla wykrytej branzy`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", JSON.stringify(errData, null, 2));
      return res.status(502).json({ error: "Blad generowania AI" });
    }

    const data = await response.json();

    // gemini-2.5-flash returns thinking parts + text parts, find the text
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p) => p.text !== undefined);
    const text = textPart?.text;

    if (!text) {
      console.error("Gemini empty response, parts:", JSON.stringify(parts));
      return res.status(502).json({ error: "Brak odpowiedzi z AI" });
    }

    const jsonStr = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const result = JSON.parse(jsonStr);

    if (!result.campaignName || !result.adGroup) {
      return res
        .status(502)
        .json({ error: "Nieprawidlowa struktura odpowiedzi AI" });
    }

    res.json(result);
  } catch (err) {
    console.error("Onboarding generate error:", err.message);
    res.status(500).json({ error: "Blad generowania kampanii" });
  }
});

module.exports = router;
