# OSIRIS - Global Intelligence & Supply Disruption Co-Pilot

**Hack the Future**

OSIRIS is an AI-powered supply chain command center designed to detect global disruptions in real-time, predict business impact using LLMs, and generate actionable playbooks to mitigate revenue loss. 

Built on top of the original World Monitor core, OSIRIS shifts the focus from general OSINT and geopolitics to **proactive supply chain defense and operations**.

## Key Features

- **Global Disruption Inbox:** Real-time stream of supply chain incidents (e.g., European Rail Strikes, Red Sea Re-routing, Panama Canal Droughts) prioritized by severity and Mean Time To Detect (MTTD).
- **Dynamic Risk Assessment:** Automatically calculates Delivery Delay hours, SLA Breach risk, and Dynamic Revenue at Risk based on disruption severity and affected units.
- **AI Playbook Resolutions:** Automatically generated mitigation strategies for each disruption. Each strategy includes:
  - Estimated implementation cost.
  - Transparent reasoning trace from an autonomous AI Agent.
  - Source citations for verification.
  - Required "Human-in-the-Loop" approvals for strategies exceeding $10,000 threshold.
- **Custom Business Impact Engine:** Powered by **Google Gemini 2.5 Flash**. Supply chain operators can enter their specific business profiles (e.g., "We manufacture industrial EVs in Germany...") and the OSIRIS engine generates highly specific, 3-paragraph Operational Impact & Risk Assessments detailing immediate pivoting recommendations.
- **Drafting Station:** Instantly generates tailored supplier communication drafts and ERP adjustment flags to enact playbooks.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Vite PWA (Service Workers)
- **AI Engine:** Google Gemini 2.5 Flash (for real-time impact analysis and report generation)
- **Data & Auth:** Supabase (Singleton Architecture)
- **Financial APIs:** Financial Modeling Prep (via RapidAPI)
- **Visualization:** MapLibre, Three.js (globe.gl)
- **Styling:** Custom CSS with Glassmorphism / Dashboard constraints (`command-center.css`)

## Running Locally

To run the OSIRIS Command Center locally:

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env.local` file by copying the provided example and adding your API keys:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_RAPIDAPI_KEY=your_rapidapi_key
   ```
   *(Note: The app will use mocked data or fail gracefully if Supabase or RapidAPI keys are missing).*
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Navigate to `http://localhost:3000` (or the port Vite outputs in your console).

## Story & Hackathon Value

Supply chain professionals currently rely on slow, fragmented data sources and generic news to make multi-million dollar routing decisions. OSIRIS bridges the gap between **Global OSINT** and **Local Business Logic**. By feeding real-time disruptions into Gemini 2.5 Flash—contextualized with the user's specific manufacturing footprint—OSIRIS transitions companies from "reactive fire-fighting" to "proactive, AI-assisted mitigation". 

---
*Built for Hack the Future.*
