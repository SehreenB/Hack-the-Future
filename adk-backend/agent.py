import os
import json
import httpx
from google.adk.agents import Agent


def run_risk_analysis(
    signal_title: str,
    signal_description: str,
    supplier_hint: str,
    region_hint: str,
    commodity_hint: str,
    manufacturer_profile: str,
    false_positive_rate: int = 12
) -> dict:
    """
    Run the complete 11-step OSIRIS supply chain disruption analysis.
    Returns a fully structured JSON analysis result.
    """
    profile = json.loads(manufacturer_profile) if isinstance(manufacturer_profile, str) else manufacturer_profile

    system_prompt = f"""You are OSIRIS, a Supply Disruption Decision-Support Co-Pilot.

MANUFACTURER PROFILE:
{json.dumps(profile, indent=2)}

GOVERNANCE CONSTRAINTS:
- NEVER execute purchase orders
- NEVER send emails without status "AWAITING_APPROVAL"
- NEVER fabricate supplier names, lead times, or pricing

RISK FORMULA: Risk Score (0-100) = Probability x Impact Multiplier x Time Multiplier
Time Multiplier: 3 = <10 days | 2 = 10-30 days | 1 = >30 days

ESCALATION: Only if Risk Score > 65 AND Confidence > 70 AND False Positive Rate < 20%
Current False Positive Rate: {false_positive_rate}%

COST TIERS: Tier 1 <$50K | Tier 2 $50K-$250K | Tier 3 $250K-$1M | Tier 4 >$1M

OUTPUT: Respond ONLY with valid JSON. No markdown, no preamble. CRITICAL: scenarios.baseCase, scenarios.stressCase, and scenarios.shockCase MUST all be fully populated with delayDays, additionalCost, revenueImpact, and serviceLevel. Never leave scenarios empty.
{{
  "sense": {{"signalSummary": "string", "sourceCredibility": 88, "signalStrength": 85, "eventTone": "Critical", "geopoliticalRisk": "High", "frequencyDelta": "string"}},
  "classify": {{"supplierAffected": "string", "regionImpacted": "string", "commodityExposure": "string", "corridorRisk": "string", "historicalSimilarity": 72, "bomIntersection": "string", "openPOsAffected": "string"}},
  "probability": {{"estimate": 78, "rationale": "string", "eventSeverity": 88, "historicalSimilarityScore": 72, "sourceCredibilityWeight": 90}},
  "riskScore": {{"score": 87, "probability": 78, "impactMultiplier": 4.2, "timeMultiplier": 3, "timeSensitivity": "Critical (<10d)", "revenueAtRisk": "string", "dailyRevenueLoss": "string", "expectedDowntime": "string", "daysToStockout": 8, "safetyStockCoverage": "string", "costOfDelayTier": 4, "confidenceScore": 91, "dataCompleteness": 84, "costOfDelayEstimate": "string"}},
  "scenarios": {{
    "baseCase": {{"delayDays": 14, "additionalCost": "$85K", "revenueImpact": "-$1.8M", "serviceLevel": "72%"}},
    "stressCase": {{"delayDays": 17, "additionalCost": "$98K", "revenueImpact": "-$2.2M", "serviceLevel": "61%", "note": "+20% delay / +15% cost"}},
    "shockCase": {{"delayDays": 21, "additionalCost": "$119K", "revenueImpact": "-$3.1M", "serviceLevel": "44%", "note": "+50% delay / +40% cost"}}
  }},
  "playbook": [{{"rank": 1, "action": "string", "description": "string", "estimatedCost": "string", "implementationTime": "string", "riskReduction": 68, "feasibilityScore": 82, "compositeScore": 88, "tradeOff": "string", "cashFlowImpact": "string"}}],
  "criticPass": {{"alternativeMitigationForced": "string", "costOverOptimizationRisk": "string", "cashFlowImpact": "string", "escalationValidity": "string", "overlookedRisks": "string"}},
  "draftEmail": {{"to": "string", "subject": "string", "body": "string", "status": "AWAITING_APPROVAL"}},
  "erpFlag": {{"action": "string", "system": "SAP S/4HANA", "details": "string", "reorderPointChange": "string", "safetyStockRecommendation": "string", "status": "SIMULATED_ONLY"}},
  "escalation": {{"decision": true, "justification": "string", "alertChannel": "SMS + Dashboard", "stakeholders": ["Ops Lead", "Procurement", "CFO"], "thresholdsMet": {{"riskScore": true, "confidence": true, "falsePositiveRate": true}}}},
  "reasoningTrace": ["01 SENSE: ...", "02 CLASSIFY: ...", "03 PROBABILITY: ...", "04 RISK SCORE: ...", "05 IMPACT: ...", "06 SCENARIOS: ...", "07 PLAYBOOK: ...", "08 CRITIC: ...", "09 DRAFT: ...", "10 ESCALATION: ...", "11 LOG: ..."]
}}"""

    user_message = f"""DISRUPTION SIGNAL:
Title: {signal_title}
Description: {signal_description}
Supplier: {supplier_hint}
Region: {region_hint}
Commodity: {commodity_hint}

Run the full 11-step OSIRIS workflow. Ground all claims in the manufacturer profile."""

    gemini_key = os.getenv("GOOGLE_API_KEY")
    print(f"[ADK DEBUG] Gemini key present: {bool(gemini_key)}")

    if gemini_key:
        try:
            response = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}",
                json={
                    "contents": [{"parts": [{"text": system_prompt + "\n\n" + user_message}]}],
                    "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
                },
                timeout=40.0
            )
            print(f"[ADK DEBUG] Gemini HTTP status: {response.status_code}")
            if response.status_code != 200:
                print(f"[ADK DEBUG] Gemini error: {response.text[:300]}")
            if response.status_code == 200:
                data = response.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                result = json.loads(text)
                result["_provider"] = "gemini"
                result["_powered_by"] = "Google ADK + Vertex AI + Gemini 2.0 Flash"
                return result
        except Exception as e:
            print(f"[ADK] Gemini failed: {e}")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            response = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": anthropic_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 4000,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}]
                },
                timeout=40.0
            )
            if response.status_code == 200:
                data = response.json()
                text = data["content"][0]["text"]
                clean = text.replace("```json", "").replace("```", "").strip()
                result = json.loads(clean)
                result["_provider"] = "claude"
                result["_powered_by"] = "Claude (ADK Fallback)"
                return result
        except Exception as e:
            print(f"[ADK] Claude failed: {e}")

    return {"error": "Both providers failed", "_provider": "error"}


def get_risk_score(supplier: str, region: str, commodity: str, days_to_stockout: int) -> dict:
    """Calculate disruption risk score for a supplier/region/commodity combination."""
    base_score = 60
    geo_multipliers = {
        "taiwan": 30, "red sea": 20, "ukraine": 25,
        "china": 15, "middle east": 18, "suez": 22
    }
    for key, val in geo_multipliers.items():
        if key in region.lower():
            base_score += val
            break
    time_mult = 3 if days_to_stockout < 10 else (2 if days_to_stockout < 30 else 1)
    score = min(100, int(base_score * (time_mult / 2)))
    return {
        "risk_score": score,
        "confidence": 85,
        "time_sensitivity": "Critical" if days_to_stockout < 10 else "Moderate",
        "geopolitical_multiplier": time_mult,
        "supplier": supplier,
        "region": region,
        "commodity": commodity
    }


def get_mitigation_playbook(supplier: str, commodity: str, risk_score: int, manufacturer_profile: str) -> dict:
    """Get ranked mitigation options for a disruption."""
    options = [
        {"rank": 1, "action": "Alternate Supplier", "cost": "$45K", "time": "14 days", "risk_reduction": 68, "feasibility": 82, "composite_score": 88, "trade_off": "Higher per-unit cost +12%, 2-week gap"},
        {"rank": 2, "action": "Expedite Freight", "cost": "$120K", "time": "3 days", "risk_reduction": 55, "feasibility": 90, "composite_score": 82, "trade_off": "Highest cost, not sustainable beyond 3 weeks"},
        {"rank": 3, "action": "Inventory Reallocation", "cost": "$12K", "time": "2 days", "risk_reduction": 40, "feasibility": 95, "composite_score": 76, "trade_off": "Depletes safety stock, increases secondary risk"}
    ]
    return {"supplier": supplier, "commodity": commodity, "risk_score": risk_score, "options": options}


def get_maritime_warnings(corridor: str) -> dict:
    """Get active maritime warnings for a shipping corridor."""
    data = {
        "red sea": {"warnings": 47, "severity": "Critical", "routes": ["Suez Canal", "Bab el-Mandeb"], "rerouting_cost": "$180K per voyage"},
        "taiwan strait": {"warnings": 12, "severity": "High", "routes": ["Transpacific", "East Asia"], "rerouting_cost": "$45K per voyage"},
        "suez canal": {"warnings": 38, "severity": "Critical", "routes": ["Europe-Asia", "Med-Indian Ocean"], "rerouting_cost": "$160K per voyage"},
        "panama canal": {"warnings": 8, "severity": "Medium", "routes": ["Americas", "Transpacific"], "rerouting_cost": "$25K per voyage"},
    }
    key = corridor.lower()
    for k, v in data.items():
        if k in key or key in k:
            return {"corridor": corridor, **v}
    return {"corridor": corridor, "warnings": 5, "severity": "Low", "routes": [], "rerouting_cost": "Unknown"}


def get_supplier_financial_health(supplier_name: str) -> dict:
    """Get financial health assessment for a supplier."""
    profiles = {
        "tsmc": {"insolvency_risk": 8, "debt_to_equity": 0.3, "current_ratio": 2.1, "credit_rating": "AA", "assessment": "Financially stable, low insolvency risk"},
        "hon hai": {"insolvency_risk": 15, "debt_to_equity": 0.8, "current_ratio": 1.4, "credit_rating": "A", "assessment": "Stable with moderate leverage"},
        "basf": {"insolvency_risk": 22, "debt_to_equity": 1.1, "current_ratio": 1.2, "credit_rating": "BBB+", "assessment": "Adequate but monitor debt levels"},
        "maersk": {"insolvency_risk": 12, "debt_to_equity": 0.5, "current_ratio": 1.8, "credit_rating": "A-", "assessment": "Strong liquidity position"},
    }
    key = supplier_name.lower()
    for k, v in profiles.items():
        if k in key or key in k:
            return {"supplier": supplier_name, **v}
    return {"supplier": supplier_name, "insolvency_risk": 30, "credit_rating": "BBB", "assessment": "No profile available — treat as moderate risk"}


def ask_osiris(question: str, alert_context: str, manufacturer_profile: str) -> dict:
    """Answer a specific question about a supply chain disruption grounded in alert data."""
    gemini_key = os.getenv("GOOGLE_API_KEY")
    prompt = f"""You are OSIRIS, an AI supply chain operations advisor.

Alert Context: {alert_context}
Manufacturer Profile: {manufacturer_profile}

Question: {question}

Answer in 3-5 sentences. Be specific and cite exact figures from the alert context."""

    if gemini_key:
        try:
            response = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}",
                json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3}},
                timeout=20.0
            )
            if response.status_code == 200:
                data = response.json()
                return {"answer": data["candidates"][0]["content"]["parts"][0]["text"], "provider": "gemini"}
        except Exception as e:
            print(f"[ADK] ask_osiris failed: {e}")
    return {"answer": "Unable to process question at this time.", "provider": "error"}


root_agent = Agent(
    model="gemini-2.5-flash",
    name="nexus_supply_chain_agent",
    description="NEXUS — Autonomous Supply Chain Resilience Agent powered by Google ADK",
    instruction="""You are NEXUS, an autonomous supply chain resilience agent.
Use the most relevant tool for each request.
Ground all responses in the manufacturer profile and alert data provided.""",
    tools=[
        run_risk_analysis,
        get_risk_score,
        get_mitigation_playbook,
        get_maritime_warnings,
        get_supplier_financial_health,
        ask_osiris
    ]
)
