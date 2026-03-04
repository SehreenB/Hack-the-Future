// ─────────────────────────────────────────────────────────────────────────────
// services/communicationService.js
// Twilio (SMS) + ElevenLabs (Voice TTS) + Retell AI (Conversational calls)
//
// ⚠️  GOVERNANCE: All outbound communication REQUIRES a human approval token.
//     NEVER trigger any communication without HITL confirmation.
// ─────────────────────────────────────────────────────────────────────────────

// ── TWILIO SMS ────────────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
const TWILIO_FROM = import.meta.env.VITE_TWILIO_FROM_NUMBER;

/**
 * Send SMS escalation alert via Twilio
 * ⚠️  Requires humanApprovalToken — never call without human approval
 * @param {Object} params
 * @param {string} params.to - Recipient phone number
 * @param {string} params.message - SMS body
 * @param {string} params.humanApprovalToken - UUID from HITL approval step
 */
export async function sendSMSAlert({ to, message, humanApprovalToken }) {
  if (!humanApprovalToken) {
    throw new Error("GOVERNANCE VIOLATION: humanApprovalToken is required for all SMS sends.");
  }

  if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === "your_twilio_account_sid") {
    console.warn("[Twilio] Not configured. SMS would send:", { to, message });
    return { success: false, mock: true, message: "Twilio not configured — add keys to .env.local" };
  }

  // NOTE: In production, this call should go through your backend (never expose Twilio auth token client-side)
  // Build a /api/send-sms endpoint in your backend that validates the approval token first
  try {
    const response = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message, humanApprovalToken }),
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[Twilio] SMS error:", err.message);
    return { success: false, error: err.message };
  }
}

// ── ELEVENLABS TTS ────────────────────────────────────────────────────────────

const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

/**
 * Generate call script audio via ElevenLabs TTS
 * @param {string} scriptText - The call script to convert to audio
 * @returns {Promise<Blob>} Audio blob (play in browser or save)
 */
export async function generateCallScriptAudio(scriptText) {
  if (!ELEVENLABS_KEY || ELEVENLABS_KEY === "your_elevenlabs_key_here") {
    console.warn("[ElevenLabs] Not configured. Script:", scriptText);
    return null;
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.75, similarity_boost: 0.85 },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);
    const audioBlob = await res.blob();
    return audioBlob;
  } catch (err) {
    console.error("[ElevenLabs] Error:", err.message);
    return null;
  }
}

/**
 * Build a supplier outreach call script from a disruption alert
 */
export function buildCallScript(alert, supplierName, requestedAction) {
  return `Hello, this is an automated message from the supply chain operations team.
  
We are calling regarding a supply disruption alert affecting ${supplierName} in the ${alert.region} corridor.
  
The disruption involves ${alert.title}. 
  
We are requesting ${requestedAction}.
  
Please respond within 24 hours by calling back or emailing your account manager.
  
This call was approved and sent by the operations team. Reference ID: ${alert.id}.
  
Thank you.`;
}

// ── RETELL AI (Conversational calls) ─────────────────────────────────────────

const RETELL_KEY = import.meta.env.VITE_RETELL_API_KEY;

/**
 * Initiate a Retell AI conversational outbound call
 * ⚠️  REQUIRES humanApprovalToken — HITL gate enforced
 */
export async function initiateRetellCall({ toNumber, agentId, callContext, humanApprovalToken }) {
  if (!humanApprovalToken) {
    throw new Error("GOVERNANCE VIOLATION: humanApprovalToken required for all outbound calls.");
  }

  if (!RETELL_KEY || RETELL_KEY === "your_retell_key_here") {
    console.warn("[Retell] Not configured. Call would go to:", toNumber);
    return { success: false, mock: true, message: "Retell AI not configured — add keys to .env.local" };
  }

  try {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RETELL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_number: TWILIO_FROM,
        to_number: toNumber,
        agent_id: agentId,
        metadata: { callContext, humanApprovalToken },
      }),
    });

    if (!res.ok) throw new Error(`Retell error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[Retell] Call error:", err.message);
    return { success: false, error: err.message };
  }
}

// ── DRAFT EMAIL BUILDER ───────────────────────────────────────────────────────

/**
 * Build draft email object — status always starts as AWAITING_APPROVAL
 * This is a template builder; actual sending happens through your email service
 * after human approval
 */
export function buildDraftEmail({ supplierName, supplierEmail, disruption, requestedAction, senderName, senderTitle }) {
  return {
    to: supplierEmail || `procurement@${supplierName.toLowerCase().replace(/[^a-z]/g, "")}.com`,
    subject: `[URGENT] Supply Continuity Review — ${disruption.commodity} — ${new Date().toLocaleDateString()}`,
    body: `Dear ${supplierName} Procurement Team,

I am writing to formally request an urgent supply continuity review following a disruption signal detected in the ${disruption.region} corridor.

Disruption Summary:
• Event: ${disruption.title}
• Affected Commodity: ${disruption.commodity}
• Risk Score: ${disruption.riskScore}/100
• Revenue at Risk: ${disruption.revenueAtRisk}
• Confidence Level: ${disruption.confidenceScore}%

Requested Actions:
${requestedAction}

We request your response within 24 hours confirming:
1. Current production status and capacity
2. Alternative sourcing or routing options available
3. Updated lead times under current conditions

Reference ID: ${disruption.id}

Best regards,
${senderName}
${senderTitle}`,
    status: "AWAITING_APPROVAL",
    createdAt: new Date().toISOString(),
    disruptionId: disruption.id,
  };
}
