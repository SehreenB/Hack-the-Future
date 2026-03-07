// ─── OSIRIS Supply Risk Scanner — Content Script ──────────────────────────────
// Scans the page for supplier/product/commodity names from active OSIRIS alerts
// and annotates them with a Grammarly-style underline + floating risk card.

const OSIRIS_URL = "http://localhost:3000";

// ── Feature 3: Supplier Website Auto-Detection ────────────────────────────────
// Maps known supplier hostnames → the OSIRIS alert they're associated with.
const SUPPLIER_DOMAINS = {
    // Semiconductors / PCB
    "tsmc.com": { id: "NXS-001", severity: "critical", title: "Taiwan Strait Corridor Closure", riskScore: 87 },
    "taiwansemiconductor.com": { id: "NXS-001", severity: "critical", title: "Taiwan Strait Corridor Closure", riskScore: 87 },
    "foxconn.com": { id: "NXS-001", severity: "critical", title: "Taiwan Strait Corridor Closure", riskScore: 87 },
    "honhai.com": { id: "NXS-001", severity: "critical", title: "Taiwan Strait Corridor Closure", riskScore: 87 },
    "samsung.com": { id: "NXS-001", severity: "high", title: "Taiwan Strait Supply Pressure", riskScore: 68 },
    "skhynix.com": { id: "NXS-001", severity: "high", title: "Taiwan Strait Supply Pressure", riskScore: 63 },
    // Shipping / Logistics
    "maersk.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting — Transit +14 Days", riskScore: 72 },
    "msc.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting — Transit +14 Days", riskScore: 72 },
    "cmacgm.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting — Transit +14 Days", riskScore: 72 },
    "hapag-lloyd.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting — Transit +14 Days", riskScore: 72 },
    // Chemicals / Polymers
    "basf.com": { id: "NXS-003", severity: "medium", title: "BASF Freeport Plant Explosion", riskScore: 54 },
    "basf-corp.com": { id: "NXS-003", severity: "medium", title: "BASF Freeport Plant Explosion", riskScore: 54 },
    // Automotive
    "bosch.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting Impacts Auto Parts", riskScore: 65 },
    "continental.com": { id: "NXS-002", severity: "high", title: "Red Sea Rerouting Impacts Auto Parts", riskScore: 65 },
};

const BANNER_COLORS = {
    critical: { bg: "#7f1d1d", border: "#D36135", badge: "#D36135", text: "#fee2e2" },
    high: { bg: "#431407", border: "#A63C06", badge: "#A63C06", text: "#fed7aa" },
    medium: { bg: "#422006", border: "#d4a500", badge: "#d4a500", text: "#fef3c7" },
    low: { bg: "#1e3a5f", border: "#2563eb", badge: "#2563eb", text: "#dbeafe" },
};

function showSupplierBanner() {
    const hostname = window.location.hostname.replace(/^www\./, "");
    // Check exact match or if hostname ends with a known domain (e.g. subdomain.tsmc.com)
    const match = SUPPLIER_DOMAINS[hostname] ||
        Object.entries(SUPPLIER_DOMAINS).find(([domain]) => hostname.endsWith("." + domain) || hostname === domain)?.[1];
    if (!match) return;

    const colors = BANNER_COLORS[match.severity] || BANNER_COLORS.medium;
    const severityLabel = match.severity.toUpperCase();

    const banner = document.createElement("div");
    banner.id = "osiris-supplier-banner";
    banner.setAttribute("style", `
        all: initial;
        display: flex !important;
        align-items: center !important;
        gap: 14px !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 2147483647 !important;
        background: ${colors.bg} !important;
        border-bottom: 2px solid ${colors.border} !important;
        padding: 11px 20px !important;
        font-family: 'Segoe UI', system-ui, sans-serif !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important;
    `);

    banner.innerHTML = `
        <span style="all:initial; display:inline-block; background:${colors.badge}; color:#fff; font-size:10px; font-weight:900; padding:3px 9px; border-radius:3px; letter-spacing:0.1em; font-family:'Courier New',monospace; flex-shrink:0;">
            ⚠ OSIRIS · ${severityLabel}
        </span>
        <span style="all:initial; display:inline-block; font-size:13px; font-weight:600; color:${colors.text}; flex:1; font-family:'Segoe UI',system-ui,sans-serif;">
            This supplier has an active OSIRIS alert: <strong style="color:white;">${match.title}</strong>
            <span style="color:${colors.badge}; font-weight:700; font-family:'Courier New',monospace; margin-left:8px;">Risk ${match.riskScore}/100</span>
        </span>
        <a href="${OSIRIS_URL}?alert=${match.id}&page=risk" target="_blank"
            style="all:initial; display:inline-block; background:${colors.badge}; color:#fff; font-size:11px; font-weight:700; padding:7px 14px; border-radius:4px; cursor:pointer; text-decoration:none; font-family:'Courier New',monospace; letter-spacing:0.05em; flex-shrink:0; white-space:nowrap;">
            Open in OSIRIS →
        </a>
        <button id="osiris-banner-close"
            style="all:initial; display:inline-block; background:rgba(255,255,255,0.15); color:${colors.text}; border:none; border-radius:3px; padding:5px 10px; font-size:14px; line-height:1; cursor:pointer; flex-shrink:0;">
            ✕
        </button>
    `;

    // Push page content down to avoid banner overlap
    document.body.style.marginTop = "52px";
    document.body.insertAdjacentElement("beforebegin", banner);
    // Actually prepend as first child of documentElement
    document.documentElement.insertBefore(banner, document.body);

    document.getElementById("osiris-banner-close")?.addEventListener("click", () => {
        banner.remove();
        document.body.style.marginTop = "";
    });
}

// Run banner check immediately (before DOM scan)
showSupplierBanner();

// ── Risk database: keywords → alert data ──────────────────────────────────────
// In production this would be fetched from the OSIRIS backend.
// For the demo, it mirrors the active alerts in NexusApp.jsx.
const RISK_DATABASE = [
    {
        id: "NXS-001",
        severity: "critical",
        riskScore: 87,
        title: "Taiwan Strait Corridor Closure",
        summary: "Escalating military activity near the Taiwan Strait has triggered force majeure declarations across 3 Tier-1 semiconductor suppliers.",
        revenueAtRisk: "$4.2M",
        stockout: "8 days",
        keywords: ["TSMC", "Hon Hai", "Taiwan", "Taiwan Strait", "semiconductor", "semiconductors", "SKU-4421", "SKU-4422", "Foxconn", "DRAM", "wafer", "fab", "foundry"],
    },
    {
        id: "NXS-002",
        severity: "high",
        riskScore: 72,
        title: "Red Sea Rerouting — Transit +14 Days",
        summary: "Houthi maritime activity has forced major carriers to reroute around Cape of Good Hope, adding 14+ days to EU-Asia transit times.",
        revenueAtRisk: "$1.8M",
        stockout: "18 days",
        keywords: ["Red Sea", "Suez", "Suez Canal", "Houthi", "Cape of Good Hope", "Maersk", "MSC", "CMA CGM", "container ship", "shipping lane", "freight", "transit", "automotive parts", "Bosch", "Continental"],
    },
    {
        id: "NXS-003",
        severity: "medium",
        riskScore: 54,
        title: "BASF Freeport Plant Explosion",
        summary: "Explosion at BASF Freeport chemical plant has disrupted specialty polymer supply for Gulf Coast operations.",
        revenueAtRisk: "$620K",
        stockout: "32 days",
        keywords: ["BASF", "Freeport", "polymer", "polymers", "specialty polymer", "chemical plant", "Gulf Coast", "polycarbonate", "nylon", "ethylene"],
    },
];

const SEV_COLORS = {
    critical: { bg: "#FEC502", text: "#0D1C2B", border: "#d4a500", badge: "#D36135" },
    high: { bg: "#fff3ed", text: "#0D1C2B", border: "#A63C06", badge: "#A63C06" },
    medium: { bg: "#fffbeb", text: "#0D1C2B", border: "#d4a500", badge: "#d4a500" },
};

// ── Build a flat keyword → alert map ──────────────────────────────────────────
const keywordMap = new Map(); // lowercase keyword → alert object
RISK_DATABASE.forEach(alert => {
    alert.keywords.forEach(kw => {
        keywordMap.set(kw.toLowerCase(), alert);
    });
});

// Sort keywords longest-first to match greedily
const sortedKeywords = [...keywordMap.keys()].sort((a, b) => b.length - a.length);

// ── State ──────────────────────────────────────────────────────────────────────
let activeCard = null;
let matchCount = 0;

// ── Main: scan and annotate ────────────────────────────────────────────────────
function scanAndAnnotate() {
    const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "OSIRIS-HIGHLIGHT"]);

    function walkTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (!parent || skipTags.has(parent.tagName) || parent.closest("osiris-highlight")) return;
            annotateText(node);
        } else if (node.nodeType === Node.ELEMENT_NODE && !skipTags.has(node.tagName)) {
            // Clone childNodes because annotateText mutates the DOM
            [...node.childNodes].forEach(walkTextNodes);
        }
    }

    walkTextNodes(document.body);
    updateBadge();
}

// ── Annotate a single text node ───────────────────────────────────────────────
function annotateText(textNode) {
    const text = textNode.textContent;
    if (!text.trim()) return;

    // Find earliest keyword match
    let bestMatch = null;
    let bestIndex = Infinity;
    let bestKw = "";

    for (const kw of sortedKeywords) {
        const idx = text.toLowerCase().indexOf(kw);
        if (idx !== -1 && idx < bestIndex) {
            bestIndex = idx;
            bestMatch = keywordMap.get(kw);
            bestKw = kw;
        }
    }

    if (!bestMatch) return;

    // Found a match — split into before / highlight / after
    const originalKwText = text.substring(bestIndex, bestIndex + bestKw.length);
    const before = document.createTextNode(text.substring(0, bestIndex));
    const after = document.createTextNode(text.substring(bestIndex + bestKw.length));

    const highlight = document.createElement("osiris-highlight");
    highlight.setAttribute("osiris-id", bestMatch.id);
    highlight.setAttribute("osiris-severity", bestMatch.severity);
    highlight.textContent = originalKwText;
    highlight.title = `OSIRIS: ${bestMatch.title}`;

    const parent = textNode.parentNode;
    parent.replaceChild(after, textNode);
    parent.insertBefore(highlight, after);
    parent.insertBefore(before, highlight);

    matchCount++;

    // Recurse into the "after" text node to find more matches
    if (after.textContent.trim()) annotateText(after);

    // Attach hover events to show risk card
    highlight.addEventListener("mouseenter", (e) => showCard(e, bestMatch, highlight));
    highlight.addEventListener("mouseleave", (e) => {
        // Delay hide to allow moving into the card
        setTimeout(() => {
            if (activeCard && !activeCard.matches(":hover")) hideCard();
        }, 150);
    });
}

// ── Risk card ─────────────────────────────────────────────────────────────────
function showCard(e, alert, anchor) {
    hideCard();

    const colors = SEV_COLORS[alert.severity] || SEV_COLORS.medium;
    const rect = anchor.getBoundingClientRect();

    const card = document.createElement("div");
    card.id = "osiris-risk-card";
    card.innerHTML = `
    <div class="osiris-card-header" style="background:${colors.bg}; color:${colors.text};">
      <div class="osiris-card-logo">
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
          <polygon points="50,6 6,88 94,88" stroke="${colors.text}" stroke-width="5" fill="none"/>
          <line x1="50" y1="6" x2="28" y2="55" stroke="${colors.text}" stroke-width="2" opacity="0.6"/>
          <line x1="50" y1="6" x2="72" y2="55" stroke="${colors.text}" stroke-width="2" opacity="0.6"/>
          <line x1="28" y1="55" x2="72" y2="55" stroke="${colors.text}" stroke-width="2" opacity="0.6"/>
          <circle cx="50" cy="6" r="6" fill="${colors.badge}"/>
          <circle cx="28" cy="55" r="5" fill="#FEC502"/>
          <circle cx="72" cy="55" r="5" fill="${colors.badge}"/>
        </svg>
      </div>
      <div>
        <div class="osiris-card-brand">OSIRIS</div>
        <div class="osiris-card-sub">Supply Risk Alert</div>
      </div>
      <div class="osiris-card-badge" style="background:${colors.badge}; color:#fff;">${alert.severity.toUpperCase()}</div>
    </div>
    <div class="osiris-card-body">
      <div class="osiris-card-id">${alert.id} · Risk Score</div>
      <div class="osiris-card-score" style="color:${colors.badge};">${alert.riskScore}<span>/100</span></div>
      <div class="osiris-card-title">${alert.title}</div>
      <div class="osiris-card-summary">${alert.summary}</div>
      <div class="osiris-card-stats">
        <div class="osiris-stat"><div class="osiris-stat-label">REV AT RISK</div><div class="osiris-stat-value">${alert.revenueAtRisk}</div></div>
        <div class="osiris-stat"><div class="osiris-stat-label">STOCKOUT</div><div class="osiris-stat-value">${alert.stockout}</div></div>
      </div>
      <a class="osiris-card-cta" href="${OSIRIS_URL}?alert=${alert.id}&page=risk" target="_blank">Open Risk Analysis in OSIRIS →</a>
    </div>
  `;

    document.body.appendChild(card);
    activeCard = card;

    // Position the card below the highlighted word
    const top = rect.bottom + window.scrollY + 8;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 340);
    card.style.top = `${top}px`;
    card.style.left = `${Math.max(8, left)}px`;

    card.addEventListener("mouseleave", hideCard);
}

function hideCard() {
    if (activeCard) {
        activeCard.remove();
        activeCard = null;
    }
}

// ── Badge update (tells background how many matches + which alert IDs) ──────────
function updateBadge() {
    const matchedNodes = document.querySelectorAll("osiris-highlight");
    const matchedAlertIds = [...new Set(
        [...matchedNodes].map(n => n.getAttribute("osiris-id")).filter(Boolean)
    )];
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", count: matchCount, alerts: RISK_DATABASE, matchedAlertIds });
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Wait for DOM to be ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndAnnotate);
} else {
    scanAndAnnotate();
}
