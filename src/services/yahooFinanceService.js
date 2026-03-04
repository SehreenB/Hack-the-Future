// ─────────────────────────────────────────────────────────────────────────────
// services/yahooFinanceService.js
// Yahoo Finance via RapidAPI — Supplier financial health monitoring
// Triggers insolvency risk scoring on: EPS miss + declining revenue + high debt
// ─────────────────────────────────────────────────────────────────────────────

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const RAPIDAPI_HOST = "yahoo-finance15.p.rapidapi.com";

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
    console.warn("[YahooFinance] API key not configured. Using mock data.");
    return getMockFinancialHealth(ticker);
  }

  try {
    const url = `https://${RAPIDAPI_HOST}/api/v1/markets/stock/modules?ticker=${ticker}&module=financial-data,default-key-statistics`;
    const res = await fetch(url, { headers: BASE_HEADERS });
    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
    const data = await res.json();

    return normalizeFinancialData(ticker, data?.body);
  } catch (err) {
    console.error("[YahooFinance] Error:", err.message);
    return getMockFinancialHealth(ticker);
  }
}

/**
 * Get latest earnings data to detect earnings misses
 */
export async function getEarningsData(ticker) {
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === "your_rapidapi_key_here") {
    return getMockEarningsData(ticker);
  }

  try {
    const url = `https://${RAPIDAPI_HOST}/api/v1/markets/stock/modules?ticker=${ticker}&module=earnings`;
    const res = await fetch(url, { headers: BASE_HEADERS });
    if (!res.ok) throw new Error(`Earnings error: ${res.status}`);
    const data = await res.json();

    const earnings = data?.body?.earnings;
    if (!earnings) return null;

    const latest = earnings.earningsChart?.quarterly?.[0];
    if (!latest) return null;

    const actual = latest.actual?.raw || 0;
    const estimate = latest.estimate?.raw || 0;
    const miss = estimate > 0 ? ((actual - estimate) / estimate) * 100 : 0;

    return {
      ticker,
      quarter: latest.date,
      actualEPS: actual,
      estimatedEPS: estimate,
      missPercent: miss,
      isMiss: miss < -5,
      insolvencyRiskFlag: miss < -15,
    };
  } catch (err) {
    console.error("[YahooFinance] Earnings error:", err.message);
    return getMockEarningsData(ticker);
  }
}

function normalizeFinancialData(ticker, body) {
  if (!body) return getMockFinancialHealth(ticker);

  const fd = body["financial-data"] || {};
  const ks = body["default-key-statistics"] || {};

  const debtToEquity = fd.debtToEquity?.raw || 0;
  const currentRatio = fd.currentRatio?.raw || 0;
  const revenueGrowth = fd.revenueGrowth?.raw || 0;
  const profitMargins = fd.profitMargins?.raw || 0;

  // Insolvency risk scoring
  let insolvencyRisk = 0;
  if (debtToEquity > 2) insolvencyRisk += 30;
  if (currentRatio < 1) insolvencyRisk += 25;
  if (revenueGrowth < -0.1) insolvencyRisk += 25;
  if (profitMargins < 0) insolvencyRisk += 20;

  return {
    ticker,
    debtToEquity,
    currentRatio,
    revenueGrowth: revenueGrowth * 100,
    profitMargins: profitMargins * 100,
    insolvencyRiskScore: Math.min(100, insolvencyRisk),
    insolvencyRiskLevel: insolvencyRisk > 60 ? "Critical" : insolvencyRisk > 35 ? "High" : insolvencyRisk > 15 ? "Medium" : "Low",
    targetMeanPrice: fd.targetMeanPrice?.raw || null,
    recommendation: fd.recommendationKey || "N/A",
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
