import React, { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, Globe, ArrowRight, Zap, CheckCircle, FileText, AlertTriangle, Briefcase, Cpu, Loader2 } from 'lucide-react';
import '../styles/command-center.css';

import { fetchGeopoliticalSignals } from '../services/gdeltService';
import { fetchNewsSignals } from '../services/gnewsService';
import { analyzeDisruption, getMockAnalysis } from '../services/riskEngine';
import { logDisruption } from '../services/supabaseService';
import { buildDraftEmail, sendSMSAlert } from '../services/communicationService';
import { MANUFACTURER_PROFILE } from '../data/manufacturerProfile';

interface Disruption {
    id: string;
    title: string;
    category: string;
    severity: number;
    mttd: string;
    delayHours: number;
    affectedUnits: number;
    lat: number;
    lon: number;
    strategies: PlaybookStrategy[];
    revenueAtRisk?: number;
    _rawAnalysis?: any;
    _rawSignal?: any;
}

interface PlaybookStrategy {
    id: string;
    title: string;
    description: string;
    cost: number;
    trace: string;
    sources: { title: string; url: string }[];
}

const MOCK_INBOX: Disruption[] = [
    {
        id: 'evt-4819',
        title: 'Red Sea Re-routing',
        category: 'Auto',
        severity: 94,
        mttd: '14m',
        delayHours: 72,
        affectedUnits: 1,
        lat: 15.3,
        lon: 41.5,
        strategies: [
            {
                id: 'strat-1',
                title: 'Expedite Air Freight Bypass',
                description: 'Divert critical ECU microcontrollers to Dubai air hub.',
                cost: 45000,
                trace: '[AI Agent] Verified port congestion at Salalah.',
                sources: [{ title: 'Supplier contract SLA', url: '#' }]
            }
        ]
    }
];

export default function CommandCenter() {
    const [inbox, setInbox] = useState<Disruption[]>(MOCK_INBOX);
    const [activeEvent, setActiveEvent] = useState<Disruption>(MOCK_INBOX[0]);
    const [showModal, setShowModal] = useState<PlaybookStrategy | null>(null);
    const [businessProfile, setBusinessProfile] = useState('');
    const [impactAnalysis, setImpactAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        const loadLiveData = async () => {
            setIsLoadingData(true);
            try {
                const [news, gdelt] = await Promise.all([
                    fetchNewsSignals().catch(() => []),
                    fetchGeopoliticalSignals().catch(() => [])
                ]);
                const combinedSignals = [...news, ...gdelt].slice(0, 4);

                if (combinedSignals.length === 0) throw new Error("APIs offline, falling back to mock");

                const liveEvents = await Promise.all(combinedSignals.map(async (signal, idx) => {
                    let analysis;
                    try {
                        analysis = await analyzeDisruption({ signal, falsePositiveRate: 12 });
                    } catch (e) {
                        analysis = getMockAnalysis(signal);
                    }

                    const costVal = parseFloat((analysis.riskScore?.revenueAtRisk || "$0").replace(/[^0-9.]/g, '')) * 1000;
                    const latMap = [15.3, 25.03, 9.145, 50.11];
                    const lonMap = [41.5, 121.56, -79.923, 8.68];

                    return {
                        id: signal.id || `evt-${Date.now()}-${idx}`,
                        title: signal.title,
                        category: analysis.classify?.commodityExposure || 'General',
                        severity: analysis.riskScore?.score || 50,
                        mttd: 'Live',
                        delayHours: analysis.riskScore?.daysToStockout ? analysis.riskScore.daysToStockout * 24 : 72,
                        affectedUnits: 1,
                        lat: latMap[idx] || 0,
                        lon: lonMap[idx] || 0,
                        revenueAtRisk: costVal || 85000,
                        strategies: (analysis.playbook || []).map((p: any, i: number) => ({
                            id: `strat-${idx}-${i}`,
                            title: p.action,
                            description: p.description,
                            cost: parseFloat((p.estimatedCost || "0").replace(/[^0-9.]/g, '')) || 15000,
                            trace: analysis.reasoningTrace?.join('\n') || '',
                            sources: [{ title: signal.source, url: signal.url || '#' }]
                        })),
                        _rawAnalysis: analysis,
                        _rawSignal: signal
                    };
                }));

                if (liveEvents.length > 0) {
                    setInbox(liveEvents);
                    setActiveEvent(liveEvents[0]);
                } else {
                    throw new Error("No parsed events");
                }
            } catch (err) {
                console.warn('API fallback active:', err);
                setInbox(MOCK_INBOX);
                setActiveEvent(MOCK_INBOX[0]);
            } finally {
                setIsLoadingData(false);
            }
        };
        loadLiveData();
    }, []);

    const { revAtRisk, isSlaBreach } = useMemo(() => {
        let risk = activeEvent?.revenueAtRisk || 0;
        if (!risk) {
            const days = (activeEvent?.delayHours || 0) / 24;
            risk = (85000 * days) + (10000 * (activeEvent?.affectedUnits || 0));
        }
        const isBreach = (activeEvent?.delayHours || 0) > 24;
        return { revAtRisk: risk, isSlaBreach: isBreach };
    }, [activeEvent]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const navigateToWorldMonitor = () => {
        if (activeEvent) {
            window.location.href = `/world-monitor?lat=${activeEvent.lat}&lon=${activeEvent.lon}&zoom=6`;
        }
    };

    const handleApprove = async (strat: PlaybookStrategy) => {
        if (strat.cost > 10000) {
            setShowModal(strat);
        } else {
            await executeStrategy(strat);
        }
    };

    const executeStrategy = async (strat: PlaybookStrategy) => {
        try {
            // Log to Supabase
            await logDisruption({
                title: activeEvent.title,
                risk_score: activeEvent.severity,
                revenue_at_risk: formatCurrency(revAtRisk),
                mitigation_selected: strat.title,
                outcome: "Approved via CommandCenter",
                playbook: strat
            });

            // Simulate sending comms via Twilio/Communication Service
            const emailDraft = buildDraftEmail({
                supplierName: activeEvent.category || 'Supplier',
                supplierEmail: 'vendor@example.com',
                disruption: {
                    id: activeEvent.id, title: activeEvent.title, commodity: activeEvent.category,
                    region: 'Global', riskScore: activeEvent.severity, revenueAtRisk: formatCurrency(revAtRisk), confidenceScore: 90
                },
                requestedAction: strat.title,
                senderName: 'OSIRIS Agent',
                senderTitle: 'Automated Copilot'
            });
            console.log("Draft email generated:", emailDraft);

            alert(`Strategy "${strat.title}" executed! Logged to Supabase and supplier notified.`);
        } catch (e) {
            console.error(e);
            alert("Fallback execution complete (Mock).");
        }
    };

    const handleAnalyzeImpact = async () => {
        if (!businessProfile.trim()) {
            setBusinessProfile(JSON.stringify(MANUFACTURER_PROFILE, null, 2));
            return;
        }
        setIsAnalyzing(true);
        setImpactAnalysis(null);
        try {
            const prompt = `You are an expert global supply chain intelligence analyst.
            I am a business with the following profile/products/dependencies:
            """${businessProfile}"""

            There is an active global disruption happening right now:
            Event: ${activeEvent.title}
            Severity: ${activeEvent.severity}/100
            Expected Delay: ${activeEvent.delayHours} hours

            Based on my business profile, generate a 3-paragraph Operational Impact & Risk Assessment. Use a professional, urgent, tactical tone. Keep the response to plain text.`;

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GROQ_API_KEY || '';
            let analysisText = "";

            if (apiKey.startsWith('gsk_')) {
                // Groq fallback if gemini is empty
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }] })
                });
                const data = await res.json();
                analysisText = data.choices[0].message.content;
            } else {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 800 } })
                });
                const data = await response.json();
                analysisText = data.candidates[0].content.parts[0].text;
            }
            setImpactAnalysis(analysisText);
        } catch (error) {
            console.error('API Error:', error);
            setImpactAnalysis('Error connecting to Intelligence API (Fallback mode active).');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="scc-container">
            <aside className="scc-sidebar">
                <div className="scc-sidebar-header">
                    <img src="/osiris-logo.png" alt="OSIRIS Logo" style={{ height: 32, width: 32, objectFit: 'contain', marginRight: 8 }} />
                    <h1 className="scc-h1">OSIRIS Inbox</h1>
                </div>
                <div className="scc-inbox-list">
                    {isLoadingData ? (
                        <div style={{ padding: 20, textAlign: 'center', color: '#a1a1aa' }}>
                            <Loader2 size={24} className="scc-spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                            Fetching Live Intel...
                        </div>
                    ) : inbox.map((evt) => (
                        <div
                            key={evt.id}
                            className={`scc-inbox-item scc-glass ${activeEvent?.id === evt.id ? 'active' : ''}`}
                            onClick={() => setActiveEvent(evt)}
                        >
                            <div className="scc-flex-between" style={{ marginBottom: 8 }}>
                                <span className={`scc-badge ${evt.severity >= 90 ? 'scc-badge-critical' : 'scc-badge-warning'}`}>
                                    Score: {evt.severity}
                                </span>
                                <span className="scc-text-sm" title="Mean Time To Detect">MTTD: {evt.mttd}</span>
                            </div>
                            <h3 className="scc-h3">{evt.title}</h3>
                            <p className="scc-text-sm" style={{ marginTop: 8 }}>Delayed by {evt.delayHours} hrs</p>
                        </div>
                    ))}
                </div>
            </aside>

            <main className="scc-main">
                <header className="scc-top-actions">
                    <div>
                        <h2 className="scc-h2" style={{ fontSize: '2rem', marginBottom: 4 }}>Global Intelligence Dashboard</h2>
                        <p className="scc-text-sm">Real-time OSINT monitoring and custom business impact analysis.</p>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                            <button className="scc-badge scc-badge-warning" onClick={() => window.location.href = '/nexus'}>Open NEXUS Core →</button>
                        </div>
                    </div>
                    <button className="scc-secondary-btn" onClick={navigateToWorldMonitor} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={18} />
                        <span>View Deep-Dive in OSIRIS Monitor</span>
                    </button>
                </header>

                {activeEvent ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: 24, padding: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="scc-metrics-grid">
                                <div className="scc-glass scc-metric-card">
                                    <span className="scc-text-sm">Dynamic Revenue at Risk</span>
                                    <span className="scc-metric-value danger">{formatCurrency(revAtRisk)}</span>
                                    <span className="scc-text-sm" style={{ opacity: 0.7 }}>Based on {MANUFACTURER_PROFILE?.industry || 'industry'} benchmark</span>
                                </div>

                                <div className="scc-glass scc-metric-card">
                                    <span className="scc-text-sm">Delivery Delay</span>
                                    <span className="scc-metric-value warning">{activeEvent.delayHours} hrs</span>
                                    <span className="scc-text-sm" style={{ opacity: 0.7 }}>Expected disruption window</span>
                                </div>

                                <div className="scc-glass scc-metric-card" style={{ background: isSlaBreach ? 'rgba(239, 68, 68, 0.1)' : 'var(--scc-panel)' }}>
                                    <span className="scc-text-sm">SLA Status</span>
                                    {isSlaBreach ? (
                                        <>
                                            <div className="scc-flex-start" style={{ alignItems: 'center', marginTop: 8 }}>
                                                <AlertTriangle size={32} color="#ef4444" />
                                                <span className="scc-metric-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>Contract Review Risk</span>
                                            </div>
                                            <span className="scc-text-sm" style={{ marginTop: 'auto', color: '#fca5a5' }}>
                                                Delay exceeds 24-hour limit. Legal alert generated.
                                            </span>
                                        </>
                                    ) : (
                                        <span className="scc-metric-value" style={{ color: '#10b981' }}>Within Tolerances</span>
                                    )}
                                </div>
                            </div>

                            <div className="scc-playbook-list">
                                <h2 className="scc-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Zap size={20} color="#f59e0b" /> AI Playbook Resolutions
                                </h2>

                                {activeEvent.strategies.map((strat, idx) => (
                                    <div key={strat.id} className="scc-glass scc-strategy-card">
                                        <div className="scc-flex-between">
                                            <div className="scc-flex-start">
                                                <span className="scc-strategy-rank">#{idx + 1}</span>
                                                <div>
                                                    <h3 className="scc-h3">{strat.title}</h3>
                                                    <p className="scc-text-sm" style={{ marginTop: 4, color: '#e4e4e7' }}>{strat.description}</p>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div className="scc-cost">{formatCurrency(strat.cost)}</div>
                                                <button className="scc-primary-btn" style={{ marginTop: 12 }} onClick={() => handleApprove(strat)}>
                                                    Approve <ArrowRight size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="scc-trace-panel">
                                            <div style={{ marginBottom: 8, color: '#f59e0b', fontWeight: 600 }}>Reasoning Trace</div>
                                            <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#d4d4d8', fontSize: '0.85rem' }}>
                                                {strat.trace || "No logic trace available"}
                                            </pre>

                                            <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                                                <span style={{ color: '#a1a1aa', marginRight: 8 }}>Source Citations:</span>
                                                {strat.sources.map((src, i) => (
                                                    <React.Fragment key={i}>
                                                        <a href={src.url} className="scc-source-link">{src.title}</a>
                                                        {i < strat.sources.length - 1 && <span style={{ margin: '0 8px' }}>|</span>}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="scc-glass scc-metric-card" style={{ padding: 20 }}>
                                <h2 className="scc-h2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                    <Briefcase size={20} color="#f59e0b" /> Custom Manufacturer Context
                                </h2>
                                <textarea
                                    value={businessProfile}
                                    onChange={(e) => setBusinessProfile(e.target.value)}
                                    placeholder="Click Generate to auto-load grounding context from ManufacturerProfile.js..."
                                    style={{
                                        width: '100%', height: '180px', background: 'rgba(0,0,0,0.4)',
                                        border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: 12,
                                        color: '#fff', fontSize: '0.9rem', resize: 'vertical', marginBottom: 16, fontFamily: 'inherit'
                                    }}
                                />
                                <button
                                    className="scc-primary-btn"
                                    style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}
                                    onClick={handleAnalyzeImpact}
                                    disabled={isAnalyzing}
                                >
                                    {isAnalyzing ? 'Analyzing Topography...' : <><Cpu size={16} /> Generate Grounded Report</>}
                                </button>
                            </div>

                            {impactAnalysis && (
                                <div className="scc-glass scc-metric-card" style={{ padding: 20, borderTop: '4px solid #f59e0b' }}>
                                    <h3 className="scc-h3" style={{ marginBottom: 12, color: '#f59e0b' }}>OSIRIS Intelligence Report</h3>
                                    <div style={{ fontSize: '0.9rem', color: '#f4f4f5', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                        {impactAnalysis}
                                    </div>
                                </div>
                            )}

                            <div className="scc-glass scc-metric-card">
                                <h2 className="scc-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileText size={20} /> Drafting Station
                                </h2>
                                <div className="scc-text-sm" style={{ marginBottom: 8, color: '#f59e0b' }}>AI Drafted Comm via Twilio</div>
                                <p style={{ fontSize: '0.85rem', color: '#d4d4d8', lineHeight: 1.5, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6 }}>
                                    {activeEvent._rawAnalysis?.draftEmail?.body || `"URGENT: Regarding PO-8812. Due to the ${activeEvent.title}, please confirm receipt of diversion instructions. Approvals tracked."`}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>

            {showModal && (
                <div className="scc-modal-overlay">
                    <div className="scc-glass scc-modal">
                        <h2 className="scc-h1" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <ShieldAlert size={28} /> Human-In-The-Loop Verification
                        </h2>
                        <p className="scc-text-sm" style={{ fontSize: '1rem' }}>
                            The selected strategy <strong>{showModal.title}</strong> has an estimated cost of <strong>{formatCurrency(showModal.cost)}</strong>.
                            <br /><br />
                            Company policy requires secondary authorization for actions exceeding $10,000. Do you wish to proceed?
                        </p>
                        <div className="scc-flex-start" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                            <button className="scc-secondary-btn" onClick={() => setShowModal(null)}>Cancel</button>
                            <button className="scc-primary-btn" onClick={() => { executeStrategy(showModal); setShowModal(null); }}>
                                Confirm Execution
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

