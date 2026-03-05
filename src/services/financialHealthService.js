// ─────────────────────────────────────────────────────────────────────────────
// services/financialHealthService.js
// Financial Modeling Prep via RapidAPI — Supplier financial health monitoring
// ─────────────────────────────────────────────────────────────────────────────

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const RAPIDAPI_HOST = "financial-modeling-prep.p.rapidapi.com";

const BASE_HEADERS = {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST,
};

/**
 * Get stock summary / financial health for a ticker
 * @param {string} ticker - e.g., "TSM", "BASFY", "GOOGL"
 * @returns {Promise<Object>} Financial health object
 */
export async function getSupplierFinancialHealth(ticker) {
    if (!RAPIDAPI_KEY || RAPIDAPI_KEY === "your_rapidapi_key_here") {
        console.warn("[FinancialHealth] API key not configured. Using mock data.");
        return getMockFinancialHealth(ticker);
    }

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        try {
            const url = `https://${RAPIDAPI_HOST}/api/v3/ratios/${ticker}`;
            const res = await fetch(url, { headers: BASE_HEADERS });

            if (res.status === 429 && attempt < MAX_RETRIES) {
                // Exponential backoff: 1s, 2s, 4s, etc.
                const delayStr = Math.pow(2, attempt) * 1000;
                console.warn(`[FinancialHealth] 429 Rate Limit hit for ${ticker}. Retrying in ${delayStr}ms (Attempt ${attempt + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, delayStr));
                attempt++;
                continue;
            }

            if (!res.ok) {
                // Silently fallback on 404 to avoid console spam for missing international tickers like 2317.TW
                if (res.status !== 404) {
                    console.warn(`[FinancialHealth] FMP API returned ${res.status} for ${ticker}`);
                }
                throw new Error(`Financial Modeling Prep error: ${res.status}`);
            }

            const data = await res.json();
            return normalizeFinancialData(ticker, data);
        } catch (err) {
            // Only fallback to mock data immediately if we caught an error or exhausted retries
            return getMockFinancialHealth(ticker);
        }
    }

    return getMockFinancialHealth(ticker);
}

/**
 * Get latest earnings data to detect earnings misses (keeps mock structure for now)
 */
export async function getEarningsData(ticker) {
    return getMockEarningsData(ticker);
}

function normalizeFinancialData(ticker, body) {
    if (!body || !Array.isArray(body) || body.length === 0) {
        return getMockFinancialHealth(ticker);
    }

    // The endpoint returns an array of yearly/quarterly ratios. We take the latest.
    const latest = body[0];

    const debtToEquity = latest.debtEquityRatio || 0;
    const currentRatio = latest.currentRatio || 0;
    const profitMargins = latest.netProfitMargin || 0;

    // Insolvency risk scoring
    let insolvencyRisk = 0;
    if (debtToEquity > 2) insolvencyRisk += 30;
    if (currentRatio < 1) insolvencyRisk += 25;
    if (profitMargins < 0) insolvencyRisk += 20;

    return {
        ticker,
        debtToEquity: Number(debtToEquity.toFixed(2)),
        currentRatio: Number(currentRatio.toFixed(2)),
        revenueGrowth: 0, // FMP ratios endpoint doesn't directly provide typical revenue percent growth in this model, using 0 for now
        profitMargins: Number(profitMargins.toFixed(2)) * 100,
        insolvencyRiskScore: Math.min(100, insolvencyRisk),
        insolvencyRiskLevel: insolvencyRisk > 60 ? "Critical" : insolvencyRisk > 35 ? "High" : insolvencyRisk > 15 ? "Medium" : "Low",
        targetMeanPrice: null,
        recommendation: "N/A",
    };
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
export function getMockFinancialHealth(ticker = "TSM") {
    return {
        ticker,
        debtToEquity: 0.48,
        currentRatio: 2.31,
        revenueGrowth: 12.4,
        profitMargins: 38.2,
        insolvencyRiskScore: 8,
        insolvencyRiskLevel: "Low",
        targetMeanPrice: 172.40,
        recommendation: "buy",
    };
}

export function getMockEarningsData(ticker = "TSM") {
    return {
        ticker,
        quarter: "4Q2024",
        actualEPS: 2.24,
        estimatedEPS: 2.18,
        missPercent: 2.75,
        isMiss: false,
        insolvencyRiskFlag: false,
    };
}
