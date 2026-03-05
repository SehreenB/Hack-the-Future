// ─────────────────────────────────────────────────────────────────────────────
// services/llmForecastService.js
// Groq LLM Integration for Situation Forecasts
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Generate a 24-hour situation forecast using Gemini as primary, falling back to Groq (Claude/Llama)
 * @param {Object} disruption - The disruption alert object
 * @param {Object} manufacturer - The manufacturer profile context
 * @returns {Promise<{forecast: string, provider: string}>} The generated forecast markdown and provider name
 */
export async function getSituationForecast(disruption, manufacturer) {
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

    // 1. Try Gemini (Primary)
    if (GEMINI_API_KEY && GEMINI_API_KEY !== "your_gemini_key_here") {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 400 }
                })
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Gemini API error: ${response.status} ${errBody}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
                return {
                    forecast: data.candidates[0].content.parts[0].text.trim(),
                    provider: 'gemini'
                };
            }
        } catch (err) {
            console.error("[LLM Forecast] Gemini failed, falling back to Claude/Groq. Error:", err.message);
        }
    }

    // 2. Try Groq/Claude (Fallback)
    if (GROQ_API_KEY && GROQ_API_KEY !== "your_groq_key_here") {
        try {
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
                throw new Error(`Groq API error: ${response.status}`);
            }

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                return {
                    forecast: data.choices[0].message.content.trim(),
                    provider: 'claude' // User asked to call the fallback 'claude'
                };
            }
        } catch (err) {
            console.error("[LLM Forecast] Groq/Claude Error:", err.message);
        }
    } else {
        console.warn("[LLM Forecast] Groq API key not configured.");
    }

    // 3. Mock (Final Fallback)
    console.warn("[LLM Forecast] Returning mock fallback.");
    await new Promise(r => setTimeout(r, 1500));
    return {
        forecast: getMockForecast(disruption.id),
        provider: 'mock'
    };
}

function getMockForecast(id) {
    return `**T+0 to T+12 Hours:** Initial shockwaves hit logistics nodes. Shipments currently on the water will be indefinitely held at origin ports or rerouted, incurring immediate spot-market premiums of 40-70%. Procurement teams will experience supplier unresponsiveness as Tier-1 vendors triage their own allocations.\n\n**T+12 to T+24 Hours:** Assembly lines relying on just-in-time components will begin depleting floor buffers. If unmitigated, expected stockouts will trigger forced manufacturing line halts by tomorrow morning. Competitors will aggressively buy up secondary market inventory, leaving minimal alternative sourcing options available.`;
}
