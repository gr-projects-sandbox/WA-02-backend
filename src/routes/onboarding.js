const { Router } = require("express");
const { load: cheerioLoad } = require("cheerio");
const router = Router();

async function scrapeWebsite(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WiseAdsBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerioLoad(html);

    // Remove scripts, styles, nav, footer to keep only content
    $("script, style, nav, footer, iframe, noscript").remove();

    const title = $("title").first().text().trim();
    const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || "";
    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim() || "";

    const headings = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    const paragraphs = [];
    $("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) paragraphs.push(text);
    });

    const parts = [];
    if (title) parts.push(`Tytul strony: ${title}`);
    if (metaDesc) parts.push(`Meta opis: ${metaDesc}`);
    if (ogTitle && ogTitle !== title) parts.push(`OG Title: ${ogTitle}`);
    if (ogDesc && ogDesc !== metaDesc) parts.push(`OG Description: ${ogDesc}`);
    if (headings.length) parts.push(`Naglowki: ${headings.slice(0, 10).join(" | ")}`);
    if (paragraphs.length) parts.push(`Tresc:\n${paragraphs.slice(0, 8).join("\n")}`);

    const content = parts.join("\n\n");
    // Limit to ~3000 chars to not blow up the prompt
    return content.slice(0, 3000) || null;
  } catch {
    return null;
  }
}

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

  const scrapedContent = await scrapeWebsite(websiteUrl);

  const siteContext = scrapedContent
    ? `Strona: ${websiteUrl}\n\nPobrana tresc strony:\n${scrapedContent}`
    : `Strona: ${websiteUrl}\n\n(Nie udalo sie pobrac tresci strony - wygeneruj kampanie na podstawie samego adresu URL)`;

  const prompt = `Jestes ekspertem Google Ads. Na podstawie adresu strony internetowej i jej tresci wygeneruj kompletna strukture kampanii Google Ads Search.

${siteContext}

Na podstawie powyzszych danych okresl branze i kategorie biznesowa, i wygeneruj kampanie.

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
