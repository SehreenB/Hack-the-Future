// ─── OSIRIS Extension — Popup Script ──────────────────────────────────────────

const OSIRIS_URL = "http://localhost:3000";

const SEV_COLORS = {
  critical: { bg: "#FEC502", text: "#0D1C2B", badge: "#D36135" },
  high: { bg: "#fff3ed", text: "#0D1C2B", badge: "#A63C06" },
  medium: { bg: "#fffbeb", text: "#0D1C2B", badge: "#d4a500" },
};

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const key = `matches_${tab.id}`;
  const stored = await chrome.storage.session.get(key);
  const data = stored[key];

  const headerCount = document.getElementById("header-count");
  const statusText = document.getElementById("status-text");
  const content = document.getElementById("content");

  if (!data || data.count === 0) {
    headerCount.textContent = "0";
    headerCount.style.background = "#30BCED";
    statusText.textContent = "NO RISKS DETECTED ON THIS PAGE";
    statusText.style.color = "#30BCED";

    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✓</div>
        <div class="empty-title">Page looks clean</div>
        <div class="empty-sub">No supply chain risk keywords detected. OSIRIS is monitoring in the background.</div>
      </div>
    `;
    return;
  }

  const { count, alerts, matchedAlertIds = [] } = data;
  headerCount.textContent = count;
  statusText.textContent = `${count} RISK SIGNAL${count !== 1 ? "S" : ""} DETECTED`;
  statusText.style.color = count > 0 ? "#D36135" : "#30BCED";

  // Only show alerts that were actually matched on this page
  const relevantAlerts = matchedAlertIds.length > 0
    ? alerts.filter(a => matchedAlertIds.includes(a.id))
    : alerts;

  const listEl = document.createElement("div");
  listEl.className = "alert-list";

  relevantAlerts.forEach(alert => {
    const colors = SEV_COLORS[alert.severity] || SEV_COLORS.medium;
    const deepLink = `${OSIRIS_URL}?alert=${alert.id}&page=risk`;

    const item = document.createElement("div");
    item.className = "alert-item";
    item.innerHTML = `
      <div class="alert-row">
        <div style="flex-shrink:0; text-align:center; margin-right:4px;">
          <div class="alert-score" style="color:${colors.badge};">${alert.riskScore}</div>
          <div class="alert-score-label">/100</div>
        </div>
        <div style="flex:1; min-width:0;">
          <div class="alert-row" style="margin-bottom:4px; flex-wrap:wrap; gap:4px;">
            <span class="alert-sev" style="background:${colors.badge}; color:#fff;">${alert.severity.toUpperCase()}</span>
            <span class="alert-id">${alert.id}</span>
          </div>
          <div class="alert-title">${alert.title}</div>
          <div class="alert-meta">${alert.revenueAtRisk} at risk &nbsp;·&nbsp; Stockout: ${alert.stockout}</div>
        </div>
      </div>

      <!-- ⚡ Quick-launch button -->
      <a class="alert-launch" href="${deepLink}" target="_blank">
        ⚡ Open Risk Analysis in OSIRIS →
      </a>
    `;
    listEl.appendChild(item);
  });

  content.appendChild(listEl);
}

document.addEventListener("DOMContentLoaded", init);
