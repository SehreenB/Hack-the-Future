// ─── OSIRIS Side Panel ─────────────────────────────────────────────────────────

const OSIRIS_URL = "http://localhost:3000";

const SEV_CONFIG = {
    critical: { badgeClass: "badge-critical", scoreColor: "#D36135", label: "CRITICAL" },
    high: { badgeClass: "badge-high", scoreColor: "#A63C06", label: "HIGH" },
    medium: { badgeClass: "badge-medium", scoreColor: "#d4a500", label: "MEDIUM" },
    low: { badgeClass: "badge-low", scoreColor: "#2563eb", label: "LOW" },
};

// ── Render alerts into the panel ──────────────────────────────────────────────
function renderAlerts(data) {
    const container = document.getElementById("alerts-container");
    const sectionLabel = document.getElementById("section-label");
    const pageUrl = document.getElementById("page-url");

    if (data?.url) {
        try {
            const u = new URL(data.url);
            pageUrl.textContent = u.hostname + (u.pathname !== "/" ? u.pathname : "");
        } catch {
            pageUrl.textContent = data.url;
        }
    } else {
        pageUrl.textContent = "—";
    }

    const matched = data?.alerts?.filter(a => data.matchedAlertIds?.includes(a.id)) ?? [];

    if (matched.length === 0) {
        sectionLabel.textContent = "DETECTED RISKS";
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-logo-wrap">
                    <img src="icons/icon128.png" alt="OSIRIS" />
                </div>
                <div class="empty-title">No risks detected</div>
                <div class="empty-sub">Navigate to a page mentioning supply chain terms to see OSIRIS alerts here.</div>
            </div>`;
        return;
    }

    sectionLabel.textContent = `DETECTED RISKS — ${matched.length} FOUND`;

    container.innerHTML = matched.map(alert => {
        const cfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.medium;
        return `
        <div class="alert-card">
            <div class="alert-header">
                <span class="alert-badge ${cfg.badgeClass}">${cfg.label}</span>
                <div class="alert-title">${alert.title}</div>
                <div class="alert-score" style="color:${cfg.scoreColor}">${alert.riskScore}</div>
            </div>
            <div class="alert-meta">
                <div>
                    <div class="alert-stat-label">REV AT RISK</div>
                    <div class="alert-stat-value">${alert.revenueAtRisk}</div>
                </div>
                <div>
                    <div class="alert-stat-label">STOCKOUT</div>
                    <div class="alert-stat-value">${alert.stockout}</div>
                </div>
                <div>
                    <div class="alert-stat-label">ALERT ID</div>
                    <div class="alert-stat-value">${alert.id}</div>
                </div>
            </div>
            <a class="alert-cta" href="${OSIRIS_URL}?alert=${alert.id}&page=risk" target="_blank">
                OPEN FULL ANALYSIS →
            </a>
        </div>`;
    }).join("");
}

// ── Load data for the active tab ──────────────────────────────────────────────
async function loadForActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    const key = `matches_${tabId}`;
    const result = await chrome.storage.session.get(key);
    renderAlerts(result[key] ?? null);
}

// ── React to tab switches and storage changes in real time ────────────────────
chrome.tabs.onActivated.addListener(() => loadForActiveTab());

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session") return;
    // Re-fetch whenever any matches key changes
    loadForActiveTab();
});

// ── Init ───────────────────────────────────────────────────────────────────────
loadForActiveTab();

// ── Dashboard button — wire directly (DOMContentLoaded already fired) ──────────
document.getElementById("open-dashboard")?.addEventListener("click", () => {
    chrome.tabs.create({ url: OSIRIS_URL });
});
