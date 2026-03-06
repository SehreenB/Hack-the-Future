from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import root_agent, run_risk_analysis, ask_osiris
import os

app = FastAPI(title="NEXUS ADK Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class RiskAnalysisRequest(BaseModel):
    signal_title: str
    signal_description: str
    supplier_hint: str = ""
    region_hint: str = ""
    commodity_hint: str = ""
    manufacturer_profile: str
    false_positive_rate: int = 12

class AskRequest(BaseModel):
    question: str
    alertContext: str = "{}"
    manufacturerProfile: str = "{}"

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "agent": root_agent.name,
        "model": "gemini-2.0-flash",
        "adk": True,
        "vertex_ai": bool(os.getenv("AGENT_ENGINE_RESOURCE_ID")),
        "project": os.getenv("GOOGLE_CLOUD_PROJECT"),
        "tools": ["run_risk_analysis", "get_risk_score", "get_mitigation_playbook",
                  "get_maritime_warnings", "get_supplier_financial_health", "ask_osiris"]
    }

@app.post("/api/risk-analysis")
async def risk_analysis(req: RiskAnalysisRequest):
    result = run_risk_analysis(
        signal_title=req.signal_title,
        signal_description=req.signal_description,
        supplier_hint=req.supplier_hint,
        region_hint=req.region_hint,
        commodity_hint=req.commodity_hint,
        manufacturer_profile=req.manufacturer_profile,
        false_positive_rate=req.false_positive_rate
    )
    if result.get("_provider") == "error":
        raise HTTPException(status_code=500, detail="Both Gemini and Claude failed")
    return result

@app.post("/api/ask")
async def ask(req: AskRequest):
    result = ask_osiris(
        question=req.question,
        alert_context=req.alertContext,
        manufacturer_profile=req.manufacturerProfile
    )
    if result.get("provider") == "error":
        raise HTTPException(status_code=500, detail="Ask OSIRIS failed")
    return result