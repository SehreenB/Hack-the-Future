// ─────────────────────────────────────────────────────────────────────────────
// services/riskEngine.js
// Core AI engine — Claude powers: risk scoring, scenario simulation,
// playbook generation, critic pass, and email drafting
// ─────────────────────────────────────────────────────────────────────────────

import { MANUFACTURER_PROFILE } from "../data/manufacturerProfile";

const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const RISK_THRESHOLD = parseInt(import.meta.env.VITE_RISK_ESCALATION_THRESHOLD || "65");
const CONFIDENCE_THRESHOLD = parseInt(import.meta.env.VITE_CONFIDENCE_THRESHOLD || "70");
const FP_THRESHOLD = parseInt(import.meta.env.VITE_FALSE_POSITIVE_THRESHOLD || "20");

/**
 * Run the complete 11-step disruption analysis workflow via Claude
 * Returns a fully structured analysis result
 */
export async function analyzeDisruption({ signal, falsePositiveRate = 12, onProgress }) {
  if (!ANTHROPIC_KEY || ANTHROPIC_KEY === "your_anthropic_key_here") {
    console.warn("[RiskEngine] Anthropic API key not configured. Using mock analysis.");
    return getMockAnalysis(signal);
  }

  const progress = (step) => onProgress && onProgress(step);

  progress("SENSE: Normalizing signal schema...");

  const systemPrompt = buildSystemPrompt(falsePositiveRate);
  const userMessage = buildAnalysisPrompt(signal);

  progress("CLASSIFY: Matching against supplier registry...");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    progress("RISK SCORING: Computing revenue-at-risk...");

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    const rawText = data.content.map(b => b.text || "").join("");

    progress("SCENARIO: Running base/stress/shock simulations...");
    progress("PLAYBOOK: Generating ranked mitigations...");
    progress("CRITIC: Validating recommendations...");
    progress("ESCALATION: Evaluating governance thresholds...");

    const parsed = parseJSONResponse(rawText);
    if (!parsed) throw new Error("Failed to parse AI response");

    progress("COMPLETE");
    return { ...parsed, analysisTimestamp: new Date().toISOString() };

  } catch (err) {
    console.error("[RiskEngine] Analysis error:", err.message);
    progress("ERROR");
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(falsePositiveRate) {
  return `You are NEXUS, a Supply Disruption Decision-Support Co-Pilot. You are DETERMINISTIC, AUDIT-READY, and HALLUCINATION-RESISTANT.

MANUFACTURER PROFILE (your grounding context):
${JSON.stringify(MANUFACTURER_PROFILE, null, 2)}

GOVERNANCE CONSTRAINTS — NON-NEGOTIABLE:
- NEVER execute purchase orders
- NEVER send emails without approval flags (status must be "AWAITING_APPROVAL")  
- NEVER write to ERP systems
- NEVER offer financial hedging advice
- NEVER fabricate supplier names, lead times, pricing, or contract terms
- If data is unavailable: return exactly "Data not available in grounded context."

RISK FORMULA: Risk Score (0-100) = Probability × Impact Multiplier × Time Multiplier
Time Multiplier: 3 = <10 days buffer | 2 = 10-30 days | 1 = >30 days

ESCALATION RULE:
- Escalate ONLY if: Risk Score > ${RISK_THRESHOLD} AND Confidence Score > ${CONFIDENCE_THRESHOLD} AND False Positive Rate < ${FP_THRESHOLD}%
- Current False Positive Rate: ${falsePositiveRate}%

COST-OF-DELAY TIERS:
- Tier 1: <$50K | Tier 2: $50K–$250K | Tier 3: $250K–$1M | Tier 4: >$1M

PRINCIPAL-AGENT SAFEGUARDS:
- Objective function includes both stockout probability AND cash flow impact
- Mandatory critic pass: every playbook must include at least one alternative with trade-offs
- Alert threshold: confidence must exceed ${CONFIDENCE_THRESHOLD}% before escalation

OUTPUT: Respond ONLY with a single valid JSON object. No markdown fences, no preamble, no explanation outside the JSON.

JSON STRUCTURE:
{
  "sense": {
    "signalSummary": "string",
    "sourceCredibility": number,
    "signalStrength": number,
    "eventTone": "Critical|High|Medium|Low",
    "geopoliticalRisk": "High|Medium|Low",
    "frequencyDelta": "string"
  },
  "classify": {
    "supplierAffected": "string",
    "regionImpacted": "string",
    "commodityExposure": "string",
    "corridorRisk": "string",
    "historicalSimilarity": number,
    "bomIntersection": "string",
    "openPOsAffected": "string"
  },
  "probability": {
    "estimate": number,
    "rationale": "string",
    "eventSeverity": number,
    "historicalSimilarityScore": number,
    "sourceCredibilityWeight": number
  },
  "riskScore": {
    "score": number,
    "probability": number,
    "impactMultiplier": number,
    "timeMultiplier": number,
    "timeSensitivity": "Critical (<10d)|Moderate (10-30d)|Low (>30d)",
    "revenueAtRisk": "string",
    "dailyRevenueLoss": "string",
    "expectedDowntime": "string",
    "daysToStockout": number,
    "safetyStockCoverage": "string",
    "costOfDelayTier": number,
    "confidenceScore": number,
    "dataCompleteness": number,
    "costOfDelayEstimate": "string"
  },
  "scenarios": {
    "baseCase": { "delayDays": number, "additionalCost": "string", "revenueImpact": "string", "serviceLevel": "string" },
    "stressCase": { "delayDays": number, "additionalCost": "string", "revenueImpact": "string", "serviceLevel": "string", "note": "+20% delay / +15% cost" },
    "shockCase": { "delayDays": number, "additionalCost": "string", "revenueImpact": "string", "serviceLevel": "string", "note": "+50% delay / +40% cost" }
  },
  "playbook": [
    {
      "rank": number,
      "action": "Alternate Supplier|Expedite Freight|Inventory Reallocation|Production Resequencing|Demand Shaping",
      "description": "string",
      "estimatedCost": "string",
      "implementationTime": "string",
      "riskReduction": number,
      "feasibilityScore": number,
      "compositeScore": number,
      "tradeOff": "string",
      "cashFlowImpact": "string"
    }
  ],
  "criticPass": {
    "alternativeMitigationForced": "string",
    "costOverOptimizationRisk": "string",
    "cashFlowImpact": "string",
    "escalationValidity": "string",
    "overlookedRisks": "string"
  },
  "draftEmail": {
    "to": "string",
    "subject": "string",
    "body": "string",
    "status": "AWAITING_APPROVAL"
  },
  "erpFlag": {
    "action": "string",
    "system": "SAP S/4HANA|Oracle ERP|NetSuite|Generic ERP",
    "details": "string",
    "reorderPointChange": "string",
    "safetyStockRecommendation": "string",
    "status": "SIMULATED_ONLY"
  },
  "escalation": {
    "decision": true,
    "justification": "string",
    "alertChannel": "SMS + Dashboard",
    "stakeholders": ["Ops Lead", "Procurement", "CFO"],
    "thresholdsMet": {
      "riskScore": true,
      "confidence": true,
      "falsePositiveRate": true
    }
  },
  "reasoningTrace": ["string"]
}`;
}

function buildAnalysisPrompt(signal) {
  return `INCOMING DISRUPTION SIGNAL:
Title: ${signal.title || "Unknown"}
Description: ${signal.description || signal.rawText || "No description provided"}
Source Credibility: ${signal.sourceCredibility || "Unknown"}
Signal Strength: ${signal.signalStrength || "Unknown"}
Published: ${signal.publishedAt || "Unknown"}
Source: ${signal.source || "Unknown"}

Additional context:
- Supplier: ${signal.supplierHint || "Derive from signal context"}
- Region: ${signal.regionHint || "Derive from signal context"}
- Commodity: ${signal.commodityHint || "Derive from signal context"}

Run the complete NEXUS 11-step workflow:
SENSE → CLASSIFY → PROBABILITY → RISK SCORING → IMPACT MODELING → SCENARIO SIMULATION → PLAYBOOK → CRITIC PASS → DRAFT ACTIONS → ESCALATION DECISION → VERIFY & LOG

Ground all factual claims in the manufacturer profile provided. Use "Data not available in grounded context." for any data point not derivable from the signal or profile.

Generate realistic but clearly illustrative figures appropriate for a mid-market manufacturer demo.`;
}

function parseJSONResponse(text) {
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON between first { and last }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── MOCK ANALYSIS ────────────────────────────────────────────────────────────
export function getMockAnalysis(signal) {
  return {
    sense: { signalSummary: signal?.title || "Mock signal", sourceCredibility: 88, signalStrength: 85, eventTone: "Critical", geopoliticalRisk: "High", frequencyDelta: "+340% in 48h" },
    classify: { supplierAffected: "TSMC / Hon Hai", regionImpacted: "Taiwan / East Asia", commodityExposure: "Semiconductors / PCBs", corridorRisk: "Transpacific — High", historicalSimilarity: 72, bomIntersection: "SKU-4421, SKU-4422, SKU-5891 — 34% of active BOM", openPOsAffected: "PO-8821 ($1.2M), PO-8834 ($640K)" },
    probability: { estimate: 78, rationale: "Military exercises near Taiwan Strait with multiple carrier force majeures declared. Historical precedent from 2022 exercises shows 4-6 week corridor disruption.", eventSeverity: 88, historicalSimilarityScore: 72, sourceCredibilityWeight: 90 },
    riskScore: { score: 87, probability: 78, impactMultiplier: 4.2, timeMultiplier: 3, timeSensitivity: "Critical (<10d)", revenueAtRisk: "$4.2M", dailyRevenueLoss: "$280K", expectedDowntime: "15 days", daysToStockout: 8, safetyStockCoverage: "8 days", costOfDelayTier: 4, confidenceScore: 91, dataCompleteness: 84, costOfDelayEstimate: ">$1M" },
    scenarios: {
      baseCase: { delayDays: 14, additionalCost: "$85K", revenueImpact: "-$1.8M", serviceLevel: "72%" },
      stressCase: { delayDays: 17, additionalCost: "$98K", revenueImpact: "-$2.2M", serviceLevel: "61%", note: "+20% delay / +15% cost" },
      shockCase: { delayDays: 21, additionalCost: "$119K", revenueImpact: "-$3.1M", serviceLevel: "44%", note: "+50% delay / +40% cost" },
    },
    playbook: [
      { rank: 1, action: "Alternate Supplier", description: "Activate pre-qualified secondary supplier in South Korea (Samsung Foundry). Estimated 2-week ramp-up to 60% capacity.", estimatedCost: "$45K", implementationTime: "14 days", riskReduction: 68, feasibilityScore: 82, compositeScore: 88, tradeOff: "Higher per-unit cost (+12%), 2-week lead time gap. Recommend parallel tracking with Option 2.", cashFlowImpact: "-$45K immediate, neutral long-term" },
      { rank: 2, action: "Expedite Freight", description: "Switch critical SKUs (SKU-4421, SKU-4422) to air freight from existing Taiwan inventory. Covers 10-day gap.", estimatedCost: "$120K", implementationTime: "3 days", riskReduction: 55, feasibilityScore: 90, compositeScore: 82, tradeOff: "Highest immediate cost. Justified only for Tier 4 disruptions. Not sustainable beyond 3 weeks.", cashFlowImpact: "-$120K within 72h" },
      { rank: 3, action: "Inventory Reallocation", description: "Pull safety stock from Atlanta and Chicago distribution centers. Covers 5-day production gap while alternate sourcing activates.", estimatedCost: "$12K", implementationTime: "2 days", riskReduction: 40, feasibilityScore: 95, compositeScore: 76, tradeOff: "Depletes safety stock — increases vulnerability to secondary disruptions. Monitor DCs post-reallocation.", cashFlowImpact: "Minimal — uses existing assets" },
    ],
    criticPass: { alternativeMitigationForced: "Demand shaping considered: delay non-critical orders 3 weeks. Reduces revenue impact by $400K vs production stoppage.", costOverOptimizationRisk: "Option 2 (Air Freight) optimizes for service level but ignores $120K cash flow hit. Recommend combining Options 1+3 first.", cashFlowImpact: "Combined Options 1+3: $57K outflow vs $4.2M revenue at risk. Favorable ratio.", escalationValidity: "Escalation valid: Risk 87 > 65, Confidence 91% > 70%, FP Rate 12% < 20%. All thresholds met.", overlookedRisks: "Secondary risk: Samsung Foundry capacity may be constrained given industry-wide rerouting." },
    draftEmail: { to: "procurement@tsmc.com", subject: "[URGENT] Supply Continuity Review — Semiconductors — " + new Date().toLocaleDateString(), body: "Dear TSMC Procurement Team,\n\nWe are writing to formally request an urgent supply continuity review following disruption signals detected in the Taiwan Strait corridor.\n\nWe request confirmation of:\n1. Current production status and capacity\n2. Alternative routing or sourcing options\n3. Updated lead times under current conditions\n\nPlease respond within 24 hours.\n\nBest regards,\nOperations Team", status: "AWAITING_APPROVAL" },
    erpFlag: { action: "Raise safety stock threshold", system: "SAP S/4HANA", details: "Increase reorder point for SKU-4421 and SKU-4422 by 20% for 45 days pending disruption resolution.", reorderPointChange: "+20% for affected SKUs", safetyStockRecommendation: "Build 30-day buffer from alternate source within 21 days", status: "SIMULATED_ONLY" },
    escalation: { decision: true, justification: "All three escalation thresholds met. Revenue at risk exceeds $1M Tier 4 threshold. Ops Lead, Procurement Director, and CFO notified.", alertChannel: "SMS + Dashboard", stakeholders: ["Ops Lead", "Procurement", "CFO"], thresholdsMet: { riskScore: true, confidence: true, falsePositiveRate: true } },
    reasoningTrace: [
      "01 SENSE: Signal ingested from GNews. Source credibility: 88% (Reuters-sourced). Signal strength: 85%. Event tone: Critical (-8.4 GDELT score).",
      "02 CLASSIFY: Signal matched against supplier registry. TSMC and Hon Hai flagged as Tier-1 suppliers. BOM intersection: 34% of active production BOM affected.",
      "03 PROBABILITY: P(disruption) = 78%. Event severity (88) + historical similarity to 2022 Taiwan exercises (72) + source credibility (90) → weighted average 78%.",
      "04 RISK SCORE: 78 × 4.2 × 3 = normalized 87/100. Time multiplier = 3 (8 days to stockout < 10-day threshold).",
      "05 IMPACT MODEL: Revenue-at-Risk = $280K daily × 15 days = $4.2M. Open POs affected: PO-8821 + PO-8834 = $1.84M.",
      "06 SCENARIOS: Base (14d, $1.8M), Stress (+20%: 17d, $2.2M), Shock (+50%: 21d, $3.1M).",
      "07 PLAYBOOK: 3 options ranked by (Risk Reduction ÷ Cost) × Feasibility. Top: Alternate Supplier (composite 88).",
      "08 CRITIC: Forced demand-shaping alternative. Flagged air freight cash flow risk. Confirmed escalation validity.",
      "09 DRAFT: Supplier email drafted for TSMC procurement. Status: AWAITING_APPROVAL. ERP flag simulated only.",
      "10 ESCALATION: Risk 87 > 65 ✓, Confidence 91% > 70% ✓, FP Rate 12% < 20% ✓. Escalation triggered to SMS + Dashboard.",
      "11 LOG: Analysis logged to audit trail. Memory store updated.",
    ],
    analysisTimestamp: new Date().toISOString(),
  };
}
