// ─────────────────────────────────────────────────────────────────────────────
// services/gnewsService.js
// GNews API — Primary news signal ingestion layer
// Polls every 15 minutes when demo_active = true
// ─────────────────────────────────────────────────────────────────────────────

const GNEWS_BASE = "https://gnews.io/api/v4";
const API_KEY = import.meta.env.VITE_GNEWS_API_KEY;

// Keywords derived from manufacturer profile
// These get dynamically injected from the loaded supplier registry
const DEFAULT_KEYWORDS = [
  "supply chain disruption",
  "semiconductor shortage",
  "shipping lane closure",
  "port congestion",
  "trade sanctions",
  "factory explosion",
  "freight spike",
  "logistics delay",
  "force majeure",
  "supplier bankruptcy",
];

/**
 * Fetch news signals relevant to a set of keywords/suppliers.
 * @param {string[]} keywords - Dynamic keywords from manufacturer profile
 * @param {number} maxResults - Max articles to return (default 10)
 * @returns {Promise<Array>} Normalized signal objects
 */
export async function fetchNewsSignals(keywords = DEFAULT_KEYWORDS, maxResults = 10) {
  if (!API_KEY || API_KEY === "your_gnews_key_here") {
    console.warn("[GNews] API key not configured. Using mock data.");
    return getMockNewsSignals();
  }

  const query = keywords.slice(0, 5).join(" OR ");

  try {
    const url = `${GNEWS_BASE}/search?q=${encodeURIComponent(query)}&lang=en&max=${maxResults}&token=${API_KEY}&sortby=publishedAt`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GNews API error: ${res.status}`);
    const data = await res.json();

    return (data.articles || []).map(normalizeNewsArticle);
  } catch (err) {
    console.error("[GNews] Fetch error:", err.message);
    return getMockNewsSignals();
  }
}

/**
 * Normalize a raw GNews article into our internal signal schema
 */
function normalizeNewsArticle(article) {
  return {
    id: `gnews_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    source: "gnews",
    sourceCredibility: estimateSourceCredibility(article.source?.name),
    title: article.title,
    description: article.description,
    url: article.url,
    publishedAt: article.publishedAt,
    signalStrength: 0, // Set by classifier
    relevanceScore: 0, // Set by classifier
    rawText: `${article.title}. ${article.description}`,
  };
}

function estimateSourceCredibility(sourceName) {
  const highCredibility = ["Reuters", "Bloomberg", "Financial Times", "Wall Street Journal", "AP News", "BBC"];
  const medCredibility = ["CNBC", "Forbes", "The Guardian", "Axios", "Politico"];
  if (!sourceName) return 50;
  if (highCredibility.some(s => sourceName.includes(s))) return 90;
  if (medCredibility.some(s => sourceName.includes(s))) return 70;
  return 50;
}

// ─── MOCK DATA (used when API key not set) ────────────────────────────────────
export function getMockNewsSignals() {
  return [
    {
      id: "mock_1",
      source: "gnews",
      sourceCredibility: 90,
      title: "Escalating Military Tensions Near Taiwan Strait Force Shipping Reroutes",
      description: "Major carriers including Maersk and Evergreen have begun diverting transpacific routes following naval exercises near the Taiwan Strait. Spot rates on Asia-US West Coast lanes have spiked 340% in 48 hours.",
      url: "#",
      publishedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      signalStrength: 92,
      relevanceScore: 88,
      rawText: "Taiwan Strait military exercises shipping disruption semiconductor supply chain force majeure Maersk Evergreen rerouting",
    },
    {
      id: "mock_2",
      source: "gnews",
      sourceCredibility: 85,
      title: "Houthi Attacks Force Red Sea Lane Closure — Suez Throughput Down 42%",
      description: "Continued Houthi missile attacks on commercial vessels have prompted CMA CGM, MSC, and Hapag-Lloyd to suspend Red Sea transit. Cape of Good Hope rerouting adds 14 days and $85K per voyage.",
      url: "#",
      publishedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      signalStrength: 88,
      relevanceScore: 82,
      rawText: "Red Sea Houthi attack shipping freight spike reroute Cape of Good Hope Suez Canal closure",
    },
    {
      id: "mock_3",
      source: "gnews",
      sourceCredibility: 78,
      title: "BASF Freeport Chemical Plant Explosion Halts Specialty Polymer Output",
      description: "An explosion at BASF's Freeport, TX facility has halted production of specialty polymer resins. The plant accounts for approximately 18% of North American specialty polymer capacity. EPA emergency declaration issued.",
      url: "#",
      publishedAt: new Date(Date.now() - 1000 * 60 * 68).toISOString(),
      signalStrength: 74,
      relevanceScore: 71,
      rawText: "BASF explosion chemical plant polymer resin shortage supply disruption North America",
    },
  ];
}
