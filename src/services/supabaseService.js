// ─────────────────────────────────────────────────────────────────────────────
// services/supabaseService.js
// Supabase — Postgres + Auth + Real-time subscriptions + pgvector
// ─────────────────────────────────────────────────────────────────────────────
//
// SQL SCHEMA (run in Supabase SQL editor):
//
// -- Enable pgvector
// create extension if not exists vector;
//
// -- Disruption events table
// create table disruptions (
//   id uuid default gen_random_uuid() primary key,
//   created_at timestamptz default now(),
//   signal_id text not null,
//   title text not null,
//   supplier text,
//   region text,
//   commodity text,
//   risk_score integer,
//   confidence_score integer,
//   revenue_at_risk text,
//   cost_of_delay_tier integer,
//   escalated boolean default false,
//   mitigation_selected text,
//   outcome text,
//   revenue_impact_delta text,
//   hitl_override boolean default false,
//   raw_signal jsonb,
//   playbook jsonb,
//   audit_trail jsonb default '[]'
// );
//
// -- Memory/pattern store (pgvector for similarity search)
// create table disruption_memory (
//   id uuid default gen_random_uuid() primary key,
//   created_at timestamptz default now(),
//   disruption_type text,
//   region text,
//   supplier text,
//   pattern_description text,
//   embedding vector(1536),  -- OpenAI/Cohere embedding if used
//   outcome_data jsonb,
//   recurrence_signal text
// );
//
// -- Audit log (immutable)
// create table audit_log (
//   id uuid default gen_random_uuid() primary key,
//   created_at timestamptz default now(),
//   event_type text not null,
//   disruption_id uuid references disruptions(id),
//   actor text,
//   action text,
//   payload jsonb,
//   ip_address text
// );
//
// -- Real-time subscription setup:
// -- Enable Replication for: disruptions, audit_log
//
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Lazy supabase client — only init when keys are present
let _client = null;

async function getClient() {
  if (_client) return _client;

  if (!SUPABASE_URL || SUPABASE_URL.includes("your-project")) {
    console.warn("[Supabase] Not configured. Using in-memory store.");
    return null;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  } catch {
    console.warn("[Supabase] @supabase/supabase-js not installed. Run: npm install @supabase/supabase-js");
    return null;
  }
}

// ── IN-MEMORY FALLBACK (when Supabase not configured) ─────────────────────────
const memoryStore = {
  disruptions: [],
  auditLog: [],
  hitlOverrides: 0,
  falsePositiveRate: 12,
};

// ── DISRUPTION PERSISTENCE ────────────────────────────────────────────────────

export async function logDisruption(disruption) {
  const client = await getClient();

  const record = {
    signal_id: disruption.id,
    title: disruption.title,
    supplier: disruption.supplier,
    region: disruption.region,
    commodity: disruption.commodity,
    risk_score: disruption.riskScore,
    confidence_score: disruption.confidenceScore,
    revenue_at_risk: disruption.revenueAtRisk,
    cost_of_delay_tier: disruption.costOfDelayTier,
    escalated: disruption.escalate,
    raw_signal: disruption,
    playbook: disruption.playbook || null,
    audit_trail: [],
  };

  if (!client) {
    memoryStore.disruptions.unshift({ id: Date.now().toString(), created_at: new Date().toISOString(), ...record });
    return { data: record, source: "memory" };
  }

  const { data, error } = await client.from("disruptions").insert([record]).select();
  if (error) console.error("[Supabase] Log disruption error:", error.message);
  return { data, error };
}

export async function getDisruptionHistory(limit = 20) {
  const client = await getClient();

  if (!client) {
    return memoryStore.disruptions.slice(0, limit);
  }

  const { data, error } = await client
    .from("disruptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) console.error("[Supabase] Get history error:", error.message);
  return data || [];
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

export async function writeAuditLog({ eventType, disruptionId, actor, action, payload }) {
  const client = await getClient();

  const entry = {
    event_type: eventType,
    disruption_id: disruptionId,
    actor: actor || "system",
    action,
    payload,
  };

  if (!client) {
    memoryStore.auditLog.unshift({ id: Date.now().toString(), created_at: new Date().toISOString(), ...entry });
    return entry;
  }

  const { data, error } = await client.from("audit_log").insert([entry]).select();
  if (error) console.error("[Supabase] Audit log error:", error.message);
  return data;
}

// ── REAL-TIME SUBSCRIPTION ────────────────────────────────────────────────────

/**
 * Subscribe to real-time disruption alerts
 * Dashboard alert pill updates live when new high-risk disruptions are logged
 */
export async function subscribeToDisruptions(callback) {
  const client = await getClient();
  if (!client) {
    console.warn("[Supabase] Real-time not available without Supabase config.");
    return () => { };
  }

  const subscription = client
    .channel("disruptions-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "disruptions" }, (payload) => {
      callback(payload.new);
    })
    .subscribe();

  return () => client.removeChannel(subscription);
}

// ── DRIFT MONITORING ──────────────────────────────────────────────────────────

export async function getDriftMetrics() {
  const client = await getClient();

  if (!client) {
    return {
      falsePositiveRate: memoryStore.falsePositiveRate,
      hitlOverrideRate: memoryStore.hitlOverrides,
      escalationCount: memoryStore.disruptions.filter(d => d.escalated).length,
      totalAnalyzed: memoryStore.disruptions.length,
    };
  }

  // Count HITL overrides in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: overrides } = await client
    .from("disruptions")
    .select("id", { count: "exact" })
    .eq("hitl_override", true)
    .gte("created_at", thirtyDaysAgo);

  const { data: all } = await client
    .from("disruptions")
    .select("id", { count: "exact" })
    .gte("created_at", thirtyDaysAgo);

  const total = all?.length || 0;
  const overrideCount = overrides?.length || 0;
  const overrideRate = total > 0 ? (overrideCount / total) * 100 : 0;

  return {
    falsePositiveRate: 12, // Track via outcome field
    hitlOverrideRate: overrideRate,
    escalationCount: 0,
    totalAnalyzed: total,
    driftAlert: overrideRate > 25,
  };
}

export async function getSuppliers() {
  const client = await getClient();
  if (!client) return [];

  const { data, error } = await client.from("suppliers").select("*");
  if (error) console.error(error);
  return data || [];
}


export { memoryStore };
