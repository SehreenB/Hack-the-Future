import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getDisruptionHistory, subscribeToDisruptions, getSuppliers, writeAuditLog, getAuditLogs } from "./src/services/supabaseService";
import { getSupplierFinancialHealth } from "./src/services/financialHealthService";
import { getMaritimeWarnings } from "./src/services/maritimeIntelService";
import { getSituationForecast } from "./src/services/llmForecastService";
import Map, { Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C = {
  brand: "#f59e0b",
  brandLight: "rgba(245, 158, 11, 0.1)",
  brandMid: "#d97706",
  accent: "#b45309",
  critical: "#DC2626",
  criticalLight: "rgba(220, 38, 38, 0.1)",
  criticalBorder: "#DC2626",
  high: "#F97316",
  highLight: "rgba(249, 115, 22, 0.1)",
  highBorder: "#F97316",
  medium: "#F59E0B",
  mediumLight: "rgba(245, 158, 11, 0.1)",
  mediumBorder: "#F59E0B",
  success: "#10B981",
  successLight: "rgba(16, 185, 129, 0.1)",
  text: "#f4f4f5",
  textMid: "#d4d4d8",
  textLight: "#a1a1aa",
  border: "rgba(255,255,255,0.1)",
  bg: "#0a0a0a",
  card: "rgba(255, 255, 255, 0.05)",
  sidebar: "#0a0a0a",
  sidebarHover: "rgba(255,255,255,0.05)",
  sidebarActive: "rgba(245, 158, 11, 0.1)",
};

// ─── DATA ─────────────────────────────────────────────────────────────────────
const MANUFACTURER = {
  name: "NorthStar Electronics",
  industry: "Electronics Manufacturing",
  dailyRevenue: "$389K",
  sites: ["Toronto, ON", "Detroit, MI", "Austin, TX"],
  logisticsCorridors: ["Taiwan Strait", "Red Sea", "Trans-Pacific"],
  geopoliticalRisks: { Taiwan: 30, China: 25, Japan: 10, Mexico: 15, USA: 5 },
  escalationContacts: [
    { role: "Ops Lead", name: "Sarah Chen", phone: "+1-416-555-0142" },
    { role: "Procurement Director", name: "Marcus Johnson", phone: "+1-416-555-0198" },
    { role: "CFO", name: "Dr. Aisha Patel", phone: "+1-416-555-0201" },
  ],
};

const ACTIVE_ALERTS = [
  {
    id: "NXS-001", severity: "critical", riskScore: 87, confidenceScore: 91,
    title: "Taiwan Strait Corridor Closure",
    supplier: "TSMC / Hon Hai", region: "Taiwan / East Asia", commodity: "Semiconductors",
    revenueAtRisk: "$4.2M", costOfDelayTier: 4, daysToStockout: 8, detectedAt: "2 min ago",
    escalate: true,
    summary: "Escalating military activity near the Taiwan Strait has triggered force majeure declarations across 3 Tier-1 semiconductor suppliers. Freightos spot rates on transpacific lanes are up 340% in 48 hours. Critical SKUs SKU-4421 and SKU-4422 have only 8 days of safety stock remaining.",
    openPOs: "PO-8821 ($1.2M), PO-8834 ($640K)",
    bomImpact: "SKU-4421, SKU-4422 — 34% of active BOM",
  },
  {
    id: "NXS-002", severity: "high", riskScore: 72, confidenceScore: 84,
    title: "Red Sea Rerouting — Transit +14 Days",
    supplier: "Multiple EU Suppliers", region: "Suez Corridor", commodity: "Automotive Parts",
    revenueAtRisk: "$1.8M", costOfDelayTier: 3, daysToStockout: 18, detectedAt: "18 min ago",
    escalate: true,
    summary: "Houthi attacks have forced Maersk, MSC, and CMA CGM to suspend Red Sea transit. Cape of Good Hope rerouting adds 14 days and $85K per voyage. Cumulative freight premium estimated at $340K for open POs.",
    openPOs: "PO-8842 ($890K)",
    bomImpact: "SKU-5891 — 18% of active BOM",
  },
  {
    id: "NXS-003", severity: "medium", riskScore: 54, confidenceScore: 76,
    title: "BASF Freeport Plant Explosion",
    supplier: "BASF Corporation", region: "Gulf Coast, USA", commodity: "Specialty Polymers",
    revenueAtRisk: "$620K", costOfDelayTier: 3, daysToStockout: 18, detectedAt: "1 hr ago",
    escalate: false,
    summary: "Explosion at BASF's Freeport, TX facility halted specialty polymer resin production. Plant supplies ~18% of North American polymer capacity. SKU-3310 (Polymer Housing) has 18 days safety stock — adequate buffer while alternate sourcing activates.",
    openPOs: "None in transit",
    bomImpact: "SKU-3310 — 12% of active BOM",
  },
];

const SEV_CFG = {
  critical: { bg: C.criticalLight, border: C.criticalBorder, color: C.critical, label: "Critical", dot: "#DC2626" },
  high: { bg: C.highLight, border: C.highBorder, color: C.high, label: "High", dot: "#EA580C" },
  medium: { bg: C.mediumLight, border: C.mediumBorder, color: C.medium, label: "Medium", dot: "#CA8A04" },
};

const PLAYBOOK = [
  { rank: 1, action: "Activate Alternate Supplier", description: "Engage Samsung Foundry (pre-qualified) for SKU-4421 and SKU-4422. 2-week ramp to 60% capacity.", cost: "$45K", time: "14 days", reduction: 68, feasibility: 82, composite: 88, tradeOff: "+12% unit cost. 2-week gap — bridge with Option 3.", cashFlow: "-$45K immediate" },
  { rank: 2, action: "Expedite Air Freight", description: "Air freight critical SKUs from existing Taiwan inventory. Covers 10-day production gap.", cost: "$120K", time: "3 days", reduction: 55, feasibility: 90, composite: 81, tradeOff: "Highest immediate cost. Sustainable only for Tier 4 events.", cashFlow: "-$120K within 72h" },
  { rank: 3, action: "Inventory Reallocation", description: "Pull safety stock from Atlanta and Chicago DCs. Bridges 5-day gap while Option 1 activates.", cost: "$12K", time: "2 days", reduction: 40, feasibility: 95, composite: 76, tradeOff: "Depletes DC buffers — increases secondary disruption vulnerability.", cashFlow: "Minimal — existing assets" },
];

const AUDIT_LOG_MOCK = [
  { id: "NXS-001", ts: "10:42 AM", supplier: "TSMC / Hon Hai", region: "Taiwan", risk: 87, confidence: 91, tier: 4, escalated: true },
  { id: "NXS-002", ts: "10:26 AM", supplier: "Multiple EU", region: "Suez", risk: 72, confidence: 84, tier: 3, escalated: true },
  { id: "NXS-003", ts: "09:44 AM", supplier: "BASF Corp", region: "Gulf Coast", risk: 54, confidence: 76, tier: 3, escalated: false },
];

const SUPPLIER_MAP_PINS = [
  { id: "SUP-001", name: "TSMC", lat: 24.15, lng: 120.67, risk: 87, commodity: "Semiconductors", status: "critical" },
  { id: "SUP-002", name: "Hon Hai", lat: 22.32, lng: 114.17, risk: 82, commodity: "PCB Assembly", status: "critical" },
  { id: "SUP-003", name: "BASF", lat: 28.98, lng: -95.37, risk: 54, commodity: "Polymers", status: "medium" },
  { id: "SUP-004", name: "Murata", lat: 35.01, lng: 135.77, risk: 28, commodity: "Passives", status: "low" },
  { id: "SUP-005", name: "Flex Ltd", lat: 20.66, lng: -103.35, risk: 22, commodity: "Assembly", status: "low" },

  // Simulated WorldMonitor Global Impacts
  { id: "IMP-001", name: "Sahel Insurgency", lat: 14.0, lng: -1.0, risk: 85, commodity: "Minerals", status: "critical" },
  { id: "IMP-002", name: "Haiti Crisis", lat: 18.5, lng: -72.3, risk: 78, commodity: "Logistics", status: "high" },
  { id: "IMP-003", name: "Horn of Africa", lat: 10.0, lng: 49.0, risk: 92, commodity: "Shipping", status: "critical" },
  { id: "IMP-004", name: "DC Intel", lat: 38.9, lng: -77.0, risk: 45, commodity: "Data", status: "medium" },
  { id: "IMP-005", name: "Silicon Valley", lat: 37.4, lng: -122.1, risk: 36, commodity: "AI / Tech", status: "medium" },
  { id: "IMP-006", name: "Wall Street", lat: 40.7, lng: -74.0, risk: 32, commodity: "Finance", status: "medium" },
  { id: "IMP-007", name: "Houston Energy", lat: 29.76, lng: -95.37, risk: 40, commodity: "Oil & Gas", status: "medium" },
  { id: "IMP-008", name: "Kremlin Activity", lat: 55.75, lng: 37.6, risk: 88, commodity: "Geopolitics", status: "critical" },
  { id: "IMP-009", name: "Beijing PLA", lat: 39.9, lng: 116.4, risk: 80, commodity: "Geopolitics", status: "critical" },
  { id: "IMP-010", name: "Ukraine War", lat: 50.45, lng: 30.5, risk: 95, commodity: "Agriculture/Energy", status: "critical" },
  { id: "IMP-011", name: "Taipei Tensions", lat: 25.03, lng: 121.5, risk: 75, commodity: "Semiconductors", status: "high" },
  { id: "IMP-012", name: "Tehran IRGC", lat: 35.7, lng: 51.4, risk: 82, commodity: "Oil/Logistics", status: "critical" },
  { id: "IMP-013", name: "Tel Aviv Conflict", lat: 32.1, lng: 34.8, risk: 90, commodity: "Defense/Tech", status: "critical" },
  { id: "IMP-014", name: "Pyongyang Tests", lat: 39.0, lng: 125.75, risk: 70, commodity: "Geopolitics", status: "high" },
  { id: "IMP-015", name: "London GCHQ", lat: 51.5, lng: -0.12, risk: 20, commodity: "Intel", status: "low" },
  { id: "IMP-016", name: "Brussels NATO", lat: 50.85, lng: 4.35, risk: 25, commodity: "Defense", status: "low" },
  { id: "IMP-017", name: "Caracas Crisis", lat: 10.5, lng: -66.9, risk: 65, commodity: "Oil", status: "high" },
  { id: "IMP-018", name: "Mexico Cartels", lat: 23.6, lng: -102.5, risk: 78, commodity: "Manufacturing", status: "high" },
  { id: "IMP-019", name: "Strait of Hormuz", lat: 26.2, lng: 56.5, risk: 96, commodity: "Oil Transit", status: "critical" },
  { id: "IMP-020", name: "Gaza Blockade", lat: 31.5, lng: 34.5, risk: 93, commodity: "Humanitarian", status: "critical" },
  { id: "IMP-021", name: "South Lebanon", lat: 33.2, lng: 35.4, risk: 85, commodity: "Logistics", status: "critical" },
  { id: "IMP-022", name: "Red Sea Crisis", lat: 14.0, lng: 43.0, risk: 94, commodity: "Global Shipping", status: "critical" },
  { id: "IMP-023", name: "Sudan Civil War", lat: 15.0, lng: 32.0, risk: 89, commodity: "Logistics", status: "critical" },
  { id: "IMP-024", name: "Myanmar Conflict", lat: 20.0, lng: 96.5, risk: 76, commodity: "Manufacturing", status: "high" },
  { id: "IMP-025", name: "Malacca Strait", lat: 2.5, lng: 101.5, risk: 45, commodity: "Shipping", status: "medium" },
  { id: "IMP-026", name: "Bosphorus Strait", lat: 41.1, lng: 29.0, risk: 38, commodity: "Shipping", status: "medium" },
  { id: "IMP-027", name: "Suez Canal", lat: 30.5, lng: 32.3, risk: 55, commodity: "Shipping", status: "medium" },
  { id: "IMP-028", name: "Panama Canal Drought", lat: 9.1, lng: -79.7, risk: 65, commodity: "Shipping", status: "high" },
  { id: "IMP-029", name: "Bab el-Mandeb", lat: 12.5, lng: 43.3, risk: 90, commodity: "Shipping", status: "critical" }
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getRiskColor(score) {
  if (score >= 75) return C.critical;
  if (score >= 50) return C.high;
  if (score >= 30) return C.medium;
  return C.success;
}
function getTierLabel(t) { return { 1: "<$50K", 2: "$50K–$250K", 3: "$250K–$1M", 4: ">$1M" }[t] || "—"; }

function getCountryFlag(country) {
  const flags = { "Taiwan": "🇹🇼", "China": "🇨🇳", "Japan": "🇯🇵", "Mexico": "🇲🇽", "USA": "🇺🇸" };
  return flags[country] || "🌐";
}

// ─── RISK GAUGE ───────────────────────────────────────────────────────────────
function RiskGauge({ score, size = 100 }) {
  const color = getRiskColor(score);
  const r = 36; const cx = 50; const cy = 50;
  const circ = Math.PI * r;
  const pct = (score / 100) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 100 60" style={{ width: size }}>
        <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`} fill="none" stroke="#E2E8F0" strokeWidth="9" strokeLinecap="round" />
        <path d={`M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${pct} ${circ}`} style={{ transition: "stroke-dasharray 0.8s ease" }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize="17" fontWeight="800" fontFamily="'Sora',sans-serif">{score}</text>
      </svg>
      <div style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans',sans-serif", marginTop: -4 }}>RISK / 100</div>
    </div>
  );
}

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const Icons = {
  CheckCircle: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
  AlertTriangle: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  Shield: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
  Lock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>,
  Terminal: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>,
  Refresh: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" /></svg>,
  DollarSign: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>,
  FileText: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
  ,
  Globe: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
};

// ─── ALERT WIDGET (Grammarly-style) ───────────────────────────────────────────
function AlertWidget({ onViewDashboard, globalAlerts }) {
  const alertsToUse = globalAlerts && globalAlerts.length > 0 ? globalAlerts : ACTIVE_ALERTS;
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(alertsToUse[0]);
  const [pulse, setPulse] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (alertsToUse.length > 0 && !alertsToUse.find(a => a.id === active?.id)) {
      setActive(alertsToUse[0]);
    }
  }, [globalAlerts]);

  if (dismissed || !active) return null;
  const cfg = SEV_CFG[active.severity] || SEV_CFG.medium;
  const critCount = alertsToUse.filter(a => a.severity === "critical").length;

  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "'DM Sans',system-ui,sans-serif" }}>

      {/* ── COLLAPSED PILL ── */}
      {!expanded && (
        <button onClick={() => { setExpanded(true); setPulse(false); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", borderRadius: 999, background: C.card, border: `1.5px solid ${cfg.border}`, cursor: "pointer", boxShadow: "0 4px 24px rgba(15,23,42,0.12)", animation: "fadeUp 0.3s ease" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0, position: "relative", display: "inline-block" }}>
            {pulse && <span style={{ position: "absolute", inset: -4, borderRadius: "50%", background: cfg.color + "40", animation: "pingAnim 1.6s ease-out infinite" }} />}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{critCount} Critical Alert{critCount !== 1 ? "s" : ""} Detected</span>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: cfg.color, color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{alertsToUse.length}</span>
        </button>
      )}

      {/* ── EXPANDED PANEL ── */}
      {expanded && (
        <div style={{ width: 380, background: C.card, borderRadius: 16, boxShadow: "0 12px 48px rgba(15,23,42,0.16)", border: "1px solid #E2E8F0", overflow: "hidden", animation: "fadeUp 0.22s ease" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #F1F5F9", background: C.bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.01em" }}>OSIRIS</div>
                <div style={{ fontSize: 10, color: C.textLight, marginTop: -1 }}>Supply Disruption Co-Pilot</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: cfg.color + "15", color: cfg.color }}>{alertsToUse.length} Active</span>
              <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 15, lineHeight: 1, padding: 3 }}>✕</button>
            </div>
          </div>

          {/* Alert list */}
          <div style={{ borderBottom: "1px solid #F1F5F9", maxHeight: 160, overflowY: "auto" }}>
            {alertsToUse.map(a => {
              const c = SEV_CFG[a.severity] || SEV_CFG.medium;
              const isActive = active.id === a.id;
              return (
                <button key={a.id} onClick={() => setActive(a)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", border: "none", cursor: "pointer", background: isActive ? c.bg : C.card, borderLeft: `3px solid ${isActive ? c.color : "transparent"}`, textAlign: "left", fontFamily: "'DM Sans',sans-serif" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: C.text }}>{a.title}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.color }}>{c.label}</span>
                    <span style={{ fontSize: 10, color: C.textLight }}>{a.detectedAt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active detail */}
          <div style={{ margin: "12px", borderRadius: 10, padding: "13px 15px", background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 3 }}>{active.title}</div>
                <div style={{ fontSize: 11, color: C.textMid }}>{active.supplier} · {active.region}</div>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: cfg.color, color: "white", fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10, fontFamily: "'Sora',sans-serif" }}>{active.riskScore}</div>
            </div>
            <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.6, margin: "8px 0 12px" }}>{active.summary.slice(0, 160)}...</p>
            <div style={{ display: "flex", gap: 18 }}>
              {[["Revenue at Risk", active.revenueAtRisk, cfg.color], ["Confidence", `${active.confidenceScore}%`, C.text], ["Days to Stockout", `${active.daysToStockout}d`, active.daysToStockout < 10 ? C.critical : C.high]].map(([l, v, c]) => (
                <div key={l}><div style={{ fontSize: 10, color: C.textLight, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "'Sora',sans-serif" }}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid #F1F5F9" }}>
            <button onClick={() => setDismissed(true)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #E2E8F0", background: C.card, color: C.textMid, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Dismiss</button>
            <button onClick={() => { onViewDashboard(active); setExpanded(false); }}
              style={{ flex: 2, padding: "9px 14px", borderRadius: 8, border: "none", background: cfg.color, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              View Full Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage }) {
  const nav = [
    { id: "monitor", icon: "⬡", label: "Live Monitor" },
    { id: "analysis", icon: "◎", label: "Risk Analysis" },
    { id: "playbook", icon: "◈", label: "Playbook" },
    { id: "suppliers", icon: "◻", label: "Supplier Map" },
    { id: "audit", icon: "∿", label: "Audit Log" },
    { id: "settings", icon: "⚙", label: "Settings" },
  ];

  return (
    <aside style={{ width: 220, minWidth: 220, background: C.sidebar, display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, fontFamily: "'Fira Sans',system-ui,sans-serif" }}>
      {/* Brand */}
      <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: C.brand, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,0.15)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "white", letterSpacing: "0.06em", fontFamily: "'Fira Code',sans-serif" }}>OSIRIS</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em" }}>SUPPLY CO-PILOT</div>
          </div>
        </div>
      </div>

      {/* Manufacturer */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: 6 }}>ACTIVE PROFILE</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{MANUFACTURER.name}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{MANUFACTURER.industry}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#10B981" }}>Demo Mode Active</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {nav.map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: page === item.id ? C.sidebarActive : "transparent", color: page === item.id ? "white" : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: page === item.id ? 600 : 400, cursor: "pointer", textAlign: "left", marginBottom: 2, fontFamily: "'DM Sans',sans-serif", transition: "all 0.12s" }}>
            <span style={{ fontSize: 14, width: 18, textAlign: "center", opacity: page === item.id ? 1 : 0.7 }}>{item.icon}</span>
            {item.label}
            {item.id === "monitor" && (
              <span style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: C.critical, color: "white", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>
            )}
          </button>
        ))}
      </nav>

      {/* WorldMonitor Link */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "0 8px" }}>
        <button onClick={() => window.location.href = '/world-monitor'}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans',sans-serif", transition: "all 0.12s" }}
          onMouseOver={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)" }}
          onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)" }}>
          <span style={{ fontSize: 16 }}>🌍</span>
          View WorldMonitor
        </button>
      </div>

      {/* Governance badge */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "0 8px 12px" }}>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 4 }}>GOVERNANCE STATUS</div>
          <div style={{ fontSize: 11, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
            HITL Active — No Auto-Exec
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function Topbar({ title, subtitle }) {
  return (
    <header style={{ height: 58, background: C.card, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50, fontFamily: "'Fira Sans',sans-serif" }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: "-0.01em", fontFamily: "'Fira Code',sans-serif" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.textLight, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textLight, padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg }}>
          <Icons.Lock /> Assist · Recommend · Simulate
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer" }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 700 }}>SC</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Sarah Chen</span>
          <span style={{ fontSize: 10, color: C.textLight }}>▾</span>
        </div>
      </div>
    </header>
  );
}

// ─── LIVE MONITOR PAGE ────────────────────────────────────────────────────────
function MonitorPage({ onAnalyze, globalAlerts }) {
  const alertsToUse = globalAlerts && globalAlerts.length > 0 ? globalAlerts : ACTIVE_ALERTS;
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simSteps, setSimSteps] = useState([]);

  const handleSimulate = async () => {
    setSimulating(true);
    setSimSteps([]);
    const steps = [
      "SENSE: Ingesting GNews + GDELT signals...",
      "CLASSIFY: Matching supplier registry...",
      "PROBABILITY: Assessing disruption likelihood...",
      "RISK SCORING: Computing revenue-at-risk...",
      "IMPACT: Calculating supply chain blast radius...",
      "SCENARIOS: Running base/stress/shock...",
      "PLAYBOOK: Ranking mitigations...",
      "CRITIC: Validating with constraints...",
      "DRAFT: Generating communication...",
      "ESCALATION: Evaluating thresholds...",
      "LOG: Writing to immutable ledger..."
    ];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      setSimSteps(prev => [...prev, steps[i]]);
    }
    await new Promise(r => setTimeout(r, 600));
    setSimulating(false);

    // Find Red Sea alert (NXS-002)
    const redSeaAlert = alertsToUse.find(a => a.id === "NXS-002") || alertsToUse[1] || ACTIVE_ALERTS[1];
    onAnalyze(redSeaAlert);
  };

  const handleQuickAnalyze = async (alert) => {
    setAnalyzing(true);
    const steps = ["SENSE: Ingesting GNews + GDELT signals...", "CLASSIFY: Matching supplier registry...", "RISK SCORING: Computing revenue-at-risk...", "SCENARIO: Running base/stress/shock...", "PLAYBOOK: Ranking mitigations...", "CRITIC: Validating...", "ESCALATION: Evaluating thresholds...", "COMPLETE"];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 600));
      setStatus(steps[i]);
    }
    setAnalyzing(false);
    onAnalyze(alert);
  };

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 1200 }}>

      {/* Title & Simulate Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Live Monitor</h1>
        <button
          onClick={handleSimulate}
          disabled={simulating}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: simulating ? "rgba(255,255,255,0.05)" : "rgba(245, 158, 11, 0.15)",
            border: `1px solid ${simulating ? "rgba(255,255,255,0.1)" : "rgba(245, 158, 11, 0.3)"}`,
            borderRadius: 8, color: simulating ? C.textLight : C.brand, fontSize: 13,
            fontWeight: 700, cursor: simulating ? "not-allowed" : "pointer",
            transition: "all 0.2s"
          }}>
          {simulating ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 14 }}>⟳</span>
              Agent Running...
            </>
          ) : (
            <>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.critical, animation: "pulseAnim 2s infinite" }} />
              Simulate Live Disruption
            </>
          )}
        </button>
      </div>

      {/* Simulation Banner & Logs */}
      {simulating && (
        <div style={{ background: C.criticalLight, border: `1px solid ${C.criticalBorder}`, borderRadius: 12, padding: "20px", marginBottom: 22, animation: "fadeUp 0.3s ease-out" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.critical, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            LIVE SIMULATION — Red Sea Rerouting Event Detected
          </div>
          <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 8, padding: "16px", fontFamily: "'Fira Code', monospace", fontSize: 12, color: C.textMid, display: "flex", flexDirection: "column", gap: 6, maxHeight: "200px", overflowY: "auto" }}>
            {simSteps.map((step, idx) => (
              <div key={idx} style={{ display: "flex", gap: 10, animation: "fadeUp 0.3s ease-out" }}>
                <span style={{ color: C.critical }}>{`[${new Date().toLocaleTimeString()}]`}</span>
                <span style={{ color: C.text }}>{step}</span>
              </div>
            ))}
            <div style={{ opacity: 0.5, inlineSize: "fit-content", animation: "pulseAnim 1s infinite" }}>_</div>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Active Disruptions", value: String(alertsToUse.length), sub: "↑ from last 24h", color: C.critical },
          { label: "Revenue at Risk", value: "$6.6M", sub: "Across all active alerts", color: C.high },
          { label: "Critical Suppliers", value: "2", sub: "< 10 days stockout", color: C.critical },
          { label: "Avg Confidence", value: "84%", sub: "Above escalation threshold", color: C.success },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.border} `, boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6, fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color, letterSpacing: "-0.03em", lineHeight: 1, fontFamily: "'Fira Code',sans-serif" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 8 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Governance + system status */}
      <div style={{ background: C.brandLight, border: `1px solid #E9D5FF`, borderRadius: 10, padding: "12px 18px", marginBottom: 22, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.brand }}>
        <span style={{ fontSize: 16, color: C.brand }}><Icons.Shield /></span>
        <div>
          <strong>Governance Active.</strong> Agent operates in Assist-Only mode. No purchase orders, emails, or ERP writes execute without human approval token. False positive rate: <strong>12%</strong> — within threshold.
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textMid, flexShrink: 0 }}>Polling every 5 min · Last: {new Date().toLocaleTimeString()}</div>
      </div>

      {/* Active alerts */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 14, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.01em" }}>Active Disruption Signals</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alertsToUse.map(a => {
            const cfg = SEV_CFG[a.severity] || SEV_CFG.medium;
            return (
              <div key={a.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border} `, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  {/* Left severity bar */}
                  <div style={{ width: 5, background: cfg.color, flexShrink: 0 }} />

                  {/* Content */}
                  <div style={{ flex: 1, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border} `, letterSpacing: "0.04em" }}>{cfg.label.toUpperCase()}</span>
                          <span style={{ fontSize: 11, color: C.textLight }}>{a.id}</span>
                          <span style={{ fontSize: 11, color: C.textLight }}>· {a.detectedAt}</span>
                          {a.escalate && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FEF2F2", color: C.critical, border: `1px solid ${C.criticalBorder} ` }}>🚨 ESCALATE</span>}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.01em" }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>{a.supplier} · {a.region} · {a.commodity}</div>
                        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.6, margin: 0, marginBottom: 12 }}>{a.summary}</p>

                        {/* Collapsible Reasoning Trace snippet */}
                        {a.reasoningTrace && a.reasoningTrace.length > 0 && (
                          <details style={{ background: "#F8FAFC", padding: "10px 14px", borderRadius: 8, border: `1px dashed ${C.border} `, fontFamily: "monospace", fontSize: 11, color: C.textMid, lineHeight: 1.5, cursor: "pointer", outline: "none" }}>
                            <summary style={{ fontWeight: 700, color: C.text, marginBottom: 4, outline: "none", userSelect: "none" }}>[+] AI Reasoning Trace : Expand Logic Chain</summary>
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              {a.reasoningTrace.map((step, idx) => {
                                const [label, ...rest] = step.split(":");
                                return (
                                  <div key={idx} style={{ display: "flex", gap: 8 }}>
                                    <span style={{ color: C.brand, fontWeight: 700, whiteSpace: "nowrap" }}>{label}:</span>
                                    <span>{rest.join(":")}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </div>

                      {/* Right metrics */}
                      <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
                        <RiskGauge score={a.riskScore} size={88} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, textAlign: "right" }}>
                          {[["Rev at Risk", a.revenueAtRisk, cfg.color], ["Confidence", `${a.confidenceScore}% `, C.text], ["Stockout", `${a.daysToStockout} d`, a.daysToStockout < 10 ? C.critical : C.high], ["CoD Tier", `T${a.costOfDelayTier} `, cfg.color]].map(([l, v, c]) => (
                            <div key={l}><div style={{ fontSize: 9, color: C.textLight, letterSpacing: "0.04em" }}>{l}</div><div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: "'Sora',sans-serif" }}>{v}</div></div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border} ` }}>
                      <div style={{ display: "flex", gap: 20 }}>
                        <span style={{ fontSize: 11, color: C.textMid }}><strong>BOM:</strong> {a.bomImpact}</span>
                        <span style={{ fontSize: 11, color: C.textMid }}><strong>Open POs:</strong> {a.openPOs}</span>
                      </div>
                      <button
                        onClick={() => handleQuickAnalyze(a)}
                        disabled={analyzing}
                        style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: a.riskScore >= 75 ? C.critical : C.brand, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", opacity: analyzing ? 0.6 : 1 }}>
                        {analyzing ? `${status} ` : "Run Full Analysis →"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Supplier inventory status */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} ` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14, fontFamily: "'Sora',sans-serif" }}>Inventory Coverage — Critical SKUs</div>
        {[
          { sku: "SKU-4421", name: "Processor Module A", days: 8, max: 30, status: "critical" },
          { sku: "SKU-4422", name: "Memory Module B", days: 8, max: 30, status: "critical" },
          { sku: "SKU-5891", name: "Main PCB Assembly", days: 12, max: 30, status: "warning" },
          { sku: "SKU-3310", name: "Polymer Housing", days: 18, max: 30, status: "ok" },
          { sku: "SKU-2200", name: "Capacitor Array", days: 22, max: 30, status: "ok" },
        ].map(s => {
          const barColor = s.status === "critical" ? C.critical : s.status === "warning" ? C.high : C.success;
          return (
            <div key={s.sku} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div><span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</span><span style={{ fontSize: 11, color: C.textLight, marginLeft: 8 }}>({s.sku})</span></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: barColor, fontFamily: "'Sora',sans-serif" }}>{s.days}d</span>
              </div>
              <div style={{ height: 6, background: "#F1F5F9", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${(s.days / s.max) * 100}% `, background: barColor, borderRadius: 999, transition: "width 0.6s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RISK ANALYSIS PAGE ───────────────────────────────────────────────────────
function AnalysisPage({ focusAlert, globalAlerts, currentProfile }) {
  const alertsToUse = globalAlerts && globalAlerts.length > 0 ? globalAlerts : ACTIVE_ALERTS;
  const initialAlert = alertsToUse.find(a => a.id === focusAlert?.id) || alertsToUse[0];

  const [selected, setSelected] = useState(initialAlert);
  const [emailStatus, setEmailStatus] = useState("pending");
  const [erpStatus, setErpStatus] = useState("pending");
  const [emailSending, setEmailSending] = useState(false);

  const [supplierHealth, setSupplierHealth] = useState(null);

  const [forecast, setForecast] = useState(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);

  // Re-sync if globalAlerts updates
  useEffect(() => {
    if (alertsToUse.length > 0 && !alertsToUse.find(a => a.id === selected?.id)) {
      setSelected(alertsToUse[0]);
    }
  }, [globalAlerts, selected]);

  useEffect(() => {
    setForecast(null);
  }, [selected]);

  useEffect(() => {
    async function fetchHealth() {
      if (!selected) return;
      setSupplierHealth(null);
      // Look up ticker from manufacturer profile based on the selected alert's supplier string
      // Just naively grep the profile for the ticker - simple proxy for demonstration
      let ticker = "TSM";
      if (selected.supplier.toLowerCase().includes("foxconn") || selected.supplier.toLowerCase().includes("hon hai")) ticker = "2317.TW";
      if (selected.supplier.toLowerCase().includes("samsung")) ticker = "005930.KS";
      if (selected.supplier.toLowerCase().includes("bayer")) ticker = "BAYN.DE";
      if (selected.supplier.toLowerCase().includes("basf")) ticker = "BASFY";

      const health = await getSupplierFinancialHealth(ticker);
      setSupplierHealth(health);
    }
    fetchHealth();
  }, [selected]);

  // Handle action approval/dismissal (L2 Autonomy Gate)
  const handleAction = async (type, action) => {
    if (type === "email") {
      setEmailStatus(action);
      if (action === "approved") {
        setEmailSending(true);
        await writeAuditLog({
          eventType: "supplier_communication",
          disruptionId: selected.id,
          action: "email_approved_and_sent",
          payload: { to: `procurement @${selected.supplier.toLowerCase().split("/")[0].trim().replace(/[^a-z]/g, "")}.com`, subject: `[URGENT] Supply Continuity Review — ${selected.commodity} ` }
        });
        setEmailSending(false);
      } else if (action === "dismissed") {
        await writeAuditLog({
          eventType: "supplier_communication",
          disruptionId: selected.id,
          action: "email_dismissed",
          payload: {}
        });
      }
    } else if (type === "erp") {
      setErpStatus(action);
      if (action === "approved") {
        await writeAuditLog({
          eventType: "erp_adjustment",
          disruptionId: selected.id,
          action: "erp_flag_approved",
          payload: { action: "Safety stock threshold review", sku: "SKU-4421, SKU-4422" }
        });
      } else if (action === "dismissed") {
        await writeAuditLog({
          eventType: "erp_adjustment",
          disruptionId: selected.id,
          action: "erp_flag_dismissed",
          payload: {}
        });
      }
    }
  };

  const handleGenerateForecast = async () => {
    setIsLoadingForecast(true);
    const result = await getSituationForecast(selected, currentProfile || MANUFACTURER);
    setForecast(result);
    setIsLoadingForecast(false);
  };

  if (!selected) return null;
  const cfg = SEV_CFG[selected.severity] || SEV_CFG.medium;

  const activePlaybook = selected.playbook && selected.playbook.length > 0 ? selected.playbook : PLAYBOOK;

  const baseReasoning = [
    "01 SENSE: GNews signal ingested. Reuters-sourced article. Credibility: 88%. GDELT tone: -8.4 (Critical).",
    "02 CLASSIFY: TSMC & Hon Hai matched in supplier registry. BOM intersection: SKU-4421, SKU-4422 → 34% of active BOM.",
    "03 PROBABILITY: P=78% — Event severity (88) + Historical similarity 2022 exercises (72) + Source credibility (90).",
    "04 RISK SCORE: 78 × 4.2 × 3 = normalized 87/100. Time multiplier=3 (8 days to stockout < 10-day threshold).",
    "05 IMPACT: Revenue-at-Risk = $280K/day × 15d = $4.2M. Open POs affected: PO-8821 + PO-8834 = $1.84M.",
    "06 SCENARIOS: Base (14d/$1.8M), Stress (+20%: 17d/$2.2M), Shock (+50%: 21d/$3.1M).",
    "07 PLAYBOOK: 3 options ranked by (Risk Reduction ÷ Cost) × Feasibility. #1: Alternate Supplier (composite 88).",
    "08 CRITIC: Forced demand-shaping alt. Flagged air freight cash flow risk. Confirmed escalation validity.",
    "09 DRAFT: Supplier email generated. Status: AWAITING_APPROVAL. ERP flag: SIMULATED_ONLY.",
    "10 ESCALATION: Risk 87>65 ✓, Confidence 91%>70% ✓, FP Rate 12%<20% ✓ → Triggered to SMS + Dashboard.",
    "11 LOG: Analysis recorded. Audit trail updated. Memory store patched.",
  ];

  // Adjust risk score visually based on geopolitical baseline and financial health
  let baseRiskScore = selected.riskScore;

  let countryBaseline = 0;
  let matchedCountry = null;
  const geoRisks = currentProfile?.geopoliticalRisks || { Taiwan: 30, China: 25, Japan: 10, Mexico: 15, USA: 5 };
  for (const [country, risk] of Object.entries(geoRisks)) {
    if ((selected.region + " " + selected.supplier).includes(country) ||
      (country === "USA" && selected.region.includes("USA"))) {
      countryBaseline = risk;
      matchedCountry = country;
      break;
    }
  }

  let adjustedRiskScore = baseRiskScore;
  if (countryBaseline > 0) {
    adjustedRiskScore = adjustedRiskScore * (1 + countryBaseline / 100);
  }

  if (supplierHealth && supplierHealth.insolvencyRiskScore > 0) {
    adjustedRiskScore += Math.round(supplierHealth.insolvencyRiskScore / 10);
  }

  adjustedRiskScore = Math.min(100, Math.round(adjustedRiskScore));

  // Inject logic traces
  if (supplierHealth && supplierHealth.insolvencyRiskScore > 0) {
    baseReasoning.splice(4, 0, `04.b FINANCIAL HEALTH: ${supplierHealth.ticker} risk assessed.Insolvency Risk: ${supplierHealth.insolvencyRiskScore} /100. (+${Math.round(supplierHealth.insolvencyRiskScore / 10)
      } to base risk).`);
  }
  if (matchedCountry) {
    baseReasoning.splice(4, 0, `04.a GEOPOLITICAL: ${matchedCountry} detected.Baseline risk multiplier applied(* 1.${countryBaseline < 10 ? '0' + countryBaseline : countryBaseline} to base score).`);
  }

  const mockResult = {
    scenarios: {
      baseCase: { delay: "14d", cost: "+$85K", rev: "-$1.8M", svc: "72%" },
      stressCase: { delay: "17d", cost: "+$98K", rev: "-$2.2M", svc: "61%", note: "+20% delay / +15% cost" },
      shockCase: { delay: "21d", cost: "+$119K", rev: "-$3.1M", svc: "44%", note: "+50% delay / +40% cost" },
    },
    criticPass: {
      alt: "Demand shaping: delay non-critical orders 3 weeks → reduces revenue impact by $400K.",
      cash: "Combined Options 1+3: $57K outflow vs $4.2M revenue at risk. Ratio: 74:1.",
      overlooked: "Samsung Foundry capacity may be constrained industry-wide.",
      validity: "Escalation valid: All 3 thresholds met (Risk 87>65, Confidence 91%>70%, FP 12%<20%).",
    },
    reasoning: baseReasoning,
  };

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 1200 }}>

      {/* Alert selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {alertsToUse.map(a => {
          const c = SEV_CFG[a.severity] || SEV_CFG.medium;
          const isActive = selected.id === a.id;
          return (
            <button key={a.id} onClick={() => { setSelected(a); setEmailStatus("pending"); setErpStatus("pending"); }}
              style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${isActive ? c.color : C.border} `, background: isActive ? c.bg : C.card, cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: c.color, letterSpacing: "0.04em" }}>{c.label.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: C.textLight }}>{a.id}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: C.textLight, marginTop: 4 }}>{a.revenueAtRisk} at risk</div>
            </button>
          );
        })}
      </div>

      {/* Alert header */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border} `, borderRadius: 12, padding: "20px 24px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: cfg.color, letterSpacing: "0.06em", padding: "4px 10px", background: cfg.color + "15", borderRadius: 999, border: `1px solid ${cfg.border} ` }}>{cfg.label.toUpperCase()} — {selected.id}</span>
              {selected.escalate && <span style={{ fontSize: 10, fontWeight: 700, color: C.critical, padding: "3px 9px", background: C.criticalLight, borderRadius: 999, border: `1px solid ${C.criticalBorder} ` }}>🚨 ESCALATION REQUIRED</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.text, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.02em", marginBottom: 4 }}>{selected.title}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 13, color: C.textMid, fontWeight: 600 }}>{selected.supplier} · {selected.region} · {selected.commodity}</div>
              {matchedCountry && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, background: countryBaseline > 30 ? C.criticalLight : (countryBaseline >= 15 ? C.mediumLight : C.successLight), color: countryBaseline > 30 ? C.critical : (countryBaseline >= 15 ? C.medium : C.success), fontSize: 10, fontWeight: 800, border: `1px solid ${countryBaseline > 30 ? C.criticalBorder : (countryBaseline >= 15 ? C.mediumBorder : C.successLight)} ` }}>
                  <span>{getCountryFlag(matchedCountry)}</span>
                  <span>{matchedCountry} {countryBaseline}/100</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <RiskGauge score={adjustedRiskScore} size={100} />
            <div style={{ background: selected.escalate ? C.criticalLight : C.successLight, border: `1px solid ${selected.escalate ? C.criticalBorder : C.successLight} `, borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
              <div style={{ color: selected.escalate ? C.critical : C.success, display: "flex", justifyContent: "center", marginBottom: 6 }}>
                {selected.escalate ? <Icons.AlertTriangle /> : <Icons.CheckCircle />}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: selected.escalate ? C.critical : C.success }}>{selected.escalate ? "Escalation\nRequired" : "No\nEscalation"}</div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7, margin: 0 }}>{selected.summary}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        {[
          ["Revenue at Risk", selected.revenueAtRisk, cfg.color],
          ["Confidence Score", `${selected.confidenceScore}% `, C.text],
          ["Days to Stockout", `${selected.daysToStockout} d`, selected.daysToStockout < 10 ? C.critical : C.high],
          ["Cost-of-Delay", getTierLabel(selected.costOfDelayTier), cfg.color],
          ["Detected", selected.detectedAt, C.textMid],
        ].map(([l, v, c]) => (
          <div key={l} style={{ background: C.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.border} ` }}>
            <div style={{ fontSize: 11, color: C.textLight, marginBottom: 6, fontWeight: 500 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: c, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.02em" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Supplier Financial Health */}
      {supplierHealth && (
        <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} `, marginBottom: 18, animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Supplier Financial Health (API)</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "white", background: supplierHealth.insolvencyRiskScore > 35 ? C.critical : C.success, padding: "4px 10px", borderRadius: 6, letterSpacing: "0.05em" }}>
              {supplierHealth.insolvencyRiskLevel.toUpperCase()} RISK
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, color: C.textMid, fontWeight: 600, marginBottom: 4 }}>Ticker</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'Fira Code',sans-serif" }}>{supplierHealth.ticker}</div>
            </div>
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, color: C.textMid, fontWeight: 600, marginBottom: 4 }}>Insolvency Score</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: supplierHealth.insolvencyRiskScore > 35 ? C.critical : C.text, fontFamily: "'Fira Code',sans-serif" }}>{supplierHealth.insolvencyRiskScore}/100</div>
            </div>
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, color: C.textMid, fontWeight: 600, marginBottom: 4 }}>Debt-to-Equity</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: supplierHealth.debtToEquity > 1.5 ? C.high : C.text, fontFamily: "'Fira Code',sans-serif" }}>{supplierHealth.debtToEquity}</div>
            </div>
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, color: C.textMid, fontWeight: 600, marginBottom: 4 }}>Current Ratio</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: supplierHealth.currentRatio < 1.2 ? C.high : C.text, fontFamily: "'Fira Code',sans-serif" }}>{supplierHealth.currentRatio}</div>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} `, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14, fontFamily: "'Sora',sans-serif" }}>Scenario Simulation</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { label: "Base Case", ...mockResult.scenarios.baseCase, color: C.success },
            { label: "Stress Case", ...mockResult.scenarios.stressCase, color: C.high },
            { label: "Shock Case", ...mockResult.scenarios.shockCase, color: C.critical },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg, borderRadius: 10, padding: "16px", borderTop: `3px solid ${s.color} ` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: s.color, marginBottom: 4, letterSpacing: "0.04em" }}>{s.label.toUpperCase()}</div>
              {s.note && <div style={{ fontSize: 10, color: C.textLight, marginBottom: 10 }}>{s.note}</div>}
              {[["Transit Delay", s.delay], ["Additional Cost", s.cost], ["Revenue Impact", s.rev], ["Service Level", s.svc]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.textMid }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: k === "Revenue Impact" ? s.color : C.text, fontFamily: "'Sora',sans-serif" }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Playbook */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} `, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14, fontFamily: "'Sora',sans-serif" }}>Ranked Mitigation Playbook</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activePlaybook.map((p, i) => (
            <div key={p.rank || i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border} ` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: (p.rank || i + 1) === 1 ? C.brand : (p.rank || i + 1) === 2 ? C.high : "#94A3B8", color: "white", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Sora',sans-serif" }}>#{p.rank || i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{p.action}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>{p.description}</div>
                <div style={{ fontSize: 11, color: C.textLight, marginTop: 4, fontStyle: "italic" }}>Trade-off: {p.tradeOff || p.tradeoff}</div>
              </div>
              <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
                {[["Cost", p.cost || "-"], ["Time", p.time || "-"], ["Risk ↓", `${p.reduction || 0}% `], ["Feasibility", `${p.feasibility || 0}% `]].map(([k, v]) => (
                  <div key={k} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.textLight }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: k === "Risk ↓" ? C.success : C.text, fontFamily: "'Sora',sans-serif" }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ width: 60, flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: C.textLight, marginBottom: 4 }}>COMPOSITE</div>
                <div style={{ height: 4, background: "#E2E8F0", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${p.composite || p.feasibility || 0}% `, background: (p.rank || i + 1) === 1 ? C.brand : C.accent, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginTop: 3, fontFamily: "'Sora',sans-serif" }}>{p.composite || p.feasibility || 0}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Critic pass */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} `, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14, fontFamily: "'Fira Code',sans-serif" }}>Critic Pass — Mandatory Second Opinion</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[
            [{ icon: <Icons.Refresh />, label: "Alternative Forced" }, mockResult.criticPass.alt],
            [{ icon: <Icons.DollarSign />, label: "Cash Flow Assessment" }, mockResult.criticPass.cash],
            [{ icon: <Icons.AlertTriangle />, label: "Overlooked Risks" }, mockResult.criticPass.overlooked],
            [{ icon: <Icons.CheckCircle />, label: "Escalation Validity" }, mockResult.criticPass.validity]
          ].map(([{ icon, label }, v]) => (
            <div key={label} style={{ background: C.bg, borderRadius: 9, padding: "13px 16px", border: `1px solid ${C.border} ` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>{icon} {label}</div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Draft email + ERP */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} ` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Draft Supplier Email</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: emailStatus === "pending" ? C.high : (emailStatus === "approved" ? C.success : C.textMid), background: emailStatus === "pending" ? C.highLight : (emailStatus === "approved" ? C.successLight : "#F1F5F9"), padding: "4px 10px", borderRadius: 999, border: `1px solid ${emailStatus === "pending" ? C.highBorder : (emailStatus === "approved" ? C.success : C.border)} ` }}>
              {emailStatus === "pending" ? "⏸ AWAITING APPROVAL" : (emailStatus === "approved" ? "✓ EXECUTED" : "DISMISSED")}
            </span>
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", marginBottom: 12, fontFamily: "monospace" }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 4 }}><span style={{ color: C.brand, fontWeight: 700 }}>TO: </span>procurement@{selected.supplier.toLowerCase().split("/")[0].trim().replace(/[^a-z]/g, "")}.com</div>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}><span style={{ color: C.brand, fontWeight: 700 }}>SUB: </span>[URGENT] Supply Continuity Review — {selected.commodity}</div>
            <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, fontFamily: "'Fira Sans',sans-serif" }}>
              Dear {selected.supplier} team,<br /><br />
              We are formally requesting an urgent supply continuity review following disruption signals in the {selected.region} corridor affecting {selected.commodity} supply.<br /><br />
              Please confirm current production status, lead times, and alternative options within 24 hours.<br /><br />
              Reference: {selected.id}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: C.textLight }}>🔒 Human approval required before sending</div>
            {emailStatus === "pending" ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => handleAction("email", "dismissed")} disabled={emailSending}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border} `, background: C.card, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  Dismiss
                </button>
                <button onClick={() => handleAction("email", "approved")} disabled={emailSending}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.brand} `, background: C.brand, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  {emailSending ? "Sending..." : "Approve & Send"}
                </button>
              </div>
            ) : (
              <div style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${emailStatus === "approved" ? C.success : C.border} `, background: emailStatus === "approved" ? C.successLight : "#F1F5F9", color: emailStatus === "approved" ? C.success : C.textMid, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
                {emailStatus === "approved" ? "✓ Approved & Sent" : "Dismissed"}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} ` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>ERP Adjustment Flag</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: erpStatus === "pending" ? C.textLight : (erpStatus === "approved" ? C.success : C.textMid), background: erpStatus === "pending" ? "#F8FAFC" : (erpStatus === "approved" ? C.successLight : "#F1F5F9"), padding: "4px 10px", borderRadius: 999, border: `1px solid ${erpStatus === "pending" ? C.border : (erpStatus === "approved" ? C.success : C.border)} ` }}>
              {erpStatus === "pending" ? "◈ SIMULATED ONLY" : (erpStatus === "approved" ? "✓ EXECUTED" : "DISMISSED")}
            </span>
          </div>
          {[["Action", "Safety stock threshold review"], ["System", "SAP S/4HANA"], ["Reorder Point", "+20% for SKU-4421, SKU-4422 for 45 days"], ["Safety Stock Rec", "Build 30-day buffer from alternate source"], ["Status", "🔒 SIMULATED — No write performed"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, color: C.textLight, fontWeight: 700, minWidth: 90, paddingTop: 2, letterSpacing: "0.03em" }}>{k.toUpperCase()}</span>
              <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textLight }}><Icons.Lock /> No ERP writes without CFO approval</div>
            {erpStatus === "pending" ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => handleAction("erp", "dismissed")}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border} `, background: C.card, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Fira Sans',sans-serif" }}>
                  Dismiss
                </button>
                <button onClick={() => handleAction("erp", "approved")}
                  style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.brand} `, background: C.brand, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Fira Sans',sans-serif" }}>
                  Approve Write
                </button>
              </div>
            ) : (
              <div style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${erpStatus === "approved" ? C.success : C.border} `, background: erpStatus === "approved" ? C.successLight : "#F1F5F9", color: erpStatus === "approved" ? C.success : C.textMid, fontSize: 12, fontWeight: 700, fontFamily: "'Fira Sans',sans-serif" }}>
                {erpStatus === "approved" ? "✓ Write Approved" : "Dismissed"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reasoning trace */}
      <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} ` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14, fontFamily: "'Fira Code',sans-serif" }}>Full Reasoning Trace — Grounded Citations</div>
        <div style={{ background: C.bg, borderRadius: 9, padding: "14px 16px", maxHeight: 260, overflowY: "auto" }}>
          {mockResult.reasoning.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace", minWidth: 24, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 12, color: C.textMid, lineHeight: 1.6 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Intelligence Forecast */}
      <div style={{ background: "#0F172A", borderRadius: 12, padding: "18px 22px", border: `1px solid rgb(51, 65, 85)`, marginTop: 18, color: "#E2E8F0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: forecast || isLoadingForecast ? 14 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.medium, fontFamily: "'Fira Code', monospace", letterSpacing: "0.05em" }}>[ FORECAST // 24H OUTLOOK ]</div>
          {!forecast && !isLoadingForecast && (
            <button
              onClick={handleGenerateForecast}
              style={{ padding: "6px 14px", borderRadius: 4, border: `1px solid ${C.medium} `, background: "transparent", color: C.medium, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Fira Code', monospace" }}
            >
              DECRYPT SCENARIO
            </button>
          )}
        </div>

        {isLoadingForecast && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            <div style={{ height: 12, background: "rgb(51, 65, 85)", borderRadius: 4, width: "100%", animation: "pulseAnim 1.5s infinite" }} />
            <div style={{ height: 12, background: "rgb(51, 65, 85)", borderRadius: 4, width: "85%", animation: "pulseAnim 1.5s infinite.2s" }} />
            <div style={{ height: 12, background: "rgb(51, 65, 85)", borderRadius: 4, width: "92%", animation: "pulseAnim 1.5s infinite.4s" }} />
          </div>
        )}

        {forecast && (
          <details open style={{ background: "#1E293B", borderRadius: 6, padding: "16px 20px", border: `1px solid rgb(51, 65, 85)`, cursor: "pointer", outline: "none" }}>
            <summary style={{ fontWeight: 700, color: "#94A3B8", marginBottom: 12, outline: "none", fontSize: 11, userSelect: "none", fontFamily: "'Fira Code', monospace", letterSpacing: "0.05em" }}>[+] SYSTEM.ANALYZE()</summary>
            <div style={{ fontSize: 12, color: "#38BDF8", lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "text", fontFamily: "'Fira Code', monospace" }}>
              {forecast}
            </div>
          </details>
        )}
      </div>

    </div>
  );
}

// ─── PLAYBOOK PAGE ───────────────────────────────────────────────────────────────
function PlaybookPage({ globalAlerts }) {
  const library = useMemo(() => {
    // Merge playbooks from all active disruptions
    return globalAlerts.flatMap(alert => {
      if (!alert.playbook || !Array.isArray(alert.playbook)) return [];

      // We assign a category and status for UI purposes since the JSONB might not have it
      return alert.playbook.map((p, i) => ({
        ...p,
        id: `${alert.id} -pb - ${i} `,
        category: p.category || "Supplier Mitigation",
        status: p.status || "Active",
        action: p.action,
        description: p.description,
        cost: p.cost || "-",
        time: p.time || "-",
        composite: p.composite || p.feasibility || 0,
        tradeOff: p.tradeOff || p.tradeoff || "None specified"
      }));
    });
  }, [globalAlerts]);

  // If there are no playbooks from DB yet, use the fallback mock data so the UI doesn't look empty
  const fallbackLibrary = [
    ...PLAYBOOK.map(p => ({ ...p, id: p.rank, category: "Sourcing", status: "Active" })),
    { id: 4, action: "Spot Market Purchase", category: "Procurement", description: "Buy from open market brokers. High risk of counterfeit.", cost: "$80K premium", time: "5 days", reduction: 40, feasibility: 60, composite: 55, tradeOff: "High cost, quality risk.", cashFlow: "-$80K immediate", status: "Archived" },
    { id: 5, action: "Tooling Relocation", category: "Manufacturing", description: "Move injection molds from Asia to Mexico.", cost: "$150K", time: "45 days", reduction: 90, feasibility: 75, composite: 82, tradeOff: "Long lead time, capex required.", cashFlow: "-$150K CapEx", status: "Active" },
    { id: 6, action: "Component Substitution", category: "Engineering", description: "Qualify alternate passives from Murata.", cost: "$10K NRE", time: "21 days", reduction: 85, feasibility: 95, composite: 89, tradeOff: "Requires engineering validation.", cashFlow: "Minimal", status: "Active" }
  ];

  const displayLibrary = library.length > 0 ? library : fallbackLibrary;

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 1200 }}>
      {/* Overview stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        {[
          ["Active Mitigations", String(displayLibrary.length), C.brand],
          ["Archived Strategies", "85", C.textMid],
          ["Avg Risk Reduction", "68%", C.success],
          ["Simulated Outcomes", "1,204", C.text]
        ].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, background: C.card, borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.border} ` }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: c, fontFamily: "'Fira Code',sans-serif", letterSpacing: "-0.03em" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border} ` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Mitigation Library</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "6px 12px", border: `1px solid ${C.border} `, borderRadius: 8, background: C.bg, fontSize: 12, color: C.textMid, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Icons.FileText /> Filter</button>
            <button style={{ padding: "6px 12px", border: "none", borderRadius: 8, background: C.brand, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>+ New Strategy</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayLibrary.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border} ` }}>
              <div style={{ flex: 1.5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.action}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.status === "Active" ? C.successLight : "#E2E8F0", color: p.status === "Active" ? C.success : C.textMid }}>{p.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>{p.description}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textLight }}>
                  <span><strong style={{ color: C.textMid }}>Category:</strong> {p.category}</span>
                  <span><strong style={{ color: C.textMid }}>Trade-off:</strong> {p.tradeOff}</span>
                </div>

                {/* Collapsible Reasoning Trace snippet for Playbook */}
                {p.reasoningTrace && p.reasoningTrace.length > 0 && (
                  <details style={{ marginTop: 10, background: C.card, padding: "10px 14px", borderRadius: 6, border: `1px solid ${C.border} `, fontFamily: "monospace", fontSize: 11, color: C.textMid, lineHeight: 1.5, cursor: "pointer", outline: "none" }}>
                    <summary style={{ fontWeight: 700, color: C.brand, marginBottom: 4, letterSpacing: "0.02em", outline: "none", userSelect: "none" }}>[+] Simulation Reasoning : Expand Steps</summary>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {p.reasoningTrace.map((step, idx) => {
                        const [label, ...rest] = step.split(":");
                        return (
                          <div key={idx} style={{ display: "flex", gap: 8 }}>
                            <span style={{ color: C.text, fontWeight: 700, whiteSpace: "nowrap" }}>{label}:</span>
                            <span>{rest.join(":")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
              <div style={{ display: "flex", gap: 24, flexShrink: 0, paddingLeft: 16, borderLeft: `1px dashed ${C.border} ` }}>
                {[["Cost", p.cost], ["Time", p.time], ["Score", p.composite]].map(([k, v]) => (
                  <div key={k} style={{ textAlign: "center", minWidth: 40 }}>
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: k === "Score" ? C.brand : C.text, fontFamily: "'Sora',sans-serif" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div >
  );
}

// ─── SUPPLIER MAP PAGE ────────────────────────────────────────────────────────
function SuppliersPage({ globalSuppliers, currentProfile }) {
  const pinsToUse = globalSuppliers && globalSuppliers.length > 0 ? globalSuppliers : SUPPLIER_MAP_PINS;
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    const corridors = currentProfile?.logisticsCorridors || ["Taiwan Strait", "Red Sea", "Trans-Pacific"];
    getMaritimeWarnings(corridors).then(count => {
      setWarningCount(count);
    });
  }, [currentProfile]);

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 1200 }}>
      {/* Map header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Global Network Exposure</div>
          <div style={{ fontSize: 13, color: C.textMid }}>{pinsToUse.length} active critical nodes detected across 3 continents.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["All Suppliers", "Critical Risk", "Tier 1 Only"].map((f, i) => (
            <button key={f} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${i === 1 ? C.brand : C.border} `, background: i === 1 ? C.brandLight : C.card, color: i === 1 ? C.brand : C.textMid, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{f}</button>
          ))}
        </div>
      </div>

      {/* 3D WebGL Globe Container */}
      <div style={{ borderRadius: 16, height: 480, position: "relative", overflow: "hidden", border: `1px solid rgb(51, 65, 85)`, background: "#050B14", display: "flex", alignItems: "center", justifyContent: "center" }}>

        <div style={{ position: "absolute", top: 20, left: 20, background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(4px)", padding: "12px 16px", borderRadius: 10, border: `1px solid rgb(51, 65, 85)`, zIndex: 10, pointerEvents: "none" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8, letterSpacing: "0.05em", fontFamily: "'Fira Code', monospace" }}>[ OSINT MAP LEGEND ]</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[["Critical", C.critical], ["High", C.high], ["Medium", C.medium], ["Low", C.success]].map(([l, c]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#E2E8F0", fontFamily: "'Fira Code', monospace" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c} 88` }} /> {l} Risk
              </div>
            ))}
          </div>
        </div>

        <Map
          initialViewState={{ longitude: 0, latitude: 20, zoom: 1.5 }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          attributionControl={false}
        >
          {pinsToUse.map(pin => {
            const baseRisk = Number(pin.risk || pin.risk_score);
            const maritimePenalty = Math.min(15, warningCount * 5);
            const adjustedRisk = Math.min(100, baseRisk + maritimePenalty);
            const threatColor = warningCount >= 3 ? C.critical : (warningCount > 0 ? C.medium : C.success);

            return (
              <Marker key={pin.id} longitude={Number(pin.lng)} latitude={Number(pin.lat)} anchor="center">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", pointerEvents: "auto" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: threatColor + "40", display: "flex", alignItems: "center", justifyContent: "center", animation: "pingAnim 2s infinite" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: threatColor, border: "2px solid white", boxShadow: "0 2px 4px rgba(0,0,0,0.5)" }} />
                  </div>
                  <div style={{ background: "rgba(15, 23, 42, 0.9)", padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, color: "#E2E8F0", marginTop: 4, whiteSpace: "nowrap", border: "1px solid rgb(51, 65, 85)", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Fira Code', monospace" }}>
                    <span>{pin.name} • {adjustedRisk}</span>
                    {warningCount > 0 && (
                      <span style={{ background: threatColor, color: "white", padding: "2px 5px", borderRadius: 4, fontSize: 9 }}>
                        ⚓ {warningCount} Warnings
                      </span>
                    )}
                  </div>
                </div>
              </Marker>
            );
          })}
        </Map>
      </div>

      {/* Supplier List Below */}
      <div style={{ marginTop: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: C.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border} ` }}>
          <thead style={{ background: C.bg }}>
            <tr>{["Supplier", "Commodity", "Risk Score", "Status", "Coordinates"].map(h => (
              <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: C.textLight, textAlign: "left", letterSpacing: "0.04em", borderBottom: `1px solid ${C.border} ` }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {pinsToUse.map(pin => (
              <tr key={pin.id} style={{ borderBottom: `1px solid #F1F5F9` }}>
                <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 700, color: C.text }}>{pin.name}</td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: C.textMid }}>{pin.commodity}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 800, color: getRiskColor(Math.min(100, Number(pin.risk || pin.risk_score) + Math.min(15, warningCount * 5))), fontFamily: "'Sora',sans-serif" }}>{Math.min(100, Number(pin.risk || pin.risk_score) + Math.min(15, warningCount * 5))}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: getRiskColor(Math.min(100, Number(pin.risk || pin.risk_score) + Math.min(15, warningCount * 5))) + "20", color: getRiskColor(Math.min(100, Number(pin.risk || pin.risk_score) + Math.min(15, warningCount * 5))) }}>{(pin.status || 'unknown').toUpperCase()}</span>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 12, color: C.textLight, fontFamily: "monospace" }}>{Number(pin.lat).toFixed(2)}, {Number(pin.lng).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────
function AuditPage({ globalAuditLogs }) {
  const logsToUse = globalAuditLogs && globalAuditLogs.length > 0 ? globalAuditLogs : AUDIT_LOG_MOCK;

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 1200 }}>
      <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
        {[["Analyses Run", logsToUse.length.toString(), C.brand], ["Escalations", logsToUse.filter(l => l.disruptions?.escalated || l.escalated).length.toString(), C.critical], ["HITL Actions", logsToUse.filter(l => l.action).length.toString(), C.success], ["FP Rate", "12%", C.success]].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, background: C.card, borderRadius: 12, padding: "18px 20px", border: `1px solid ${C.border} ` }}>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: c, fontFamily: "'Fira Code',sans-serif", letterSpacing: "-0.03em" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, borderRadius: 12, padding: "20px 22px", border: `1px solid ${C.border} ` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 16, fontFamily: "'Sora',sans-serif" }}>Immutable Audit Trail</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["ID", "Time", "Action", "Supplier", "Region", "Risk", "Confidence", "Tier", "Escalated"].map(h => (
              <th key={h} style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: C.textLight, textAlign: "left", letterSpacing: "0.05em", borderBottom: `1px solid ${C.border} ` }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {logsToUse.map(r => {
              const objId = r.id || r.disruption_id?.slice(0, 8);
              const ts = r.created_at ? new Date(r.created_at).toLocaleString() : r.ts;

              const supplier = r.disruptions?.supplier || r.supplier || "-";
              const region = r.disruptions?.region || r.region || "-";
              const risk = r.disruptions?.risk_score || r.risk || 0;
              const confidence = r.disruptions?.confidence_score || r.confidence || 0;
              const tier = r.disruptions?.cost_of_delay_tier || r.tier || 1;
              const escalated = r.disruptions?.escalated || r.escalated || false;

              const actionName = (r.action || r.event_type || "SYSTEM LOG").replace(/_/g, " ").toUpperCase();

              return (
                <tr key={r.id} style={{ borderBottom: `1px solid #F8FAFC` }}>
                  <td style={{ padding: "12px", fontSize: 12, fontWeight: 600, color: C.brand, fontFamily: "monospace" }}>{objId.toString().slice(0, 8)}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: C.textMid }}>{ts}</td>
                  <td style={{ padding: "12px", fontSize: 11, fontWeight: 700, color: C.accent }}>{actionName}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: C.text }}>{supplier}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: C.textMid }}>{region}</td>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 800, color: getRiskColor(risk), fontFamily: "'Fira Code',sans-serif" }}>{risk}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: C.text }}>{confidence}%</td>
                  <td style={{ padding: "12px", fontSize: 12, fontWeight: 700, color: tier >= 3 ? C.critical : C.high }}>T{tier} ({getTierLabel(tier)})</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: escalated ? C.critical : C.success, padding: "3px 10px", background: escalated ? C.criticalLight : C.successLight, borderRadius: 999 }}>{escalated ? <><Icons.AlertTriangle /> YES</> : <><Icons.CheckCircle /> NO</>}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({ currentProfile, setCurrentProfile }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(JSON.stringify(currentProfile, null, 2));
  }, [currentProfile, editing]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft);
      setCurrentProfile(parsed);
      setEditing(false);
    } catch (e) {
      alert("Invalid JSON format. Please correct it before saving.");
    }
  };

  return (
    <div style={{ padding: "26px 28px", fontFamily: "'DM Sans',sans-serif", maxWidth: 800 }}>
      <div style={{ background: C.card, borderRadius: 12, padding: "24px", border: `1px solid ${C.border} ` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Manufacturer Context Profile</div>
            <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>This JSON context grounds the AI risk engine's logic (Hyper-Personalization).</div>
          </div>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border} `, background: C.card, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit JSON</button>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditing(false); setDraft(JSON.stringify(currentProfile, null, 2)); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border} `, background: C.card, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.brand, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Profile</button>
            </div>
          )}
        </div>

        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: "100%", height: 350, padding: "16px", borderRadius: 8, border: `1px solid ${C.brandMid} `, background: C.bg, fontFamily: "monospace", fontSize: 12, color: C.text, resize: "vertical", outline: "none" }}
          />
        ) : (
          <div style={{ width: "100%", height: 350, overflowY: "auto", padding: "16px", borderRadius: 8, border: `1px solid ${C.border} `, background: C.bg, fontFamily: "monospace", fontSize: 12, color: C.text, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(currentProfile, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function NexusApp() {
  const [page, setPage] = useState("monitor");
  const [focusAlert, setFocusAlert] = useState(null);

  // Real data state
  const [globalAlerts, setGlobalAlerts] = useState([]);
  const [globalSuppliers, setGlobalSuppliers] = useState([]);
  const [globalAuditLogs, setGlobalAuditLogs] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(MANUFACTURER);
  const [loading, setLoading] = useState(true);

  // Fetch from supabase logic
  useEffect(() => {
    async function loadData() {
      // getDisruptionHistory returns recently created disruptions from db
      const [data, suppliersData, auditData] = await Promise.all([
        getDisruptionHistory(50),
        getSuppliers(),
        getAuditLogs(100)
      ]);

      if (suppliersData && suppliersData.length > 0) {
        setGlobalSuppliers(suppliersData);
      }

      if (auditData && auditData.length > 0) {
        setGlobalAuditLogs(auditData);
      }

      // map the db fields back to the structure the UI mock expects
      if (data && data.length > 0) {
        const mappedData = data.map(d => ({
          ...d,
          // map fields
          id: d.signal_id || d.id,
          severity: d.risk_score >= 75 ? 'critical' : d.risk_score >= 50 ? 'high' : 'medium',
          riskScore: d.risk_score || 0,
          confidenceScore: d.confidence_score || 0,
          revenueAtRisk: d.revenue_at_risk || '-',
          costOfDelayTier: d.cost_of_delay_tier || 1,
          daysToStockout: d.raw_signal?.daysToStockout || 15,
          detectedAt: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " ago",
          escalate: d.escalated,
          summary: d.raw_signal?.summary || "No summary available for this disruption.",
          openPOs: d.raw_signal?.openPOs || "Unknown",
          bomImpact: d.raw_signal?.bomImpact || "Unknown",
          playbook: d.playbook || []
        }));
        setGlobalAlerts(mappedData);
      } else {
        // Fallback to moc if db is totally empty so app doesnt break visually
        setGlobalAlerts(ACTIVE_ALERTS);
      }
      setLoading(false);
    }

    loadData();

    // Setup realtime sub just to reload if changes happen
    const unsubPromise = subscribeToDisruptions(() => {
      loadData();
    });

    return () => {
      unsubPromise.then(unsub => unsub && unsub());
    }
  }, []);

  const handleViewAlert = (alert) => { setFocusAlert(alert); setPage("analysis"); };
  const handleAnalyze = (alert) => { setFocusAlert(alert); setPage("analysis"); };

  const PAGE_META = {
    monitor: { title: "Live Disruption Monitor", subtitle: `${MANUFACTURER.name} · ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ` },
    analysis: { title: "Risk Analysis & Playbook", subtitle: "Full 11-step OSIRIS workflow output" },
    playbook: { title: "Playbook Library", subtitle: "Historical mitigations and outcomes" },
    suppliers: { title: "Supplier Risk Map", subtitle: "Global supplier exposure overview" },
    audit: { title: "Audit Log", subtitle: "Immutable governance record · HITL override tracking" },
    settings: { title: "Settings & Context", subtitle: "Manage your AI context and hyper-personalization parameters" },
  };

  const meta = PAGE_META[page] || { title: "OSIRIS", subtitle: "" };

  return (
    <>
      <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
        * { box- sizing: border - box; margin: 0; padding: 0;
}
        body { background: #FAF5FF; font - family: 'Fira Sans', system - ui, sans - serif; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pingAnim { 0 % { transform: scale(1); opacity: .8; } 75 %, 100 % { transform: scale(2.4); opacity: 0; } }
@keyframes pulseAnim { 0 %, 100 % { opacity: 1; } 50 % { opacity: 0.5; } }
@keyframes spin { 100 % { transform: rotate(360deg); } }
        button { font - family: 'Fira Sans', system - ui, sans - serif; }
        :: -webkit - scrollbar { width: 5px; height: 5px; }
        :: -webkit - scrollbar - thumb { background: #E9D5FF; border - radius: 99px; }
`}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar page={page} setPage={setPage} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: C.bg, height: "100vh", overflow: "hidden" }}>
          <Topbar title={meta.title} subtitle={meta.subtitle} />

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: C.textMid, fontFamily: "'Fira Code',sans-serif" }}>
              Connecting to global supply network...
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* the pages need globalAlerts now instead of relying directly on ACTIVE_ALERTS */}
              {page === "monitor" && <MonitorPage onAnalyze={handleAnalyze} globalAlerts={globalAlerts} />}
              {page === "analysis" && <AnalysisPage focusAlert={focusAlert} globalAlerts={globalAlerts} currentProfile={currentProfile} />}
              {page === "playbook" && <PlaybookPage globalAlerts={globalAlerts} />}
              {page === "suppliers" && <SuppliersPage globalSuppliers={globalSuppliers} currentProfile={currentProfile} />}
              {page === "audit" && <AuditPage globalAuditLogs={globalAuditLogs} />}
              {page === "settings" && <SettingsPage currentProfile={currentProfile} setCurrentProfile={setCurrentProfile} />}
            </div>
          )}
        </div>
      </div>

      {!loading && <AlertWidget onViewDashboard={handleViewAlert} globalAlerts={globalAlerts} />}
    </>
  );
}
