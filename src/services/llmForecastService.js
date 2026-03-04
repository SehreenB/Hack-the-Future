// ─────────────────────────────────────────────────────────────────────────────
// services/llmForecastService.js
// Groq LLM Integration for Situation Forecasts
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

/**
 * Generate a 24-hour situation forecast using Groq's Llama 3 API
 * @param {Object} disruption - The disruption alert object
 * @param {Object} manufacturer - The manufacturer profile context
 * @returns {Promise<string>} The generated forecast markdown
 */
export async function getSituationForecast(disruption, manufacturer) {
    if (!GROQ_API_KEY || GROQ_API_KEY === "your_groq_key_here") {
        console.warn("[LLM Forecast] Groq API key not configured. Using mock fallback.");
        // Simulate network delay
        await new Promise(r => setTimeout(r, 1500));
        return getMockForecast(disruption.id);
    }

    try {
        const prompt = `
You are an expert supply chain risk analyst AI assistant.
A critical supply chain disruption has been detected. 
Please provide a concise, maximum 3-paragraph "24-Hour Situation Forecast" detailing exactly what will happen to the manufacturer over the next 24 hours if this disruption is NOT mitigated. Focus on cascading operational impacts, specific revenue risks, and secondary supplier bottlenecks.

Context:
Manufacturer: ${manufacturer.name}
Industry: ${manufacturer.industry}
Disruption Title: ${disruption.title}
Affected Supplier: ${disruption.supplier} in ${disruption.region}
Commodity: ${disruption.commodity}
Severity: ${disruption.severity} (Risk Score: ${disruption.riskScore || disruption.risk_score})
Summary: ${disruption.summary}

Output format: Please output ONLY the summary text. No introductory or closing remarks.
`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 400
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error("[LLM Forecast] Groq API Error:", response.status, errBody);
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content.trim();
        }

        throw new Error("Invalid response format from Groq API");
    } catch (err) {
        console.error("[LLM Forecast] Error:", err.message);
        return getMockForecast(disruption.id);
    }
}

function getMockForecast(id) {
    return `**T+0 to T+12 Hours:** Initial shockwaves hit logistics nodes. Shipments currently on the water will be indefinitely held at origin ports or rerouted, incurring immediate spot-market premiums of 40-70%. Procurement teams will experience supplier unresponsiveness as Tier-1 vendors triage their own allocations.\n\n**T+12 to T+24 Hours:** Assembly lines relying on just-in-time components will begin depleting floor buffers. If unmitigated, expected stockouts will trigger forced manufacturing line halts by tomorrow morning. Competitors will aggressively buy up secondary market inventory, leaving minimal alternative sourcing options available.`;
}
