# NEXUS — Supply Disruption Decision-Support Co-Pilot

> Proactively detects global supply disruptions, quantifies operational and financial risk, simulates mitigation strategies, and generates ranked action playbooks. Human approves all actions. Nothing executes automatically.

---

## Project Structure

```
nexus-app/
├── NexusApp.jsx                  ← Single-file artifact (live preview)
├── .env.example                  ← All API keys — copy to .env.local
├── src/
│   ├── services/
│   │   ├── riskEngine.js         ← Claude AI — core analysis engine
│   │   ├── gnewsService.js       ← GNews — news signal ingestion
│   │   ├── gdeltService.js       ← GDELT — geopolitical signals (free)
│   │   ├── yahooFinanceService.js← Yahoo Finance — supplier financial health
│   │   ├── communicationService.js← Twilio + ElevenLabs + Retell
│   │   └── supabaseService.js    ← Postgres DB + real-time + audit log
│   ├── data/
│   │   └── manufacturerProfile.js← Hardcoded mock manufacturer profile
│   └── components/               ← Split components (see NexusApp.jsx for combined)
```

---

## API Setup — Step by Step

### 1. Anthropic (Claude) — Core AI Engine
- Go to: https://console.anthropic.com
- Create API key
- Add to `.env.local`: `VITE_ANTHROPIC_API_KEY=sk-ant-...`
- **Cost**: ~$0.003 per analysis run (Sonnet 3.5)

### 2. GNews — News Signal Detection
- Go to: https://gnews.io
- Free tier: 100 req/day (enough for polling every 15 min)
- Create account → API Keys tab → copy key
- Add to `.env.local`: `VITE_GNEWS_API_KEY=...`

### 3. GDELT — Geopolitical Signals
- **FREE, no key needed**
- Uses public API: `https://api.gdeltproject.org/api/v2/`
- Already wired in `gdeltService.js`

### 4. Yahoo Finance (via RapidAPI) — Supplier Financial Health
- Go to: https://rapidapi.com/apidojo/api/yahoo-finance1
- Subscribe to free tier
- Copy your RapidAPI key
- Add to `.env.local`: `VITE_RAPIDAPI_KEY=...`

### 5. Google Maps — Supplier Risk Map
- Go to: https://console.cloud.google.com
- Enable: Maps JavaScript API, Geocoding API, Places API
- Create API key (restrict to your domain in production)
- Add to `.env.local`: `VITE_GOOGLE_MAPS_API_KEY=...`

### 6. Twilio — SMS Escalation Alerts
- Go to: https://console.twilio.com
- Create account → get Account SID, Auth Token, phone number
- Add to `.env.local`:
  ```
  VITE_TWILIO_ACCOUNT_SID=AC...
  VITE_TWILIO_AUTH_TOKEN=...
  VITE_TWILIO_FROM_NUMBER=+1...
  ```
- ⚠️ In production: move Twilio calls to your backend (never expose auth token client-side)

### 7. ElevenLabs — Voice TTS for Call Scripts
- Go to: https://elevenlabs.io
- Create account → Profile → API Key
- Choose a voice → copy Voice ID
- Add to `.env.local`:
  ```
  VITE_ELEVENLABS_API_KEY=...
  VITE_ELEVENLABS_VOICE_ID=...
  ```

### 8. Retell AI — Conversational Outbound Calls
- Go to: https://www.retellai.com
- Create account → API Keys
- Add to `.env.local`: `VITE_RETELL_API_KEY=...`
- ⚠️ REQUIRES human approval token before any call is initiated

### 9. Supabase — Database + Real-time + Auth
- Go to: https://supabase.com
- Create new project
- Copy Project URL and anon key
- Add to `.env.local`:
  ```
  VITE_SUPABASE_URL=https://xxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...
  ```
- Run the SQL schema from `supabaseService.js` in your Supabase SQL editor
- Enable Row Level Security
- Enable Replication on `disruptions` and `audit_log` tables for real-time

---

## Governance Rules (Hard-Coded)

| Constraint | Status |
|-----------|--------|
| Execute purchase orders | ❌ NEVER |
| Send emails without approval | ❌ NEVER |
| Write to ERP systems | ❌ NEVER (simulated only) |
| Financial hedging advice | ❌ NEVER |
| Fabricate supplier data | ❌ NEVER |
| Outbound calls without HITL token | ❌ NEVER |

Escalation only triggers when ALL three conditions are met:
- Risk Score > 65
- Confidence Score > 70%
- False Positive Rate < 20%

---

## Cost Estimate (Monthly, light usage)
| Service | Tier | Est. Cost |
|---------|------|-----------|
| Anthropic Claude | ~200 analyses/mo | ~$0.60 |
| GNews | Free tier | $0 |
| GDELT | Free | $0 |
| Yahoo Finance/RapidAPI | Free tier | $0 |
| Google Maps | $200/mo credit | $0 |
| Twilio | ~50 SMS/mo | ~$0.75 |
| ElevenLabs | Free tier | $0 |
| Supabase | Free tier | $0 |
| **Total** | | **~$1.35/mo** |

---

## Quick Start

```bash
cp .env.example .env.local
# Fill in your API keys

npm install
npm install @supabase/supabase-js  # if using Supabase

npm run dev
```

The app runs in demo mode with mock data until you add real API keys. Each service degrades gracefully — if a key is missing, it logs a warning and uses mock data.
