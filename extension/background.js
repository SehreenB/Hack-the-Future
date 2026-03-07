// ─── OSIRIS Extension — Background Service Worker ─────────────────────────────

const OSIRIS_URL = "http://localhost:3000";

// Track which alerts we've already notified about to avoid spam
const notifiedAlerts = new Set();

// ── Feature 1: Right-click Context Menu ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "osiris-check",
        title: "⚡ Check in OSIRIS",
        contexts: ["selection"],
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "osiris-check" && info.selectionText) {
        const query = encodeURIComponent(info.selectionText.trim());
        chrome.tabs.create({ url: `${OSIRIS_URL}?search=${query}&page=risk` });
    }
});

// ── Handle messages from content script ───────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "UPDATE_BADGE") {
        const { count, alerts, matchedAlertIds } = message;
        const tabId = sender.tab?.id;
        if (!tabId) return;

        // Update toolbar badge
        if (count > 0) {
            chrome.action.setBadgeText({ text: String(count), tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#D36135", tabId });
        } else {
            chrome.action.setBadgeText({ text: "", tabId });
        }

        // Store for popup + side panel to read
        chrome.storage.session.set({
            [`matches_${tabId}`]: { count, alerts, matchedAlertIds, url: sender.tab?.url }
        });

        // ── 🔔 Push notification for critical alerts (once per alert per session) ──
        if (matchedAlertIds && matchedAlertIds.length > 0) {
            const toNotify = alerts.filter(
                a => a.severity === "critical" &&
                    matchedAlertIds.includes(a.id) &&
                    !notifiedAlerts.has(a.id)
            );

            toNotify.forEach(alert => {
                notifiedAlerts.add(alert.id);

                chrome.notifications.create(`osiris-${alert.id}`, {
                    type: "basic",
                    iconUrl: "icons/icon128.png",
                    title: `OSIRIS — CRITICAL RISK DETECTED`,
                    message: `${alert.title}\n${alert.revenueAtRisk} at risk · ${alert.stockout} to stockout`,
                    contextMessage: `on: ${sender.tab?.url?.replace(/^https?:\/\//, "").split("/")[0] || "current page"}`,
                    priority: 2,
                    buttons: [
                        { title: "Open Risk Analysis →" },
                        { title: "Dismiss" }
                    ]
                });
            });
        }
    }

    // ── Feature 2: Open side panel from popup ─────────────────────────────────
    if (message.type === "OPEN_SIDE_PANEL") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.sidePanel.open({ tabId: tabs[0].id });
            }
        });
    }
});

// ── Notification button clicks ─────────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener((notifId, btnIndex) => {
    if (btnIndex === 0) {
        // "Open Risk Analysis" → deep-link straight to the risk page with alert selected
        const alertId = notifId.replace("osiris-", "");
        chrome.tabs.create({ url: `${OSIRIS_URL}?alert=${alertId}&page=risk` });
    }
    chrome.notifications.clear(notifId);
});

// ── Clicking the notification body also opens OSIRIS ──────────────────────────
chrome.notifications.onClicked.addListener((notifId) => {
    const alertId = notifId.replace("osiris-", "");
    chrome.tabs.create({ url: `${OSIRIS_URL}?alert=${alertId}&page=risk` });
    chrome.notifications.clear(notifId);
});

// ── Clear badge when tab navigates ────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
        chrome.action.setBadgeText({ text: "", tabId });
    }
});
