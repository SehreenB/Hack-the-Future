import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getDisruptionHistory, subscribeToDisruptions, getSuppliers, writeAuditLog, getAuditLogs, getProfiles, saveProfile, getActiveProfileId, setActiveProfileId } from "./services/supabaseService";
import { getSupplierFinancialHealth } from "./services/financialHealthService";
import { getMaritimeWarnings } from "./services/maritimeIntelService";
import { getSituationForecast } from "./services/llmForecastService";
import { buildCallScript, generateCallScriptAudio } from "./services/communicationService";
import Map, { Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const C = {
  // ── Brand palette ──────────────────────────────────────────────
  brand: "#FEC502",           // School Bus Yellow
  brandLight: "rgba(254,197,2,0.12)",
  brandMid: "#d4a500",
  accent: "#30BCED",           // Bright Sky
  accentLight: "rgba(48,188,237,0.12)",
  critical: "#D36135",         // Spicy Paprika
  criticalLight: "rgba(211,97,53,0.10)",
  criticalBorder: "#D36135",
  high: "#A63C06",             // Rust Brown
  highLight: "rgba(166,60,6,0.10)",
  highBorder: "#A63C06",
  medium: "#FEC502",
  mediumLight: "rgba(254,197,2,0.12)",
  mediumBorder: "#FEC502",
  success: "#30BCED",
  successLight: "rgba(48,188,237,0.10)",
  // ── White UI ──────────────────────────────────────────────────
  text: "#0D1C2B",
  textMid: "#3A5068",
  textLight: "#4A6278",
  border: "rgba(0,0,0,0.09)",
  bg: "#FFFFFF",
  card: "#F6F8FA",
  sidebar: "#12263A",
  sidebarHover: "rgba(254,197,2,0.08)",
  sidebarActive: "rgba(254,197,2,0.15)",
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

const RHEINWERK_PROFILE = {
  name: "Rheinwerk Automotive GmbH",
  industry: "Automotive Parts Manufacturing",
  dailyRevenue: "$524K",
  sites: ["Stuttgart, DE", "Munich, DE", "Prague, CZ"],
  logisticsCorridors: ["Suez Canal", "Rhine Corridor", "Mediterranean Sea"],
  geopoliticalRisks: { Germany: 5, China: 30, Turkey: 20, Poland: 10, UAE: 15 },
  escalationContacts: [
    { role: "Ops Lead", name: "Hans Weber", phone: "+49-151-555-0142" },
    { role: "Procurement Director", name: "Ingrid Müller", phone: "+49-151-555-0198" },
    { role: "CFO", name: "Dr. Klaus Hoffmann", phone: "+49-151-555-0201" },
  ],
  supplierConcentrationRisk: "High — 68% of polymer inputs from single BASF facility",
  leadTimeSensitivity: "Critical — 4 day buffer on specialty steel components",
  inventoryPolicy: "21-day safety stock on Tier-1 components"
};

const MONTERREY_PROFILE = {
  name: "Grupo Monterrey Industrial",
  industry: "Industrial Components Manufacturing",
  dailyRevenue: "$187K",
  sites: ["Monterrey, MX", "Guadalajara, MX", "El Paso, TX"],
  logisticsCorridors: ["US-Mexico Border", "Gulf of Mexico", "Trans-Pacific"],
  geopoliticalRisks: { Mexico: 20, USA: 10, China: 15, Brazil: 10, Canada: 5 },
  escalationContacts: [
    { role: "Ops Lead", name: "Carlos Reyes", phone: "+52-81-555-0142" },
    { role: "Procurement Director", name: "Sofia Mendoza", phone: "+52-81-555-0198" },
    { role: "CFO", name: "Alejandro Torres", phone: "+52-81-555-0201" },
  ],
  supplierConcentrationRisk: "Low — diversified across 12 approved Tier-1 suppliers",
  leadTimeSensitivity: "Moderate — 14 day buffer on most components",
  inventoryPolicy: "35-day safety stock — conservative buffer strategy"
};

const PROFILES = [MANUFACTURER, RHEINWERK_PROFILE, MONTERREY_PROFILE];

const DEMO_ACCOUNTS = [
  { email: "Northstar@example.com", password: "Test1234!", profile: MANUFACTURER },
  { email: "Rheinwerk@example.com", password: "Test1234!", profile: RHEINWERK_PROFILE },
  { email: "Grupo@example.com", password: "Test1234!", profile: MONTERREY_PROFILE },
];

const ACTIVE_ALERTS = [
  {
    id: "OSR-001", severity: "critical", riskScore: 87, confidenceScore: 91,
    title: "Taiwan Strait Corridor Closure",
    supplier: "TSMC / Hon Hai", region: "Taiwan / East Asia", commodity: "Semiconductors",
    revenueAtRisk: "$4.2M", costOfDelayTier: 4, daysToStockout: 8, detectedAt: "2 min ago",
    escalate: true,
    summary: "Escalating military activity near the Taiwan Strait has triggered force majeure declarations across 3 Tier-1 semiconductor suppliers. Freightos spot rates on transpacific lanes are up 340% in 48 hours. Critical SKUs SKU-4421 and SKU-4422 have only 8 days of safety stock remaining.",
    openPOs: "PO-8821 ($1.2M), PO-8834 ($640K)",
    bomImpact: "SKU-4421, SKU-4422 — 34% of active BOM",
  },
  {
    id: "OSR-002", severity: "high", riskScore: 72, confidenceScore: 84,
    title: "Red Sea Rerouting — Transit +14 Days",
    supplier: "Multiple EU Suppliers", region: "Suez Corridor", commodity: "Automotive Parts",
    revenueAtRisk: "$1.8M", costOfDelayTier: 3, daysToStockout: 18, detectedAt: "18 min ago",
    escalate: true,
    summary: "Houthi attacks have forced Maersk, MSC, and CMA CGM to suspend Red Sea transit. Cape of Good Hope rerouting adds 14 days and $85K per voyage. Cumulative freight premium estimated at $340K for open POs.",
    openPOs: "PO-8842 ($890K)",
    bomImpact: "SKU-5891 — 18% of active BOM",
  },
  {
    id: "OSR-003", severity: "medium", riskScore: 54, confidenceScore: 76,
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
  { id: "OSR-001", ts: "10:42 AM", supplier: "TSMC / Hon Hai", region: "Taiwan", risk: 87, confidence: 91, tier: 4, escalated: true },
  { id: "OSR-002", ts: "10:26 AM", supplier: "Multiple EU", region: "Suez", risk: 72, confidence: 84, tier: 3, escalated: true },
  { id: "OSR-003", ts: "09:44 AM", supplier: "BASF Corp", region: "Gulf Coast", risk: 54, confidence: 76, tier: 3, escalated: false },
];

const PINS_NORTHSTAR = [
  // Critical
  { id: "SUP-001", name: "TSMC Taiwan", lat: 24.15, lng: 120.67, risk: 87, commodity: "Semiconductors", status: "critical", tier: 1 },
  { id: "SUP-002", name: "Hon Hai Shenzhen", lat: 22.32, lng: 114.17, risk: 82, commodity: "PCB Assembly", status: "critical", tier: 1 },
  { id: "SUP-014", name: "Yangtze Memory", lat: 30.59, lng: 114.30, risk: 79, commodity: "NAND Flash", status: "critical", tier: 1 },
  // High
  { id: "SUP-006", name: "Samsung Kiheung", lat: 37.23, lng: 127.10, risk: 68, commodity: "DRAM", status: "high", tier: 1 },
  { id: "SUP-007", name: "SK Hynix Icheon", lat: 37.28, lng: 127.44, risk: 63, commodity: "Memory", status: "high", tier: 1 },
  { id: "SUP-008", name: "Nidec Kyoto", lat: 35.01, lng: 135.75, risk: 61, commodity: "Motors", status: "high", tier: 2 },
  { id: "SUP-015", name: "Foxconn Zhengzhou", lat: 34.74, lng: 113.62, risk: 71, commodity: "Final Assembly", status: "high", tier: 1 },
  // Medium
  { id: "SUP-003", name: "BASF Gulf Coast", lat: 28.98, lng: -95.37, risk: 54, commodity: "Polymers", status: "medium", tier: 1 },
  { id: "SUP-009", name: "Corning Ithaca", lat: 42.09, lng: -76.80, risk: 48, commodity: "Display Glass", status: "medium", tier: 2 },
  { id: "SUP-010", name: "Celestica Toronto", lat: 43.70, lng: -79.42, risk: 43, commodity: "EMS", status: "medium", tier: 2 },
  { id: "SUP-013", name: "Jabil Singapore", lat: 1.35, lng: 103.82, risk: 50, commodity: "EMS", status: "medium", tier: 2 },
  { id: "SUP-016", name: "TE Connectivity Bern", lat: 46.95, lng: 7.45, risk: 37, commodity: "Connectors", status: "medium", tier: 2 },
  // Low
  { id: "SUP-004", name: "Murata Nagaokakyo", lat: 35.01, lng: 135.77, risk: 18, commodity: "Passives", status: "low", tier: 2 },
  { id: "SUP-005", name: "Flex Ltd Guadalajara", lat: 20.66, lng: -103.35, risk: 22, commodity: "Assembly", status: "low", tier: 2 },
  { id: "SUP-011", name: "Amphenol Wallingford", lat: 41.45, lng: -72.82, risk: 15, commodity: "Connectors", status: "low", tier: 2 },
  { id: "SUP-012", name: "Vishay Malvern", lat: 40.03, lng: -75.51, risk: 19, commodity: "Passives", status: "low", tier: 2 },
];

const PINS_RHEINWERK = [
  // Critical
  { id: "SUP-R01", name: "Stuttgart Assembly", lat: 48.77, lng: 9.18, risk: 88, commodity: "Final Assembly", status: "critical", tier: 1 },
  { id: "SUP-R02", name: "BASF Freeport", lat: 28.98, lng: -95.37, risk: 85, commodity: "Polymers", status: "critical", tier: 1 },
  { id: "SUP-R10", name: "Suez Transit Node", lat: 30.10, lng: 32.90, risk: 91, commodity: "Logistics", status: "critical", tier: 2 },
  // High
  { id: "SUP-R03", name: "Istanbul Metals Hub", lat: 41.00, lng: 28.97, risk: 65, commodity: "Metals", status: "high", tier: 2 },
  { id: "SUP-R11", name: "Linamar Guelph", lat: 43.55, lng: -80.25, risk: 67, commodity: "Drivetrain Parts", status: "high", tier: 1 },
  { id: "SUP-R12", name: "Schaeffler Herzogenaurach", lat: 49.57, lng: 10.88, risk: 62, commodity: "Bearings", status: "high", tier: 1 },
  { id: "SUP-R13", name: "Gestamp Bilbao", lat: 43.26, lng: -2.93, risk: 58, commodity: "Stamped Steel", status: "high", tier: 1 },
  // Medium
  { id: "SUP-R04", name: "Prague Electronics", lat: 50.07, lng: 14.43, risk: 42, commodity: "Electronics", status: "medium", tier: 1 },
  { id: "SUP-R07", name: "Visteon Kerpen", lat: 50.87, lng: 6.69, risk: 40, commodity: "Cockpit Electronics", status: "medium", tier: 2 },
  { id: "SUP-R08", name: "Mahle Stuttgart", lat: 48.79, lng: 9.19, risk: 35, commodity: "Engine Filtration", status: "medium", tier: 2 },
  { id: "SUP-R14", name: "Hella Lippstadt", lat: 51.67, lng: 8.35, risk: 46, commodity: "Lighting/Sensors", status: "medium", tier: 2 },
  // Low
  { id: "SUP-R05", name: "ZF Warsaw Plant", lat: 52.23, lng: 21.01, risk: 20, commodity: "Transmission", status: "low", tier: 1 },
  { id: "SUP-R06", name: "Continental Timisoara", lat: 45.75, lng: 21.23, risk: 22, commodity: "Tires & Sensors", status: "low", tier: 2 },
  { id: "SUP-R09", name: "Bosch Brno Campus", lat: 49.19, lng: 16.61, risk: 17, commodity: "Fuel Systems", status: "low", tier: 2 },
  { id: "SUP-R15", name: "Wabco Brussels", lat: 50.85, lng: 4.35, risk: 14, commodity: "Brake Systems", status: "low", tier: 2 },
];

const PINS_MONTERREY = [
  // Critical
  { id: "SUP-M03", name: "El Paso Crossing", lat: 31.76, lng: -106.48, risk: 82, commodity: "Logistics", status: "critical", tier: 1 },
  { id: "SUP-M08", name: "Laredo Border Gate", lat: 27.50, lng: -99.50, risk: 77, commodity: "Cross-Border Transport", status: "critical", tier: 1 },
  // High
  { id: "SUP-M04", name: "Gulf Port Houston", lat: 29.76, lng: -95.37, risk: 65, commodity: "Shipping", status: "high", tier: 2 },
  { id: "SUP-M05", name: "Panama Canal Transit", lat: 9.10, lng: -79.60, risk: 72, commodity: "Shipping", status: "high", tier: 2 },
  { id: "SUP-M09", name: "Maquiladora Juárez", lat: 31.69, lng: -106.42, risk: 68, commodity: "Electronics Assembly", status: "high", tier: 1 },
  { id: "SUP-M10", name: "Nemak Monterrey", lat: 25.72, lng: -100.31, risk: 61, commodity: "Aluminum Casting", status: "high", tier: 1 },
  // Medium
  { id: "SUP-M01", name: "Monterrey HQ", lat: 25.68, lng: -100.31, risk: 45, commodity: "Final Assembly", status: "medium", tier: 1 },
  { id: "SUP-M02", name: "Guadalajara Mfg", lat: 20.65, lng: -103.34, risk: 38, commodity: "Components", status: "medium", tier: 1 },
  { id: "SUP-M06", name: "Querétaro Aerospace", lat: 20.60, lng: -100.39, risk: 44, commodity: "Precision Parts", status: "medium", tier: 2 },
  { id: "SUP-M11", name: "São Paulo Supplier", lat: -23.55, lng: -46.63, risk: 52, commodity: "Steel Components", status: "medium", tier: 2 },
  { id: "SUP-M12", name: "Bogotá Distribution", lat: 4.71, lng: -74.07, risk: 47, commodity: "Distribution Hub", status: "medium", tier: 2 },
  // Low
  { id: "SUP-M07", name: "Saltillo Plant", lat: 25.42, lng: -101.00, risk: 28, commodity: "Plastics", status: "low", tier: 1 },
  { id: "SUP-M13", name: "Santiago Chile Ops", lat: -33.45, lng: -70.67, risk: 21, commodity: "Copper Wiring", status: "low", tier: 2 },
  { id: "SUP-M14", name: "Lima Logistics", lat: -12.04, lng: -77.03, risk: 18, commodity: "Port Services", status: "low", tier: 2 },
  { id: "SUP-M15", name: "Buenos Aires Hub", lat: -34.61, lng: -58.38, risk: 24, commodity: "Warehousing", status: "low", tier: 2 },
];

const SIMULATED_WORLD_IMPACTS = [
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
  Phone: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>,
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
function AlertWidget({ onViewDashboard, globalAlerts, chatOpen }) {
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
    <div style={{ position: "fixed", bottom: 28, right: chatOpen ? 348 : 28, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "'Space Grotesk',system-ui,sans-serif", transition: "right 0.3s ease" }}>

      {/* ── COLLAPSED PILL ── */}
      {!expanded && (
        <button onClick={() => { setExpanded(true); setPulse(false); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", borderRadius: 8, background: "#0D1C2B", border: `1.5px solid ${cfg.color}`, cursor: "pointer", boxShadow: `0 4px 24px ${cfg.color}30`, animation: "fadeUp 0.3s ease" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0, position: "relative", display: "inline-block" }}>
            {pulse && <span style={{ position: "absolute", inset: -4, borderRadius: "50%", background: cfg.color + "40", animation: "pingAnim 1.6s ease-out infinite" }} />}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", fontFamily: "'Space Grotesk',sans-serif" }}>{critCount} Critical Alert{critCount !== 1 ? "s" : ""} Detected</span>
          <span style={{ width: 22, height: 22, borderRadius: 4, background: cfg.color, color: "white", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{alertsToUse.length}</span>
        </button>
      )}

      {/* ── EXPANDED PANEL ── */}
      {expanded && (
        <div style={{ width: 390, background: "#0D1C2B", borderRadius: 12, boxShadow: "0 16px 56px rgba(0,0,0,0.5)", border: `1px solid rgba(254,197,2,0.15)`, overflow: "hidden", animation: "fadeUp 0.22s ease" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid rgba(254,197,2,0.1)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#12263A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.brand, fontFamily: "'Space Mono',monospace", letterSpacing: "0.08em" }}>OSIRIS</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 1, letterSpacing: "0.05em" }}>SUPPLY DISRUPTION CO-PILOT</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: cfg.color + "20", color: cfg.color, fontFamily: "'Space Mono',monospace" }}>{alertsToUse.length} ACTIVE</span>
              <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1, padding: 3 }}>✕</button>
            </div>
          </div>

          {/* Alert list */}
          <div style={{ borderBottom: `1px solid rgba(254,197,2,0.08)`, maxHeight: 160, overflowY: "auto" }}>
            {alertsToUse.map(a => {
              const c = SEV_CFG[a.severity] || SEV_CFG.medium;
              const isActive = active.id === a.id;
              return (
                <button key={a.id} onClick={() => setActive(a)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: `3px solid ${isActive ? c.color : "transparent"}`, cursor: "pointer", background: isActive ? c.bg : "transparent", textAlign: "left", fontFamily: "'Space Grotesk',sans-serif" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#FFFFFF" }}>{a.title}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, fontFamily: "'Space Mono',monospace" }}>{c.label.toUpperCase()}</span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{a.detectedAt}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active detail */}
          <div style={{ margin: "12px", borderRadius: 8, padding: "14px 15px", background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.3, marginBottom: 3 }}>{active.title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{active.supplier} · {active.region}</div>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: cfg.color, color: "white", fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10, fontFamily: "'Space Mono',monospace" }}>{active.riskScore}</div>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: "8px 0 12px" }}>{active.summary.slice(0, 160)}...</p>
            <div style={{ display: "flex", gap: 18 }}>
              {[["Revenue at Risk", active.revenueAtRisk, cfg.color], ["Confidence", `${active.confidenceScore}%`, "#FFFFFF"], ["Days to Stockout", `${active.daysToStockout}d`, active.daysToStockout < 10 ? C.critical : C.high]].map(([l, v, c]) => (
                <div key={l}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Space Mono',monospace" }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "'Space Mono',monospace" }}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: `1px solid rgba(254,197,2,0.08)` }}>
            <button onClick={() => setDismissed(true)} style={{ flex: 1, padding: "9px", borderRadius: 6, border: `1px solid rgba(255,255,255,0.1)`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}>Dismiss</button>
            <button onClick={() => { onViewDashboard(active); setExpanded(false); }}
              style={{ flex: 2, padding: "9px 14px", borderRadius: 6, border: "none", background: cfg.color, color: cfg.color === C.brand ? "#12263A" : "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}>
              View Full Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TICKER TAPE ──────────────────────────────────────────────────────────────
function TickerTape({ alerts }) {
  const items = (alerts && alerts.length > 0 ? alerts : [{ id: 'NXS-001', title: 'Taiwan Strait Corridor Closure', commodity: 'Semiconductors' }, { id: 'NXS-002', title: 'Red Sea Rerouting — Transit +14 Days', commodity: 'Automotive Parts' }, { id: 'NXS-003', title: 'BASF Freeport Plant Explosion', commodity: 'Specialty Polymers' }])
    .map(a => `${a.id} ── ${a.title} ── ${a.commodity}`);
  const doubled = [...items, ...items, ...items, ...items];
  return (
    <div style={{ height: 34, background: C.brand, overflow: 'hidden', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ flexShrink: 0, padding: '0 20px', fontSize: 10, fontWeight: 900, color: '#12263A', fontFamily: "'Space Mono',monospace", letterSpacing: '0.12em', borderRight: '2px solid rgba(18,38,58,0.2)', height: '100%', display: 'flex', alignItems: 'center' }}>LIVE FEED</div>
      <div style={{ overflow: 'hidden', flex: 1 }}>
        <div style={{ display: 'flex', gap: 80, animation: 'ticker 40s linear infinite', width: 'max-content' }}>
          {doubled.map((item, i) => (
            <span key={i} style={{ color: '#12263A', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '0.02em' }}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, currentProfile, setCurrentProfile }) {
  const nav = [
    { id: "monitor", abbr: "MON", label: "Live Monitor" },
    { id: "analysis", abbr: "RISK", label: "Risk Analysis" },
    { id: "playbook", abbr: "PLAY", label: "Playbook" },
    { id: "suppliers", abbr: "MAP", label: "Supplier Map" },
    { id: "audit", abbr: "LOG", label: "Audit Log" },
    { id: "settings", abbr: "SET", label: "Settings" },
  ];

  return (
    <aside style={{ width: 228, minWidth: 228, background: C.sidebar, display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, fontFamily: "'Space Grotesk',system-ui,sans-serif", borderRight: "1px solid rgba(254,197,2,0.1)" }}>
      {/* Brand */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid rgba(254,197,2,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Eye of Osiris logo — mix-blend-mode:screen removes black bg */}
          <div style={{ width: 48, height: 48, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img
              src="/osiris-eye-logo.jpg"
              alt="OSIRIS"
              style={{ width: 52, height: 52, objectFit: "cover", mixBlendMode: "screen", filter: "brightness(1.05) saturate(1.1)" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.brand, letterSpacing: "0.1em", fontFamily: "'Space Mono',monospace" }}>OSIRIS</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em", marginTop: 1, fontFamily: "'Space Mono',monospace" }}>SUPPLY CO-PILOT</div>
          </div>
        </div>
      </div>

      {/* Active Profile — shows only the signed-in user's profile */}
      <div style={{ padding: "14px 12px", borderBottom: "1px solid rgba(254,197,2,0.08)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", marginBottom: 6, paddingLeft: 8, fontFamily: "'Space Mono',monospace" }}>ACTIVE PROFILE</div>
        <div style={{ width: "100%", padding: "9px 10px", borderLeft: `3px solid ${C.brand}`, background: C.brandLight }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, letterSpacing: "0.01em" }}>{currentProfile.name}</div>
          <div style={{ fontSize: 9, color: "rgba(254,197,2,0.55)", marginTop: 2 }}>{currentProfile.industry}</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {nav.map(item => {
          const navIcons = {
            monitor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
            analysis: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
            playbook: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
            suppliers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
            audit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
            settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
          };
          return (
            <button key={item.id} onClick={() => setPage(item.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 0, padding: "0", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: page === item.id ? `3px solid ${C.brand}` : "3px solid transparent", background: page === item.id ? C.sidebarActive : "transparent", cursor: "pointer", textAlign: "left", marginBottom: 1, fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.1s" }}>
              <div style={{ width: 44, padding: "11px 0", display: "flex", alignItems: "center", justifyContent: "center", color: page === item.id ? C.brand : "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                {navIcons[item.id]}
              </div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: page === item.id ? 700 : 400, color: page === item.id ? C.brand : "rgba(255,255,255,0.5)", paddingRight: 12 }}>{item.label}</div>
              {item.id === "monitor" && (
                <span style={{ marginRight: 10, width: 16, height: 16, background: C.critical, color: "white", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* WorldMonitor Link */}
      <div style={{ padding: "12px", margin: "0 8px" }}>
        <style>{`
          @keyframes globeRotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          @keyframes globeOrbit { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(360deg); } }
          @keyframes globePulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        `}</style>
        <button onClick={() => window.location.href = '/world-monitor'}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 7, border: `1px solid rgba(48,188,237,0.2)`, background: `rgba(48,188,237,0.07)`, color: C.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "'Space Grotesk',sans-serif", transition: "all 0.15s" }}
          onMouseOver={(e) => { e.currentTarget.style.background = `rgba(48,188,237,0.14)`; }}
          onMouseOut={(e) => { e.currentTarget.style.background = `rgba(48,188,237,0.07)`; }}>
          {/* Animated rotating globe from 21st.dev */}
          <div style={{ width: 22, height: 22, flexShrink: 0, position: "relative" }}>
            <svg viewBox="0 0 24 24" width="22" height="22" style={{ display: "block" }}>
              <defs>
                <radialGradient id="globeGrad" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#5ef0ff" stopOpacity="0.9" />
                  <stop offset="60%" stopColor="#30bced" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#0d4a6e" stopOpacity="1" />
                </radialGradient>
                <clipPath id="globeClip">
                  <circle cx="12" cy="12" r="10" />
                </clipPath>
              </defs>
              <circle cx="12" cy="12" r="10" fill="url(#globeGrad)" stroke="rgba(48,188,237,0.5)" strokeWidth="0.5" />
              {/* Latitude lines */}
              <ellipse cx="12" cy="12" rx="10" ry="3.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" clipPath="url(#globeClip)" />
              <ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" clipPath="url(#globeClip)" />
              <line x1="2" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" clipPath="url(#globeClip)" />
              {/* Rotating longitude line */}
              <ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="rgba(94,240,255,0.6)" strokeWidth="0.7" clipPath="url(#globeClip)"
                style={{ transformOrigin: "12px 12px", animation: "globeRotate 3s linear infinite" }} />
              <ellipse cx="12" cy="12" rx="8" ry="10" fill="none" stroke="rgba(48,188,237,0.3)" strokeWidth="0.5" clipPath="url(#globeClip)"
                style={{ transformOrigin: "12px 12px", animation: "globeRotate 5s linear infinite reverse" }} />
              {/* Highlight */}
              <circle cx="9" cy="9" r="2.5" fill="rgba(255,255,255,0.12)" />
            </svg>
          </div>
          View WorldMonitor
        </button>
      </div>

      {/* Governance badge */}
      <div style={{ padding: "10px 12px", margin: "0 8px 14px", borderTop: "1px solid rgba(254,197,2,0.08)", paddingTop: 12 }}>
        <div style={{ background: "rgba(48,188,237,0.08)", borderRadius: 6, padding: "9px 12px", border: `1px solid rgba(48,188,237,0.15)` }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginBottom: 4, fontFamily: "'Space Mono',monospace" }}>GOVERNANCE STATUS</div>
          <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
            HITL Active — No Auto-Exec
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── ASK OSIRIS SIDEBAR ────────────────────────────────────────────────────────
function AskOsirisSidebar({ open, selectedAlert, profile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);

  // Clear history and reload chips on alert change
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [selectedAlert?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSend = async (text) => {
    const q = text || input;
    if (!q.trim() || thinking) return;
    setInput("");

    // Convert current history to format to show in UI right away
    const newMsgs = [...messages, { role: "user", content: q }];
    setMessages(newMsgs);
    setThinking(true);

    try {
      const promptContext = `
You are OSIRIS, an AI supply chain operations advisor. Answer questions about this specific disruption concisely and specifically. Ground all answers in the alert data and manufacturer profile provided. Never give generic advice. If asked about cost, cite specific figures from the playbook. If asked about risk, cite the exact score and reasoning. Keep responses to 3-5 sentences.

Profile:
${JSON.stringify(profile)}

Alert Data:
Title: ${selectedAlert?.title || "N/A"}
Supplier/Region: ${selectedAlert?.supplier || "N/A"} / ${selectedAlert?.region || "N/A"}
Risk Score: ${selectedAlert?.riskScore || selectedAlert?.risk_score || "N/A"}
Revenue at Risk: ${selectedAlert?.revenueAtRisk || "N/A"}
Playbook Options: ${JSON.stringify(selectedAlert?.playbook || [])}
Summary: ${selectedAlert?.summary || "No specific alert selected. Answer general supply chain questions based on the manufacturer profile."}
      `;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

      // Formatting previous messages (last 6 context size) for Gemini API
      // Gemini Flash expects format: { role: 'user' | 'model', parts: [{text: string}] }
      // Using 'model' as role for AI responses to match Gemini spec
      const contextMsgs = [...newMsgs];
      if (contextMsgs.length > 7) {
        contextMsgs.splice(0, contextMsgs.length - 7); // keep last 6 + 1 new msg
      }

      const historyFormatted = contextMsgs.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: promptContext }] },
          contents: historyFormatted
        })
      });

      const data = await response.json();
      if (data.candidates && data.candidates[0].content.parts[0].text) {
        setMessages([...newMsgs, { role: "model", content: data.candidates[0].content.parts[0].text.trim() }]);
      } else {
        setMessages([...newMsgs, { role: "model", content: "Error: Could not reach OSIRIS core." }]);
      }
    } catch (e) {
      console.error(e);
      setMessages([...newMsgs, { role: "model", content: "Error: Connection failed." }]);
    }
    setThinking(false);
  };

  const chips = [
    "What is the cheapest mitigation for this disruption?",
    "How long until we hit stockout if we do nothing?",
    "Which stakeholders need to be notified right now?"
  ];

  return (
    <div style={{
      position: "fixed", top: 96, right: open ? 0 : -320, bottom: 0, width: 320,
      background: "#0D1C2B", borderLeft: `1px solid ${C.border}`,
      transition: "right 0.3s ease", zIndex: 100, display: "flex", flexDirection: "column",
      boxShadow: open ? "-4px 0 24px rgba(0,0,0,0.5)" : "none",
      fontFamily: "'Space Grotesk',sans-serif"
    }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.brand, fontFamily: "'Space Mono',monospace", letterSpacing: "0.05em" }}>Ask OSIRIS</div>
        <div style={{ fontSize: 9, color: C.textLight, padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>GEMINI</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: C.textMid, fontSize: 12, marginTop: 40, fontFamily: "'Space Mono',monospace" }}>
            <div style={{ fontSize: 24, marginBottom: 8, color: C.brand }}>✦</div>
            OSIRIS is online.<br /><br />
            {selectedAlert?.id ? `Ask about ${selectedAlert.id}.` : "Ask about your supply chain."}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", width: "100%" }}>
            <div style={{
              maxWidth: "85%", padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
              background: m.role === "user" ? "#F1F5F9" : "#0A192F",
              color: m.role === "user" ? "#0F172A" : C.brand,
              border: m.role === "user" ? "none" : `1px solid ${C.brand}33`,
              borderBottomRightRadius: m.role === "user" ? 0 : 8,
              borderBottomLeftRadius: m.role === "model" ? 0 : 8,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 11, color: C.brand, background: "#0A192F", fontFamily: "'Space Mono',monospace", border: `1px solid ${C.brand}33`, borderBottomLeftRadius: 0 }}>
              OSIRIS is thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "16px", borderTop: `1px solid ${C.border}`, background: "#0D1C2B" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {chips.map((c, i) => (
              <button key={i} onClick={() => handleSend(c)} style={{ textAlign: "left", padding: "8px 10px", background: "rgba(254,197,2,0.05)", border: `1px solid ${C.brand}33`, borderRadius: 6, color: C.textMid, fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}
                onMouseOver={(e) => { e.currentTarget.style.background = `rgba(254,197,2,0.1)`; e.currentTarget.style.color = C.brand; }}
                onMouseOut={(e) => { e.currentTarget.style.background = `rgba(254,197,2,0.05)`; e.currentTarget.style.color = C.textMid; }}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question..."
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#0A192F", color: "white", fontSize: 13, outline: "none", minWidth: 0 }}
            onFocus={(e) => e.target.style.border = `1px solid ${C.brand}`}
            onBlur={(e) => e.target.style.border = `1px solid ${C.border}`}
          />
          <button onClick={() => handleSend()} disabled={thinking} style={{ padding: "0 14px", borderRadius: 8, background: C.brand, color: "#12263A", border: "none", cursor: thinking ? "not-allowed" : "pointer", fontWeight: 800, flexShrink: 0, opacity: thinking ? 0.5 : 1 }}>
            ➤
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 10, fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono',monospace" }}>
          Powered by Gemini
        </div>
      </div>
    </div>
  );
}

// ─── TOPBAR ─────────────────────────────────────────────────────────────────────
function Topbar({ title, subtitle, flash, action, profileBadge, onSignOut }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const badgeRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => { if (badgeRef.current && !badgeRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  return (
    <header style={{ height: 60, background: "rgba(13,28,43,0.95)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${flash ? C.brand : "rgba(254,197,2,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50, fontFamily: "'Space Grotesk',sans-serif", transition: "border-color 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 3, height: 32, background: C.brand, borderRadius: 99 }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.01em", fontFamily: "'Space Grotesk',sans-serif" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1, letterSpacing: "0.01em" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {action}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", padding: "6px 12px", border: `1px solid rgba(48,188,237,0.3)`, background: `rgba(48,188,237,0.08)`, fontFamily: "'Space Mono',monospace", letterSpacing: "0.02em" }}>
          <Icons.Lock /> ASSIST · RECOMMEND · SIMULATE
        </div>
        {/* Profile badge with Sign Out dropdown */}
        {profileBadge && (
          <div ref={badgeRef} style={{ position: "relative" }}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                border: `1px solid ${profileOpen ? C.brand : "rgba(254,197,2,0.25)"}`,
                background: profileOpen ? "rgba(254,197,2,0.18)" : C.brandLight,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <div style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.brand}`, background: "rgba(254,197,2,0.1)", color: C.brand, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {profileBadge.name.charAt(0)}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.brand, lineHeight: 1.2 }}>{profileBadge.name}</div>
                <div style={{ fontSize: 9, color: "rgba(254,197,2,0.5)", fontFamily: "'Space Mono',monospace" }}>{profileBadge.email}</div>
              </div>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, color: C.brand, transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                <polyline points="2,3 5,7 8,3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: "100%",
                background: "#0D1C2B", border: `1px solid rgba(254,197,2,0.2)`,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 200,
                animation: "fadeUp 0.15s ease",
              }}>
                <button
                  onClick={() => { setProfileOpen(false); onSignOut && onSignOut(); }}
                  style={{
                    width: "100%", padding: "10px 16px", background: "transparent",
                    border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    textAlign: "left", fontFamily: "'Space Grotesk',sans-serif",
                    transition: "background 0.1s",
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(254,197,2,0.06)"}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

// ─── LIVE MONITOR PAGE ────────────────────────────────────────────────────────
function MonitorPage({ onAnalyze, globalAlerts, currentProfile }) {
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

    // Find Red Sea alert (OSR-002)
    const redSeaAlert = alertsToUse.find(a => a.id === "OSR-002") || alertsToUse[1] || ACTIVE_ALERTS[1];
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
            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'Space Mono',monospace", color: C.critical }}>SIM</span>
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

      {/* KPI row — borderless editorial stats */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, marginBottom: 0 }}>
        {[
          { label: "ACTIVE DISRUPTIONS", value: String(alertsToUse.length), sub: "↑ from last 24h", color: C.critical },
          {
            label: "REVENUE AT RISK",
            value: `$${(parseFloat(String(currentProfile.dailyRevenue).replace(/[^0-9.]/g, '')) * 17 / 1000).toFixed(1)}M`,
            sub: "Across all alerts",
            color: C.high
          },
          { label: "CRITICAL SUPPLIERS", value: "2", sub: "< 10 days stockout", color: C.critical },
          { label: "AVG CONFIDENCE", value: "84%", sub: "Above threshold", color: C.success },
        ].map((k, i, arr) => (
          <div key={k.label} style={{ flex: 1, padding: "28px 28px 24px", borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 9, color: C.textLight, marginBottom: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em" }}>{k.label}</div>
            <div style={{ fontSize: 64, fontWeight: 900, color: k.color, letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "'Space Mono',monospace" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 10, letterSpacing: "0.02em" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Governance + system status */}
      <div style={{ background: "#0D1C2B", borderBottom: `1px solid ${C.border}`, padding: "10px 28px", marginBottom: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
        <span style={{ fontSize: 12, color: C.accent }}><Icons.Shield /></span>
        <span><strong style={{ color: C.accent }}>GOVERNANCE ACTIVE.</strong> Assist-Only mode. No POs, emails, or ERP writes without human approval token. FP rate: <strong style={{ color: "#FFFFFF" }}>12%</strong> — within threshold.</span>
        <div style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.4)", flexShrink: 0, fontFamily: "'Space Mono',monospace" }}>POLL / 5MIN · {new Date().toLocaleTimeString()}</div>
      </div>

      {/* Active alerts — editorial layout */}
      <div style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 900, color: C.textMid, padding: "16px 28px 10px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", borderBottom: `1px solid ${C.border}` }}>ACTIVE DISRUPTION SIGNALS</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {alertsToUse.map(a => {
            const cfg = SEV_CFG[a.severity] || SEV_CFG.medium;
            const isCritical = a.severity === "critical";
            const cardBg = isCritical ? C.brand : "transparent";
            const textColor = isCritical ? "#12263A" : C.text;
            const mutedColor = isCritical ? "rgba(18,38,58,0.6)" : C.textMid;
            const borderColor = isCritical ? "transparent" : C.border;
            return (
              <div key={a.id} style={{ background: cardBg, borderBottom: `1px solid ${borderColor}`, overflow: "hidden", transition: "background 0.2s" }}>
                <div style={{ display: "flex", alignItems: "stretch" }}>

                  {/* Left severity column — large type */}
                  <div style={{ width: 72, flexShrink: 0, background: isCritical ? "rgba(18,38,58,0.15)" : `${cfg.color}18`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0", borderRight: `1px solid ${isCritical ? "rgba(18,38,58,0.2)" : C.border}` }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: isCritical ? "rgba(18,38,58,0.7)" : cfg.color, fontFamily: "'Space Mono',monospace", letterSpacing: "0.1em", writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)" }}>
                      {a.severity.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: isCritical ? "#12263A" : cfg.color, fontFamily: "'Space Mono',monospace", marginTop: 8, lineHeight: 1 }}>{a.riskScore}</div>
                    <div style={{ fontSize: 8, color: isCritical ? "rgba(18,38,58,0.5)" : C.textLight, fontFamily: "'Space Mono',monospace", marginTop: 2 }}>/100</div>
                  </div>

                  {/* Main content */}
                  <div style={{ flex: 1, padding: "20px 24px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, color: mutedColor, fontFamily: "'Space Mono',monospace", letterSpacing: "0.1em" }}>{a.id} · {a.detectedAt}</span>
                          {a.escalate && <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 8px", background: isCritical ? "rgba(18,38,58,0.2)" : C.criticalLight, color: isCritical ? "#12263A" : C.critical, letterSpacing: "0.08em", fontFamily: "'Space Mono',monospace" }}>ESCALATE</span>}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: textColor, marginBottom: 4, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "-0.02em", lineHeight: 1.2 }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: mutedColor, marginBottom: 12, letterSpacing: "0.02em" }}>{a.supplier} · {a.region} · {a.commodity}</div>
                        <p style={{ fontSize: 12, color: mutedColor, lineHeight: 1.7, margin: 0 }}>{a.summary}</p>
                      </div>

                      {/* Right metric strip */}
                      <div style={{ marginLeft: 28, display: "flex", gap: 20, flexShrink: 0, alignItems: "flex-start", paddingLeft: 24, borderLeft: `1px solid ${isCritical ? "rgba(18,38,58,0.2)" : C.border}` }}>
                        {[["REV AT RISK", a.revenueAtRisk], ["CONFIDENCE", `${a.confidenceScore}%`], ["STOCKOUT", `${a.daysToStockout}d`]].map(([l, v]) => (
                          <div key={l} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 8, color: mutedColor, fontFamily: "'Space Mono',monospace", letterSpacing: "0.1em", marginBottom: 4 }}>{l}</div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: textColor, fontFamily: "'Space Mono',monospace" }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${isCritical ? "rgba(18,38,58,0.15)" : C.border}` }}>
                      <div style={{ display: "flex", gap: 20 }}>
                        <span style={{ fontSize: 10, color: mutedColor, fontFamily: "'Space Mono',monospace" }}><span style={{ opacity: 0.6 }}>BOM</span> {a.bomImpact}</span>
                        <span style={{ fontSize: 10, color: mutedColor, fontFamily: "'Space Mono',monospace" }}><span style={{ opacity: 0.6 }}>PO</span> {a.openPOs}</span>
                      </div>
                      <button
                        onClick={() => handleQuickAnalyze(a)}
                        disabled={analyzing}
                        style={{ padding: "8px 20px", border: isCritical ? "2px solid #12263A" : `2px solid ${C.brand}`, background: isCritical ? "#12263A" : "transparent", color: isCritical ? C.brand : C.brand, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em", opacity: analyzing ? 0.6 : 1 }}>
                        {analyzing ? status : "RUN ANALYSIS →"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Supplier inventory status — no-card, table style */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 900, color: C.textLight, padding: "16px 28px 10px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", borderBottom: `1px solid ${C.border}` }}>INVENTORY COVERAGE — CRITICAL SKUS</div>
        {[
          { sku: "SKU-4421", name: "Processor Module A", days: 8, max: 30, status: "critical" },
          { sku: "SKU-4422", name: "Memory Module B", days: 8, max: 30, status: "critical" },
          { sku: "SKU-5891", name: "Main PCB Assembly", days: 12, max: 30, status: "warning" },
          { sku: "SKU-3310", name: "Polymer Housing", days: 18, max: 30, status: "ok" },
          { sku: "SKU-2200", name: "Capacitor Array", days: 22, max: 30, status: "ok" },
        ].map((s, i) => {
          const barColor = s.status === "critical" ? C.critical : s.status === "warning" ? C.high : C.success;
          const rowBg = s.status === "critical" ? `${C.critical}08` : "transparent";
          return (
            <div key={s.sku} style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 28px", borderBottom: `1px solid ${C.border}`, background: rowBg }}>
              <div style={{ fontSize: 9, fontFamily: "'Space Mono',monospace", color: C.textLight, width: 72, flexShrink: 0 }}>{s.sku}</div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{s.name}</div>
              <div style={{ width: 200, flexShrink: 0 }}>
                <div style={{ height: 3, background: `${C.border}`, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(s.days / s.max) * 100}%`, background: barColor, transition: "width 0.6s ease" }} />
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: barColor, fontFamily: "'Space Mono',monospace", width: 36, textAlign: "right", flexShrink: 0 }}>{s.days}<span style={{ fontSize: 9, fontWeight: 400 }}>d</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RISK ANALYSIS PAGE ───────────────────────────────────────────────────────
function AnalysisPage({ focusAlert, globalAlerts, currentProfile, chatOpen }) {
  const alertsToUse = globalAlerts && globalAlerts.length > 0 ? globalAlerts : ACTIVE_ALERTS;
  const initialAlert = alertsToUse.find(a => a.id === focusAlert?.id) || alertsToUse[0];

  const [selected, setSelected] = useState(initialAlert);
  const [emailStatus, setEmailStatus] = useState("pending");
  const [erpStatus, setErpStatus] = useState("pending");
  const [emailSending, setEmailSending] = useState(false);

  const [voiceStatus, setVoiceStatus] = useState("pending");
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const voiceAudioRef = useRef(null);

  const [supplierHealth, setSupplierHealth] = useState(null);

  const [forecast, setForecast] = useState(null);
  const [forecastProvider, setForecastProvider] = useState(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);

  // Re-sync if globalAlerts updates
  useEffect(() => {
    if (alertsToUse.length > 0 && !alertsToUse.find(a => a.id === selected?.id)) {
      setSelected(alertsToUse[0]);
    }
  }, [globalAlerts, selected]);

  useEffect(() => {
    setForecast(null);
    setForecastProvider(null);
    setVoiceStatus("pending");
    setVoiceError(null);
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }
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

      try {
        const health = await getSupplierFinancialHealth(ticker);
        setSupplierHealth(health);
      } catch (e) {
        console.warn(`[AnalysisPage] Failed to grab health: ${e.message}`);
      }
    }
    fetchHealth();
  }, [selected]);

  const handleVoiceAction = async (action) => {
    if (action === "preview") {
      setVoiceStatus("previewing");
      setVoiceSending(true);
      setVoiceError(null);
      const scriptText = buildCallScript(selected, selected.supplier, 'an urgent supply continuity review and confirmation of alternative sourcing options');
      const audioBlob = await generateCallScriptAudio(scriptText);

      if (audioBlob) {
        setVoiceStatus("playing");
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        voiceAudioRef.current = audio;

        audio.play().catch(err => {
          console.error("Audio playback error:", err);
          setVoiceError("Audio playback failed. The key may be invalid or the browser blocked it.");
          setVoiceStatus("previewed");
        });

        audio.onended = () => {
          setVoiceStatus("previewed");
        };
      } else {
        setVoiceError("Audio unavailable — ElevenLabs key not configured. Script ready for manual delivery.");
        setVoiceStatus("previewed");
      }
      setVoiceSending(false);
    } else if (action === "approved") {
      setVoiceStatus("dispatched");
      const scriptText = buildCallScript(selected, selected.supplier, 'an urgent supply continuity review and confirmation of alternative sourcing options');
      await writeAuditLog({
        eventType: "voice_alert",
        disruptionId: selected.id,
        action: "audio_approved_and_dispatched",
        payload: { script: scriptText }
      });
    } else if (action === "dismissed") {
      setVoiceStatus("dismissed");
      await writeAuditLog({
        eventType: "voice_alert",
        disruptionId: selected.id,
        action: "voice_dismissed",
        payload: {}
      });
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
        voiceAudioRef.current = null;
      }
    }
  };

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

  const [adkAnalysis, setAdkAnalysis] = useState(null);
  const [adkLoading, setAdkLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setAdkAnalysis(null);
    setAdkLoading(true);
    fetch('http://localhost:8000/api/risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_title: selected.title || '',
        signal_description: selected.summary || '',
        supplier_hint: selected.supplier || '',
        region_hint: selected.region || '',
        commodity_hint: selected.commodity || '',
        manufacturer_profile: JSON.stringify(currentProfile || {}),
        false_positive_rate: 12
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.riskScore && !data.error) {
          setAdkAnalysis(data);
          console.log('[OSIRIS] ADK analysis loaded, provider:', data._provider);
        }
      })
      .catch(err => console.warn('[OSIRIS] ADK unavailable:', err.message))
      .finally(() => setAdkLoading(false));
  }, [selected?.id]);

  const handleGenerateForecast = async () => {
    setIsLoadingForecast(true);
    const result = await getSituationForecast(selected, currentProfile || MANUFACTURER);
    setForecast(result.forecast);
    setForecastProvider(result.provider);
    setIsLoadingForecast(false);
  };

  if (!selected) return null;
  const cfg = SEV_CFG[selected.severity] || SEV_CFG.medium;

  const activePlaybook = adkAnalysis?.playbook?.length > 0 ? adkAnalysis.playbook : (selected.playbook && selected.playbook.length > 0 ? selected.playbook : PLAYBOOK);

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

  const adkScenarios = adkAnalysis?.scenarios;
  const adkCritic = adkAnalysis?.criticPass || adkAnalysis?.critic_pass;
  const adkReasoning = adkAnalysis?.reasoningTrace || adkAnalysis?.reasoning_trace;

  const mockResult = {
    scenarios: {
      baseCase: adkScenarios?.baseCase
        ? { delay: `${adkScenarios.baseCase.delayDays ?? adkScenarios.baseCase.delay ?? "14"}d`, cost: adkScenarios.baseCase.additionalCost ?? adkScenarios.baseCase.cost ?? "+$85K", rev: adkScenarios.baseCase.revenueImpact ?? adkScenarios.baseCase.rev ?? "-$1.8M", svc: adkScenarios.baseCase.serviceLevel ?? adkScenarios.baseCase.svc ?? "72%" }
        : { delay: "14d", cost: "+$85K", rev: "-$1.8M", svc: "72%" },
      stressCase: adkScenarios?.stressCase
        ? { delay: `${adkScenarios.stressCase.delayDays ?? adkScenarios.stressCase.delay ?? "17"}d`, cost: adkScenarios.stressCase.additionalCost ?? adkScenarios.stressCase.cost ?? "+$98K", rev: adkScenarios.stressCase.revenueImpact ?? adkScenarios.stressCase.rev ?? "-$2.2M", svc: adkScenarios.stressCase.serviceLevel ?? adkScenarios.stressCase.svc ?? "61%", note: "+20% delay / +15% cost" }
        : { delay: "17d", cost: "+$98K", rev: "-$2.2M", svc: "61%", note: "+20% delay / +15% cost" },
      shockCase: adkScenarios?.shockCase
        ? { delay: `${adkScenarios.shockCase.delayDays ?? adkScenarios.shockCase.delay ?? "21"}d`, cost: adkScenarios.shockCase.additionalCost ?? adkScenarios.shockCase.cost ?? "+$119K", rev: adkScenarios.shockCase.revenueImpact ?? adkScenarios.shockCase.rev ?? "-$3.1M", svc: adkScenarios.shockCase.serviceLevel ?? adkScenarios.shockCase.svc ?? "44%", note: "+50% delay / +40% cost" }
        : { delay: "21d", cost: "+$119K", rev: "-$3.1M", svc: "44%", note: "+50% delay / +40% cost" },
    },
    criticPass: {
      alt: adkCritic?.alt ?? adkCritic?.alternative ?? "Demand shaping: delay non-critical orders 3 weeks → reduces revenue impact by $400K.",
      cash: adkCritic?.cash ?? adkCritic?.cashFlow ?? "Combined Options 1+3: $57K outflow vs $4.2M revenue at risk. Ratio: 74:1.",
      overlooked: adkCritic?.overlooked ?? adkCritic?.overlookedRisks ?? "Samsung Foundry capacity may be constrained industry-wide.",
      validity: adkCritic?.validity ?? adkCritic?.escalationValidity ?? "Escalation valid: All 3 thresholds met (Risk 87>65, Confidence 91%>70%, FP 12%<20%).",
    },
    reasoning: adkReasoning?.length > 0 ? adkReasoning : baseReasoning,
  };

  return (
    <>
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
                {selected.escalate && <span style={{ fontSize: 10, fontWeight: 700, color: C.critical, padding: "3px 9px", background: C.criticalLight, border: `1px solid ${C.criticalBorder} ` }}>ESCALATION REQUIRED</span>}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>Scenario Simulation</div>
            {adkLoading && <div style={{ fontSize: 10, color: C.accent, fontFamily: "'Space Mono',monospace", animation: "pulseAnim 1.5s infinite" }}>⬡ GEMINI ANALYZING...</div>}
            {adkAnalysis && !adkLoading && <div style={{ fontSize: 10, color: C.success, fontFamily: "'Space Mono',monospace" }}>✓ POWERED BY GEMINI</div>}
          </div>
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
              <div style={{ fontSize: 11, color: C.textLight }}>Human approval required before sending</div>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>
                AI Voice Alert <Icons.Phone />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: ["pending", "previewing", "previewed"].includes(voiceStatus) ? C.medium : (voiceStatus === "playing" ? C.success : (voiceStatus === "dispatched" ? C.success : C.textMid)), background: ["pending", "previewing", "previewed"].includes(voiceStatus) ? C.mediumLight : (["playing", "dispatched"].includes(voiceStatus) ? C.successLight : "#F1F5F9"), padding: "4px 10px", borderRadius: 999, border: `1px solid ${["pending", "previewing", "previewed"].includes(voiceStatus) ? C.mediumBorder : (["playing", "dispatched"].includes(voiceStatus) ? C.success : C.border)} ` }}>
                {["pending", "previewing"].includes(voiceStatus) ? "⏸ AWAITING PREVIEW" : (voiceStatus === "previewed" ? "⏸ AWAITING APPROVAL" : (voiceStatus === "playing" ? "▶ PLAYING..." : (voiceStatus === "dispatched" ? "✓ ALERT DISPATCHED" : "DISMISSED")))}
              </span>
            </div>
            <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", marginBottom: 12, fontFamily: "monospace" }}>
              {voiceError && <div style={{ fontSize: 12, color: C.medium, fontWeight: 600, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>{voiceError}</div>}
              <div style={{ fontSize: 12, color: voiceError ? C.medium : C.textMid, lineHeight: 1.7, fontFamily: "'Fira Sans',sans-serif" }}>
                {selected ? buildCallScript(selected, selected.supplier, 'an urgent supply continuity review and confirmation of alternative sourcing options') : ''}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, color: C.textLight }}>Human approval required before dispatch</div>
              {["pending", "previewing"].includes(voiceStatus) ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => handleVoiceAction("dismissed")} disabled={voiceSending}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border} `, background: C.card, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    Dismiss
                  </button>
                  <button onClick={() => handleVoiceAction("preview")} disabled={voiceSending}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.brand} `, background: C.brand, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    {voiceSending ? "Generating..." : "Preview Audio"}
                  </button>
                </div>
              ) : voiceStatus === "previewed" ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => handleVoiceAction("dismissed")}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border} `, background: C.card, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    Dismiss
                  </button>
                  <button onClick={() => handleVoiceAction("approved")}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.success} `, background: C.success, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                    Approve Dispatch
                  </button>
                </div>
              ) : voiceStatus === "playing" ? (
                <div style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.success} `, background: C.successLight, color: C.success, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
                  ▶ Playing...
                </div>
              ) : (
                <div style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${voiceStatus === "dispatched" ? C.success : C.border} `, background: voiceStatus === "dispatched" ? C.successLight : "#F1F5F9", color: voiceStatus === "dispatched" ? C.success : C.textMid, fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
                  {voiceStatus === "dispatched" ? "Dispatched" : "Dismissed"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 18 }}>
          <div style={{ background: C.card, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border} ` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Sora',sans-serif" }}>ERP Adjustment Flag</div>
              <span style={{ fontSize: 10, fontWeight: 800, color: erpStatus === "pending" ? C.textLight : (erpStatus === "approved" ? C.success : C.textMid), background: erpStatus === "pending" ? "#F8FAFC" : (erpStatus === "approved" ? C.successLight : "#F1F5F9"), padding: "4px 10px", borderRadius: 999, border: `1px solid ${erpStatus === "pending" ? C.border : (erpStatus === "approved" ? C.success : C.border)} ` }}>
                {erpStatus === "pending" ? "[ SIM ] SIMULATED ONLY" : (erpStatus === "approved" ? "[ OK ] EXECUTED" : "DISMISSED")}
              </span>
            </div>
            {[["Action", "Safety stock threshold review"], ["System", "SAP S/4HANA"], ["Reorder Point", "+20% for SKU-4421, SKU-4422 for 45 days"], ["Safety Stock Rec", "Build 30-day buffer from alternate source"], ["Status", "[ SIM ] SIMULATED — No write performed"]].map(([k, v]) => (
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
                  {erpStatus === "approved" ? "Write Approved" : "Dismissed"}
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.medium, fontFamily: "'Fira Code', monospace", letterSpacing: "0.05em" }}>[ FORECAST // 24H OUTLOOK ]</div>
              {forecast && forecastProvider !== 'mock' && (
                <div style={{ fontSize: 10, border: "1px solid rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 999, color: "#94A3B8" }}>
                  Powered by {forecastProvider === 'gemini' ? 'Gemini' : 'Groq'}
                </div>
              )}
            </div>
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
    </>
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
    <div style={{ fontFamily: "'Space Grotesk',sans-serif", maxWidth: 1200 }}>
      {/* KPI stats — borderless editorial */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
        {[
          ["ACTIVE MITIGATIONS", String(displayLibrary.length), C.brand],
          ["ARCHIVED STRATEGIES", "85", C.textMid],
          ["AVG RISK REDUCTION", "68%", C.success],
          ["SIMULATED OUTCOMES", "1,204", C.text]
        ].map(([l, v, c], i, arr) => (
          <div key={l} style={{ flex: 1, padding: "28px 28px 24px", borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 9, color: C.textLight, marginBottom: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em" }}>{l}</div>
            <div style={{ fontSize: 64, fontWeight: 900, color: c, letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "'Space Mono',monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 900, color: C.textLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em" }}>MITIGATION LIBRARY</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ padding: "6px 14px", border: `1px solid ${C.border}`, background: "transparent", fontSize: 11, color: C.textMid, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>FILTER</button>
          <button style={{ padding: "6px 14px", border: `1px solid ${C.brand}`, background: C.brandLight, color: C.brand, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>+ NEW STRATEGY</button>
        </div>
      </div>

      {/* Strategy rows — no cards */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {displayLibrary.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "stretch", borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
            {/* Rank col */}
            <div style={{ width: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: i < 3 ? 28 : 18, fontWeight: 900, color: i === 0 ? C.brand : i === 1 ? C.high : C.textLight, fontFamily: "'Space Mono',monospace", borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>#{i + 1}</div>

            {/* Content */}
            <div style={{ flex: 1, padding: "18px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Space Grotesk',sans-serif" }}>{p.action}</span>
                <span style={{ fontSize: 8, fontWeight: 900, padding: "2px 8px", background: p.status === "Active" ? C.accentLight : "rgba(255,255,255,0.06)", color: p.status === "Active" ? C.accent : C.textMid, fontFamily: "'Space Mono',monospace", letterSpacing: "0.08em" }}>{p.status?.toUpperCase()}</span>
                <span style={{ fontSize: 8, color: C.textLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.08em" }}>{p.category}</span>
              </div>
              <div style={{ fontSize: 12, color: C.textMid, marginBottom: 6, lineHeight: 1.6 }}>{p.description}</div>
              <div style={{ fontSize: 11, color: C.textLight }}><span style={{ color: C.textMid, fontWeight: 600 }}>Trade-off:</span> {p.tradeOff}</div>
              {p.reasoningTrace && p.reasoningTrace.length > 0 && (
                <details style={{ marginTop: 10, background: "#0D1C2B", padding: "10px 14px", border: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", fontSize: 11, color: C.textMid, lineHeight: 1.6, cursor: "pointer" }}>
                  <summary style={{ fontWeight: 700, color: C.brand, letterSpacing: "0.04em" }}>[+] SIMULATION REASONING</summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {p.reasoningTrace.map((step, idx) => { const [label, ...rest] = step.split(":"); return (<div key={idx} style={{ display: "flex", gap: 8 }}><span style={{ color: C.brand, whiteSpace: "nowrap" }}>{label}:</span><span>{rest.join(":")}</span></div>); })}
                  </div>
                </details>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 0, flexShrink: 0, borderLeft: `1px solid ${C.border}` }}>
              {[["COST", p.cost], ["TIME", p.time], ["SCORE", p.composite]].map(([k, v]) => (
                <div key={k} style={{ textAlign: "center", padding: "18px 20px", borderLeft: k !== "COST" ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ fontSize: 8, color: C.textLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.1em", marginBottom: 6 }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: k === "SCORE" ? C.brand : C.text, fontFamily: "'Space Mono',monospace" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SUPPLIER MAP PAGE ────────────────────────────────────────────────────────
function SuppliersPage({ globalSuppliers, currentProfile }) {
  const defaultPins = currentProfile.name === "Rheinwerk Automotive GmbH" ? PINS_RHEINWERK :
    currentProfile.name === "Grupo Monterrey Industrial" ? PINS_MONTERREY : PINS_NORTHSTAR;

  // Use globalSuppliers if it's an array with items, otherwise use the profile defaults
  const allPins = Array.isArray(globalSuppliers) && globalSuppliers.length > 0 ? globalSuppliers : defaultPins;
  const [warningCount, setWarningCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState("ALL SUPPLIERS");

  useEffect(() => {
    const corridors = currentProfile?.logisticsCorridors || ["Taiwan Strait", "Red Sea", "Trans-Pacific"];
    getMaritimeWarnings(corridors).then(count => {
      setWarningCount(count);
    });
  }, [currentProfile]);

  // Filter pins based on active filter
  const pinsToUse = useMemo(() => {
    if (activeFilter === "CRITICAL RISK") {
      return allPins.filter(p => Number(p.risk || p.risk_score) >= 75 || p.status === "critical");
    }
    if (activeFilter === "TIER 1 ONLY") {
      return allPins.filter(p => (p.tier === 1 || p.cost_of_delay_tier === 1));
    }
    return allPins;
  }, [allPins, activeFilter]);

  const FILTERS = ["ALL SUPPLIERS", "CRITICAL RISK", "TIER 1 ONLY"];

  return (
    <div style={{ fontFamily: "'Space Grotesk',sans-serif", maxWidth: 1200 }}>
      {/* Header strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 9, color: C.textLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", fontWeight: 900, marginBottom: 4 }}>GLOBAL NETWORK EXPOSURE</div>
          <div style={{ fontSize: 12, color: C.textMid }}>
            {pinsToUse.length} {activeFilter === "ALL SUPPLIERS" ? "active" : activeFilter === "CRITICAL RISK" ? "critical-risk" : "tier-1"} nodes shown
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {FILTERS.map((f, i) => {
            const isActive = activeFilter === f;
            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: "7px 16px",
                  borderTop: `1px solid ${isActive ? C.brand : C.border}`,
                  borderRight: `1px solid ${isActive ? C.brand : C.border}`,
                  borderBottom: `1px solid ${isActive ? C.brand : C.border}`,
                  borderLeft: i > 0 ? "none" : `1px solid ${isActive ? C.brand : C.border}`,
                  background: isActive ? C.brandLight : "transparent",
                  color: isActive ? C.brand : C.textMid,
                  fontSize: 10,
                  fontWeight: isActive ? 900 : 500,
                  cursor: "pointer",
                  fontFamily: "'Space Mono',monospace",
                  letterSpacing: "0.06em",
                  transition: "all 0.15s",
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Map — full-bleed, no card */}
      <div style={{ height: 480, position: "relative", overflow: "hidden", background: "#050B14", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(13,28,43,0.92)", padding: "12px 16px", border: `1px solid rgba(254,197,2,0.2)`, zIndex: 10, pointerEvents: "none" }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: C.brand, marginBottom: 8, letterSpacing: "0.1em", fontFamily: "'Space Mono',monospace" }}>[ OSINT LEGEND ]</div>
          {[["Critical", C.critical], ["High", C.high], ["Medium", C.medium], ["Low", C.success]].map(([l, c]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "rgba(255,255,255,0.85)", fontFamily: "'Space Mono',monospace", marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, flexShrink: 0, background: c, boxShadow: `0 0 6px ${c}` }} />{l}
            </div>
          ))}
        </div>

        <Map
          key={`map-${activeFilter}`}
          initialViewState={{ longitude: 20, latitude: 25, zoom: 1.4, pitch: 0, bearing: 0 }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          attributionControl={false}
          minZoom={1}
          maxZoom={8}
        >
          {pinsToUse.map(pin => {
            const baseRisk = Number(pin.risk || pin.risk_score);
            const maritimePenalty = Math.min(15, warningCount * 5);
            const adjustedRisk = Math.min(100, baseRisk + maritimePenalty);
            // Color by BASE risk so Low pins stay blue regardless of maritime penalty
            const pinColor = getRiskColor(baseRisk);
            return (
              <Marker key={pin.id} longitude={Number(pin.lng)} latitude={Number(pin.lat)} anchor="center">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: pinColor + "40", display: "flex", alignItems: "center", justifyContent: "center", animation: "pingAnim 2s infinite" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: pinColor, border: "2px solid white" }} />
                  </div>
                  <div style={{ background: "rgba(5,11,20,0.95)", padding: "4px 8px", fontSize: 9, fontWeight: 700, color: "#FFFFFF", marginTop: 3, whiteSpace: "nowrap", border: `1px solid ${pinColor}55`, display: "flex", alignItems: "center", gap: 5, fontFamily: "'Space Mono',monospace" }}>
                    <span style={{ color: pinColor }}>{pin.name}</span>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{adjustedRisk}</span>
                    {warningCount > 0 && <span style={{ background: pinColor, color: "#0D1C2B", padding: "1px 5px", fontSize: 8, fontWeight: 900 }}>{warningCount} WARN</span>}
                  </div>
                </div>
              </Marker>
            );
          })}
        </Map>
      </div>

      {/* Supplier table */}
      <div style={{ fontSize: 9, fontWeight: 900, color: C.textLight, padding: "14px 28px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", borderBottom: `1px solid ${C.border}` }}>SUPPLIER INTELLIGENCE</div>
      {pinsToUse.length === 0 ? (
        <div style={{ padding: "40px 28px", textAlign: "center", color: C.textMid, fontFamily: "'Space Mono',monospace", fontSize: 12 }}>
          No suppliers match the current filter.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>{["SUPPLIER", "COMMODITY", "RISK SCORE", "STATUS", "TIER", "COORDINATES"].map(h => (
              <th key={h} style={{ padding: "10px 28px", fontSize: 9, fontWeight: 900, color: C.textLight, textAlign: "left", letterSpacing: "0.1em", fontFamily: "'Space Mono',monospace" }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {pinsToUse.map((pin, i) => {
              const risk = Math.min(100, Number(pin.risk || pin.risk_score) + Math.min(15, warningCount * 5));
              const riskColor = getRiskColor(risk);
              const tier = pin.tier || pin.cost_of_delay_tier || "—";
              return (
                <tr key={pin.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  <td style={{ padding: "13px 28px", fontSize: 12, fontWeight: 700, color: C.text }}>{pin.name}</td>
                  <td style={{ padding: "13px 28px", fontSize: 11, color: C.textMid }}>{pin.commodity}</td>
                  <td style={{ padding: "13px 28px", fontSize: 20, fontWeight: 900, color: riskColor, fontFamily: "'Space Mono',monospace" }}>{risk}</td>
                  <td style={{ padding: "13px 28px" }}><span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", background: riskColor + "18", color: riskColor, fontFamily: "'Space Mono',monospace", letterSpacing: "0.08em" }}>{(pin.status || "ACTIVE").toUpperCase()}</span></td>
                  <td style={{ padding: "13px 28px", fontSize: 12, fontWeight: 700, color: tier === 1 ? C.brand : C.textMid, fontFamily: "'Space Mono',monospace" }}>T{tier}</td>
                  <td style={{ padding: "13px 28px", fontSize: 10, color: C.textLight, fontFamily: "'Space Mono',monospace" }}>{Number(pin.lat).toFixed(2)}, {Number(pin.lng).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── AUDIT LOG PAGE ───────────────────────────────────────────────────────────
function AuditPage({ globalAuditLogs }) {
  const logsToUse = globalAuditLogs && globalAuditLogs.length > 0 ? globalAuditLogs : AUDIT_LOG_MOCK;

  return (
    <div style={{ fontFamily: "'Space Grotesk',sans-serif", maxWidth: 1200 }}>
      {/* KPI stats — borderless */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}` }}>
        {[
          ["ANALYSES RUN", logsToUse.length.toString(), C.brand],
          ["ESCALATIONS", logsToUse.filter(l => l.disruptions?.escalated || l.escalated).length.toString(), C.critical],
          ["HITL ACTIONS", logsToUse.filter(l => l.action).length.toString(), C.success],
          ["FP RATE", "12%", C.success]
        ].map(([l, v, c], i, arr) => (
          <div key={l} style={{ flex: 1, padding: "28px 28px 24px", borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 9, color: C.textLight, marginBottom: 10, fontWeight: 700, fontFamily: "'Space Mono',monospace", letterSpacing: "0.12em" }}>{l}</div>
            <div style={{ fontSize: 64, fontWeight: 900, color: c, letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "'Space Mono',monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Section label */}
      <div style={{ fontSize: 9, fontWeight: 900, color: C.textLight, padding: "14px 28px", fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", borderBottom: `1px solid ${C.border}` }}>IMMUTABLE AUDIT TRAIL</div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>{["ID", "TIME", "ACTION", "SUPPLIER", "REGION", "RISK", "CONFIDENCE", "TIER", "ESCALATED"].map(h => (
            <th key={h} style={{ padding: "10px 16px 10px 24px", fontSize: 9, fontWeight: 900, color: C.textLight, textAlign: "left", letterSpacing: "0.1em", fontFamily: "'Space Mono',monospace" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {logsToUse.map((r, i) => {
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
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                <td style={{ padding: "12px 16px 12px 24px", fontSize: 11, fontWeight: 700, color: C.brand, fontFamily: "'Space Mono',monospace" }}>{objId.toString().slice(0, 8)}</td>
                <td style={{ padding: "12px 16px", fontSize: 10, color: C.textMid, fontFamily: "'Space Mono',monospace" }}>{ts}</td>
                <td style={{ padding: "12px 16px", fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: "'Space Mono',monospace", letterSpacing: "0.04em" }}>{actionName}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: C.text }}>{supplier}</td>
                <td style={{ padding: "12px 16px", fontSize: 11, color: C.textMid }}>{region}</td>
                <td style={{ padding: "12px 16px", fontSize: 18, fontWeight: 900, color: getRiskColor(risk), fontFamily: "'Space Mono',monospace" }}>{risk}</td>
                <td style={{ padding: "12px 16px", fontSize: 12, color: C.text }}>{confidence}%</td>
                <td style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: tier >= 3 ? C.critical : C.high, fontFamily: "'Space Mono',monospace" }}>T{tier}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 10px", color: escalated ? C.critical : C.success, background: escalated ? C.criticalLight : C.successLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.08em" }}>{escalated ? "YES" : "NO"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: "12px 24px", fontSize: 9, color: C.textLight, fontFamily: "'Space Mono',monospace", borderTop: `1px solid ${C.border}` }}>ALL ENTRIES ARE CRYPTOGRAPHICALLY IMMUTABLE. GDPR-COMPLIANT ERASURE TOKENS APPLIED ON EXPORT.</div>
    </div>
  );
}

// ─── SETTINGS PAGE ──────────────────────────────────────────────────────────────
function SettingsPage({ currentProfile, setCurrentProfile, systemProfiles }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setDraft(JSON.stringify(currentProfile, null, 2));
  }, [currentProfile, editing]);

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(draft);
      setCurrentProfile(parsed);
      setEditing(false);
      await saveProfile(parsed.name, parsed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      alert("Invalid JSON format. Please correct it before saving.");
    }
  };

  const handleReset = async () => {
    setResetting(true);
    const defaultProfile = PROFILES.find(p => p.name === currentProfile.name);
    if (defaultProfile) {
      await saveProfile(currentProfile.name, defaultProfile);
      setCurrentProfile(defaultProfile);
      setDraft(JSON.stringify(defaultProfile, null, 2));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setResetting(false);
  };

  const handleProfileSelect = (e) => {
    const selectedName = e.target.value;
    const selected = (systemProfiles || PROFILES).find(p => p.name === selectedName);
    if (selected) {
      setCurrentProfile(selected);
      setDraft(JSON.stringify(selected, null, 2));
    }
  };

  return (
    <div style={{ fontFamily: "'Space Grotesk',sans-serif", maxWidth: 700 }}>
      {/* Header */}
      <div style={{ padding: "28px 28px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 900, color: C.textLight, fontFamily: "'Space Mono',monospace", letterSpacing: "0.14em", marginBottom: 8 }}>MANUFACTURER CONTEXT PROFILE</div>
        <div style={{ fontSize: 11, color: C.textMid, marginBottom: 16 }}>This JSON context grounds the AI risk engine's analysis and personalization layer.</div>
        <select
          value={currentProfile.name}
          onChange={handleProfileSelect}
          disabled={editing}
          style={{ background: "#0D1C2B", color: C.text, border: `1px solid ${editing ? C.border : C.brand}`, padding: "10px 14px", outline: "none", cursor: editing ? "not-allowed" : "pointer", opacity: editing ? 0.5 : 1, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.04em", width: "100%" }}
        >
          {(systemProfiles || PROFILES).map(p => (<option key={p.name} value={p.name}>{p.name}</option>))}
        </select>
      </div>

      {/* Actions */}
      <div style={{ padding: "16px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        {!editing ? (
          <>
            {saveSuccess && <span style={{ fontSize: 11, fontWeight: 700, color: C.success, fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em", marginRight: 8 }}>SAVED TO CLOUD</span>}
            <button onClick={handleReset} disabled={resetting} style={{ padding: "8px 18px", border: `1px solid ${C.border}`, background: "transparent", color: C.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>{resetting ? "RESETTING..." : "RESET TO DEFAULT"}</button>
            <button onClick={() => setEditing(true)} style={{ padding: "8px 18px", border: `1px solid ${C.brand}`, background: C.brandLight, color: C.brand, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>EDIT JSON</button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditing(false); setDraft(JSON.stringify(currentProfile, null, 2)); }} style={{ padding: "8px 18px", border: `1px solid ${C.border}`, background: "transparent", color: C.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>CANCEL</button>
            <button onClick={handleSave} style={{ padding: "8px 18px", border: "none", background: C.brand, color: "#12263A", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>SAVE PROFILE</button>
          </>
        )}
      </div>

      {/* JSON view/edit */}
      <div style={{ padding: "0" }}>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: "100%", height: 380, padding: "20px 28px", border: "none", borderBottom: `2px solid ${C.brand}`, background: "#FFFFFF", fontFamily: "'Space Mono',monospace", fontSize: 13, color: "#114280", resize: "none", outline: "none", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: 380, overflowY: "auto", padding: "20px 28px", background: "#FFFFFF", fontFamily: "'Space Mono',monospace", fontSize: 13, color: "#114280", whiteSpace: "pre-wrap", borderBottom: `1px solid ${C.border}` }}>
            {JSON.stringify(currentProfile, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const CARDS = [
    { label: "NorthStar Electronics", email: "Northstar@example.com" },
    { label: "Rheinwerk Automotive GmbH", email: "Rheinwerk@example.com" },
    { label: "Grupo Monterrey Industrial", email: "Grupo@example.com" },
  ];

  const handleSignIn = async () => {
    if (selectedIdx === null) { setError("Please select a company profile."); return; }
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 500));
    const ok = onLogin(CARDS[selectedIdx].email, password);
    if (!ok) setError("Incorrect password. Hint: Test1234!");
    setLoading(false);
  };

  const sel = selectedIdx !== null ? CARDS[selectedIdx] : null;

  return (
    <div style={{
      display: "flex", height: "100vh", color: "#FFFFFF",
      fontFamily: "'Space Grotesk',sans-serif", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/osiris-login-bg.png')",
      backgroundSize: "cover", backgroundPosition: "center 20%",
      position: "relative",
    }}>
      {/* Dark overlay to boost contrast behind the card */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        .ls-card:hover { border-color: rgba(254,197,2,0.6) !important; background: rgba(254,197,2,0.1) !important; }
        .ls-btn:hover:not(:disabled) { background: #e6b000 !important; box-shadow: 0 0 20px rgba(254,197,2,0.4) !important; }
        .ls-input::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>

      {/* Glass card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: 460, padding: "40px 38px",
        background: "rgba(5, 10, 18, 0.45)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(254,197,2,0.2)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
        animation: "fadeUp 0.4s ease",
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 68, height: 68, margin: "0 auto 14px", overflow: "hidden", borderRadius: "50%", border: "2px solid rgba(254,197,2,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(254,197,2,0.25)" }}>
            <img src="/osiris-eye-logo.jpg" alt="OSIRIS" style={{ width: 76, height: 76, objectFit: "cover", mixBlendMode: "screen", filter: "brightness(1.15) saturate(1.3)" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.14em", fontFamily: "'Space Mono',monospace", color: "#FEC502", textShadow: "0 0 20px rgba(254,197,2,0.5)" }}>OSIRIS</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 5, letterSpacing: "0.1em", fontFamily: "'Space Mono',monospace" }}>SUPPLY CHAIN RISK INTELLIGENCE</div>
        </div>

        {/* Section label */}
        <div style={{ fontSize: 9, color: "rgba(254,197,2,0.7)", letterSpacing: "0.14em", marginBottom: 10, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>SELECT COMPANY PROFILE</div>

        {/* Profile cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {CARDS.map((c, idx) => (
            <button key={c.email} className="ls-card"
              onClick={() => { setSelectedIdx(idx); setPassword(""); setError(""); }}
              style={{
                width: "100%", padding: "11px 14px", cursor: "pointer", textAlign: "left",
                background: selectedIdx === idx ? "rgba(254,197,2,0.13)" : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${selectedIdx === idx ? "rgba(254,197,2,0.7)" : "rgba(255,255,255,0.12)"}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "all 0.15s",
              }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: selectedIdx === idx ? "#FEC502" : "#FFFFFF" }}>{c.label}</div>
                <div style={{ fontSize: 10, color: selectedIdx === idx ? "rgba(254,197,2,0.65)" : "rgba(255,255,255,0.5)", marginTop: 3, fontFamily: "'Space Mono',monospace" }}>{c.email}</div>
              </div>
              {selectedIdx === idx && (
                <div style={{ width: 16, height: 16, background: "#FEC502", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1,5 4,8 9,2" stroke="#05080A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 20 }} />

        {/* Credentials */}
        <div style={{ opacity: sel ? 1 : 0.4, transition: "opacity 0.2s", pointerEvents: sel ? "auto" : "none" }}>
          <div style={{ fontSize: 9, color: "rgba(254,197,2,0.7)", letterSpacing: "0.14em", marginBottom: 14, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>CREDENTIALS</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 6, fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>EMAIL</div>
            <input readOnly value={sel?.email || ""}
              style={{ width: "100%", padding: "10px 13px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "#FFFFFF", fontSize: 12, outline: "none", fontFamily: "'Space Mono',monospace", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 6, fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>PASSWORD</div>
            <input className="ls-input"
              type="password" placeholder="Enter password"
              value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSignIn()}
              style={{ width: "100%", padding: "10px 13px", background: "rgba(0,0,0,0.4)", border: `1px solid ${error ? "#E8603C" : "rgba(255,255,255,0.15)"}`, color: "#FFFFFF", fontSize: 12, outline: "none", fontFamily: "'Space Mono',monospace", boxSizing: "border-box" }}
            />
            {error && <div style={{ color: "#FF7A5A", fontSize: 11, marginTop: 6, fontWeight: 600 }}>{error}</div>}
          </div>

          <button className="ls-btn" onClick={handleSignIn} disabled={loading || !password}
            style={{ width: "100%", padding: "12px", background: loading ? "rgba(254,197,2,0.35)" : "#FEC502", color: "#05080A", border: "none", fontSize: 12, fontWeight: 900, cursor: loading || !password ? "not-allowed" : "pointer", letterSpacing: "0.1em", transition: "all 0.15s", boxSizing: "border-box" }}>
            {loading ? "AUTHENTICATING..." : "SIGN IN →"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em" }}>
          DEMO PASSWORD · Test1234!
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
// Demo auth — validates credentials locally and persists session in localStorage
function useDemoAuth() {
  const getStored = () => { try { return JSON.parse(localStorage.getItem("osiris_session") || "null"); } catch { return null; } };
  const [session, setSession] = useState(getStored);

  const login = (email, password) => {
    const acc = DEMO_ACCOUNTS.find(
      a => a.email.toLowerCase() === email.toLowerCase() && a.password === password
    );
    if (!acc) return false;
    const s = { email: acc.email, profile: acc.profile };
    localStorage.setItem("osiris_session", JSON.stringify(s));
    setSession(s);
    return true;
  };

  const logout = () => { localStorage.removeItem("osiris_session"); setSession(null); };

  return { isAuthenticated: !!session, user: session ? { email: session.email } : null, authProfile: session?.profile || null, login, logout };
}

export default function OsirisApp() {
  const { isAuthenticated, user, authProfile, login, logout } = useDemoAuth();

  const [page, setPage] = useState("monitor");
  const [focusAlert, setFocusAlert] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Real data state
  const [globalAlerts, setGlobalAlerts] = useState([]);
  const [globalSuppliers, setGlobalSuppliers] = useState([]);
  const [globalAuditLogs, setGlobalAuditLogs] = useState([]);
  const [systemProfiles, setSystemProfiles] = useState(PROFILES);

  // Profile selection state (loaded from Supabase / Auth0 mapped)
  const [currentProfile, setCurrentProfileState] = useState(MANUFACTURER);
  const [showToast, setShowToast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authProfile) {
      setCurrentProfileState(authProfile);
      setActiveProfileId(authProfile.name);
    }
  }, [authProfile]);

  const setCurrentProfile = (profile) => {
    setCurrentProfileState(profile);
    setActiveProfileId(profile.name);
    setShowToast(`Profile switched to ${profile.name} — all risk calculations updated`);
    setTimeout(() => setShowToast(null), 3000);
  };

  // Fetch from supabase logic
  useEffect(() => {
    async function loadData() {
      // Fetch disruptions + profiles + active profile ID concurrently
      const [data, suppliersData, auditData, dbProfiles, activeId] = await Promise.all([
        getDisruptionHistory(50),
        getSuppliers(),
        getAuditLogs(100),
        getProfiles(),
        getActiveProfileId()
      ]);

      let profilesToUse = PROFILES;
      if (dbProfiles && dbProfiles.length > 0) {
        profilesToUse = dbProfiles.map(p => ({
          ...p.profile_data,
          name: p.name
        }));
        setSystemProfiles(profilesToUse);
        window.systemProfiles = profilesToUse; // expose for sidebar
      } else if (dbProfiles && dbProfiles.length === 0) {
        // DB empty, seed it
        await Promise.all(PROFILES.map(p => saveProfile(p.name, p)));
        await setActiveProfileId("NorthStar Electronics");
      }

      const active = activeId ? profilesToUse.find(p => p.name === activeId) : profilesToUse.find(p => p.name === "NorthStar Electronics");
      setCurrentProfileState(active || profilesToUse[0]);

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
    let activeUnsub = null;
    let isMounted = true;

    subscribeToDisruptions(() => {
      if (isMounted) loadData();
    }).then(unsub => {
      if (!isMounted && unsub) unsub();
      else activeUnsub = unsub;
    });

    // Clean up
    return () => {
      isMounted = false;
      if (activeUnsub) activeUnsub();
    };
  }, []);

  if (!isAuthenticated) return <LoginScreen onLogin={login} />;

  const handleViewAlert = (alert) => { setFocusAlert(alert); setPage("analysis"); };
  const handleAnalyze = (alert) => { setFocusAlert(alert); setPage("analysis"); };

  const PAGE_META = {
    monitor: { title: "Live Disruption Monitor", subtitle: `${currentProfile.name} · ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ` },
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
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Space Grotesk', system-ui, sans-serif; border-radius: 0 !important; }
        body { background: #FFFFFF; font-family: 'Space Grotesk', system-ui, sans-serif; color: #0D1C2B; }
        button { font-family: 'Space Grotesk', system-ui, sans-serif; cursor: pointer; }
        input, select, textarea { font-family: 'Space Grotesk', system-ui, sans-serif; }
        img { border-radius: 0 !important; }
        .circle-dot { border-radius: 50% !important; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pingAnim { 0% { transform: scale(1); opacity: .8; } 75%, 100% { transform: scale(2.4); opacity: 0; } }
@keyframes pulseAnim { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes spin { 100% { transform: rotate(360deg); } }
@keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
@keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-thumb { background: #FEC502; }
        ::-webkit-scrollbar-track { background: transparent; }
`}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar page={page} setPage={setPage} currentProfile={currentProfile} setCurrentProfile={setCurrentProfile} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: C.bg, height: "100vh", overflow: "hidden", position: "relative" }}>
          <TickerTape alerts={globalAlerts} />
          <Topbar
            title={meta.title}
            subtitle={meta.subtitle}
            flash={showToast !== null}
            profileBadge={{ name: currentProfile.name, email: user?.email || "" }}
            onSignOut={logout}
            action={
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  style={{ height: 32, padding: "0 12px", borderRadius: 6, border: `1px solid ${C.brand}`, background: chatOpen ? C.brand : "transparent", color: chatOpen ? "#12263A" : C.brand, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace", transition: "all 0.2s" }}
                >
                  Ask OSIRIS
                </button>
              </div>
            }
          />

          {showToast && (
            <div style={{ position: "absolute", top: 16, right: 300, background: C.sidebar, border: `2px solid ${C.brand}`, color: "#FFFFFF", padding: "12px 18px", fontSize: 12, fontWeight: 700, zIndex: 9999, transition: "opacity 0.3s", boxShadow: "0 4px 24px rgba(0,0,0,0.6)", fontFamily: "'Space Mono',monospace", letterSpacing: "0.04em" }}>
              {showToast}
            </div>
          )}

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: C.textMid, fontFamily: "'Fira Code',sans-serif" }}>
              Connecting to global supply network...
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {/* the pages need globalAlerts now instead of relying directly on ACTIVE_ALERTS */}
              {page === "monitor" && <MonitorPage onAnalyze={handleAnalyze} globalAlerts={globalAlerts} currentProfile={currentProfile} />}
              {page === "analysis" && <AnalysisPage focusAlert={focusAlert} globalAlerts={globalAlerts} currentProfile={currentProfile} chatOpen={chatOpen} />}
              {page === "playbook" && <PlaybookPage globalAlerts={globalAlerts} />}
              {page === "suppliers" && <SuppliersPage globalSuppliers={globalSuppliers} currentProfile={currentProfile} />}
              {page === "audit" && <AuditPage globalAuditLogs={globalAuditLogs} />}
              {page === "settings" && <SettingsPage currentProfile={currentProfile} setCurrentProfile={setCurrentProfile} systemProfiles={systemProfiles} />}
              <div style={{ height: 100, flexShrink: 0 }} />
            </div>
          )}
        </div>
      </div>

      {!loading && <AlertWidget onViewDashboard={handleViewAlert} globalAlerts={globalAlerts} chatOpen={chatOpen} />}
      <AskOsirisSidebar open={chatOpen} selectedAlert={focusAlert} profile={currentProfile} />
    </>
  );
}
