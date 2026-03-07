# OSIRIS Supply Risk Scanner — Chrome Extension

## What it does

Scans any web page for supplier names, product keywords, and commodities that match active OSIRIS supply chain alerts. When a match is found, it underlines the text (like Grammarly) and shows a floating risk card with:

- Risk score (0–100)
- Alert title & summary
- Revenue at risk & stockout days
- One-click link to open OSIRIS dashboard

## Install in Chrome (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **"Load unpacked"**
4. Select this `extension/` folder
5. The OSIRIS icon appears in your toolbar ✓

## How to test

1. Make sure the OSIRIS dashboard is running at `http://localhost:3000`
2. Go to any of these pages to see it in action:
   - Search "TSMC" or "Taiwan Strait" on Google News
   - Visit [reuters.com](https://reuters.com) and search "Red Sea shipping"
   - Visit [wsj.com](https://wsj.com) and search "BASF"
   - Visit any supplier or ERP page that mentions **TSMC, Hon Hai, Red Sea, BASF, Suez, semiconductors, automotive parts, specialty polymers**

## Risk keywords detected

| Alert | Keywords |
|---|---|
| NXS-001 Critical | TSMC, Hon Hai, Taiwan Strait, semiconductor, SKU-4421, SKU-4422, Foxconn, wafer, foundry |
| NXS-002 High | Red Sea, Suez, Houthi, Cape of Good Hope, Maersk, automotive parts, freight |
| NXS-003 Medium | BASF, Freeport, specialty polymer, chemical plant, Gulf Coast, polycarbonate |

## Extension files

```
extension/
├── manifest.json       Chrome extension config (Manifest V3)
├── content.js          Page scanner + risk card logic
├── styles.css          Grammarly-style underlines + floating card styles
├── background.js       Badge count updater
├── popup.html          Toolbar popup UI
├── popup.js            Popup data loader
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
