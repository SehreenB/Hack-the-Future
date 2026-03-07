// ─────────────────────────────────────────────────────────────────────────────
// services/gdeltService.js
// GDELT Project API — Free, no key required
// Real-time global event database: conflicts, sanctions, trade restrictions
// https://api.gdeltproject.org/api/v2/
// ─────────────────────────────────────────────────────────────────────────────

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

// CAMEO event codes relevant to supply chain risk
// https://www.gdeltproject.org/data/documentation/CAMEO.Manual.1.1b3.pdf
const SUPPLY_CHAIN_EVENT_CODES = [
  "20",  // ENGAGE IN UNCONVENTIONAL MASS VIOLENCE
  "17",  // COERCE
  "15",  // EXHIBIT MILITARY POSTURE
  "14",  // PROTEST
  "13",  // THREATEN
  "19",  // FIGHT
  "18",  // ASSAULT
];

/**
 * Fetch geopolitical event signals from GDELT for a given region/query
 * @param {string} query - Search query (e.g., "Taiwan Strait shipping")
 * @param {string} mode - "ArtList" | "TimelineVol" | "ToneChart"
 * @returns {Promise<Array>} Normalized geopolitical signals
 */
export async function fetchGeopoliticalSignals(query = "supply chain disruption shipping", mode = "ArtList") {
  try {
    const params = new URLSearchParams({
      query: `${query} sourcelang:english`,
      mode,
      maxrecords: "10",
      format: "json",
      timespan: "24h",
      sort: "DateDesc",
    });

    const url = `${GDELT_BASE}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GDELT error: ${res.status}`);
    const data = await res.json();

    const articles = data.articles || [];
    return articles.map(normalizeGDELTArticle);
  } catch (err) {
    console.error("[GDELT] Fetch error:", err.message);
    return getMockGDELTSignals();
  }
}

/**
 * Fetch tone/sentiment timeline for a supply chain topic
 * Returns intensity score — higher = more negative/conflictual
 */
export async function fetchEventTone(query) {
  try {
    const params = new URLSearchParams({
      query: `${query} sourcelang:english`,
      mode: "ToneChart",
      format: "json",
      timespan: "7d",
    });

    const res = await fetch(`${GDELT_BASE}?${params.toString()}`);
    if (!res.ok) throw new Error(`GDELT tone error: ${res.status}`);
    const data = await res.json();

    // Return average tone (negative = more conflict, positive = more cooperative)
    const tones = (data.timeline || []).map(t => parseFloat(t.value || 0));
    const avgTone = tones.length ? tones.reduce((a, b) => a + b, 0) / tones.length : 0;

    return {
      averageTone: avgTone,
      toneLabel: avgTone < -5 ? "Critical" : avgTone < -2 ? "High" : avgTone < 0 ? "Medium" : "Low",
      data: data.timeline || [],
    };
  } catch (err) {
    console.error("[GDELT] Tone error:", err.message);
    return { averageTone: -6.2, toneLabel: "Critical", data: [] };
  }
}

function normalizeGDELTArticle(article) {
  return {
    id: `gdelt_${article.url?.slice(-20) || Math.random().toString(36).slice(2)}`,
    source: "gdelt",
    sourceCredibility: estimateGDELTCredibility(article.domain),
    title: article.title,
    url: article.url,
    publishedAt: article.seendate,
    tone: parseFloat(article.tone || 0),
    language: article.language,
    country: article.sourcecountry,
    signalStrength: Math.min(100, Math.abs(parseFloat(article.tone || 0)) * 10),
    rawText: article.title,
  };
}

function estimateGDELTCredibility(domain) {
  if (!domain) return 50;
  const high = ["reuters.com", "bloomberg.com", "ft.com", "apnews.com", "bbc.com"];
  const med = ["cnbc.com", "theguardian.com", "axios.com"];
  if (high.some(d => domain.includes(d))) return 90;
  if (med.some(d => domain.includes(d))) return 70;
  return 50;
}

export function getMockGDELTSignals() {
  return [
    {
      id: "gdelt_mock_1",
      source: "gdelt",
      sourceCredibility: 88,
      title: "Taiwan Military Drills Intensify Near Strait — Regional Shipping on Alert",
      url: "#",
      publishedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      tone: -8.4,
      language: "English",
      country: "United States",
      signalStrength: 84,
      rawText: "Taiwan military exercises regional conflict shipping freight disruption",
    },
  ];
}
