// ─────────────────────────────────────────────────────────────────────────────
// data/manufacturerProfile.js
// Hardcoded mock manufacturer profile — the grounding foundation for all AI analysis
// Replace with real data loaded from your ERP / database in production
// ─────────────────────────────────────────────────────────────────────────────

export const MANUFACTURER_PROFILE = {
  company: {
    name: "NorthStar Electronics Manufacturing",
    industry: "Electronic Components Manufacturing",
    annualRevenue: "$142M",
    dailyRevenue: "$389K",
    employeeCount: 840,
    productionSites: ["Toronto, ON", "Detroit, MI", "Austin, TX"],
  },

  suppliers: [
    {
      id: "SUP-001",
      name: "TSMC",
      tier: 1,
      commodity: "Semiconductor Wafers",
      region: "Taiwan",
      country: "Taiwan",
      lat: 24.1477,
      lng: 120.6736,
      annualSpend: "$18.2M",
      leadTimeDays: 90,
      safetyStockDays: 8,
      contractExpiry: "2026-03-31",
      alternativeSuppliers: ["Samsung Foundry", "GlobalFoundries"],
      concentrationRisk: "High",
      ticker: "TSM",
    },
    {
      id: "SUP-002",
      name: "Hon Hai (Foxconn)",
      tier: 1,
      commodity: "PCB Assembly",
      region: "Taiwan / Shenzhen",
      country: "Taiwan",
      lat: 22.3193,
      lng: 114.1694,
      annualSpend: "$12.4M",
      leadTimeDays: 45,
      safetyStockDays: 12,
      contractExpiry: "2025-09-30",
      alternativeSuppliers: ["Jabil", "Flex Ltd"],
      concentrationRisk: "High",
      ticker: "HNHPF",
    },
    {
      id: "SUP-003",
      name: "BASF SE",
      tier: 2,
      commodity: "Specialty Polymer Resins",
      region: "Gulf Coast, USA",
      country: "United States",
      lat: 28.9784,
      lng: -95.3698,
      annualSpend: "$3.8M",
      leadTimeDays: 21,
      safetyStockDays: 18,
      contractExpiry: "2026-12-31",
      alternativeSuppliers: ["Dow Chemical", "SABIC"],
      concentrationRisk: "Medium",
      ticker: "BASFY",
    },
    {
      id: "SUP-004",
      name: "Murata Manufacturing",
      tier: 1,
      commodity: "Passive Electronic Components",
      region: "Kyoto, Japan",
      country: "Japan",
      lat: 35.0116,
      lng: 135.7681,
      annualSpend: "$8.1M",
      leadTimeDays: 60,
      safetyStockDays: 22,
      contractExpiry: "2026-06-30",
      alternativeSuppliers: ["TDK", "Yageo"],
      concentrationRisk: "Medium",
      ticker: "MRAAY",
    },
    {
      id: "SUP-005",
      name: "Flex Ltd",
      tier: 1,
      commodity: "Final Assembly & Testing",
      region: "Guadalajara, Mexico",
      country: "Mexico",
      lat: 20.6597,
      lng: -103.3496,
      annualSpend: "$22.6M",
      leadTimeDays: 14,
      safetyStockDays: 7,
      contractExpiry: "2025-12-31",
      alternativeSuppliers: ["Jabil", "Celestica"],
      concentrationRisk: "High",
      ticker: "FLEX",
    },
  ],

  billOfMaterials: [
    { skuId: "SKU-4421", name: "Processor Module A", supplierId: "SUP-001", unitCost: 24.50, weeklyVolume: 2400, criticalityLevel: "Critical" },
    { skuId: "SKU-4422", name: "Memory Module B", supplierId: "SUP-001", unitCost: 18.20, weeklyVolume: 2400, criticalityLevel: "Critical" },
    { skuId: "SKU-5891", name: "Main PCB Assembly", supplierId: "SUP-002", unitCost: 62.00, weeklyVolume: 1200, criticalityLevel: "Critical" },
    { skuId: "SKU-3310", name: "Polymer Housing", supplierId: "SUP-003", unitCost: 8.40, weeklyVolume: 3600, criticalityLevel: "High" },
    { skuId: "SKU-2200", name: "Capacitor Array", supplierId: "SUP-004", unitCost: 2.10, weeklyVolume: 12000, criticalityLevel: "Medium" },
  ],

  openPurchaseOrders: [
    { poId: "PO-8821", supplierId: "SUP-001", value: "$1.2M", dueDate: "2025-03-15", status: "In Transit" },
    { poId: "PO-8834", supplierId: "SUP-001", value: "$640K", dueDate: "2025-04-01", status: "Processing" },
    { poId: "PO-8842", supplierId: "SUP-002", value: "$890K", dueDate: "2025-03-22", status: "In Transit" },
    { poId: "PO-8851", supplierId: "SUP-005", value: "$1.8M", dueDate: "2025-03-18", status: "In Transit" },
  ],

  logisticsCorridors: [
    { id: "LC-01", name: "Transpacific (Taiwan → Vancouver)", riskLevel: "High", currentDelay: "14 days", spotRateIndex: "+340%", freightosIndex: 3420 },
    { id: "LC-02", name: "Suez / Red Sea (EU → East Coast)", riskLevel: "High", currentDelay: "14 days", spotRateIndex: "+85%", freightosIndex: 2140 },
    { id: "LC-03", name: "Trans-Pacific (Japan → LA)", riskLevel: "Medium", currentDelay: "3 days", spotRateIndex: "+12%", freightosIndex: 890 },
    { id: "LC-04", name: "Mexico → US (Land)", riskLevel: "Low", currentDelay: "0 days", spotRateIndex: "+3%", freightosIndex: 210 },
  ],

  inventoryLevels: {
    lastUpdated: new Date().toISOString(),
    items: [
      { skuId: "SKU-4421", currentStock: 19200, safetyStock: 9600, daysOfSupply: 8, status: "Critical" },
      { skuId: "SKU-4422", currentStock: 19200, safetyStock: 9600, daysOfSupply: 8, status: "Critical" },
      { skuId: "SKU-5891", currentStock: 14400, safetyStock: 8400, daysOfSupply: 12, status: "Warning" },
      { skuId: "SKU-3310", currentStock: 64800, safetyStock: 21600, daysOfSupply: 18, status: "Adequate" },
      { skuId: "SKU-2200", currentStock: 264000, safetyStock: 84000, daysOfSupply: 22, status: "Adequate" },
    ],
  },

  slaCommitments: {
    customerFacingLeadTime: "10 business days",
    onTimeDeliveryTarget: "97.5%",
    penaltyClause: "$25K per day downtime beyond 72 hours",
    keyCustomers: ["Tier-1 OEM A", "Tier-1 OEM B", "Government Contract GC-4421"],
  },

  escalationContacts: [
    { role: "Ops Lead", name: "Sarah Chen", phone: "+1-416-555-0142", email: "s.chen@northstar.com" },
    { role: "Procurement Director", name: "Marcus Johnson", phone: "+1-416-555-0198", email: "m.johnson@northstar.com" },
    { role: "CFO", name: "Dr. Aisha Patel", phone: "+1-416-555-0201", email: "a.patel@northstar.com" },
  ],
};

// Signal scanning keywords derived from the profile
export const PROFILE_KEYWORDS = [
  ...MANUFACTURER_PROFILE.suppliers.map(s => s.name),
  ...MANUFACTURER_PROFILE.suppliers.map(s => s.commodity),
  ...MANUFACTURER_PROFILE.suppliers.map(s => s.region),
  "semiconductor shortage",
  "freight spike",
  "supply chain disruption",
  "Taiwan Strait",
  "Red Sea",
  "force majeure",
];
