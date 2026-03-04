import React, { useState, useMemo } from 'react';
import { ShieldAlert, Globe, ArrowRight, Zap, CheckCircle, FileText, AlertTriangle, Briefcase, Cpu } from 'lucide-react';
import '../styles/command-center.css';

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
}

interface PlaybookStrategy {
    id: string;
    title: string;
    description: string;
    cost: number;
    trace: string;
    sources: { title: string; url: string }[];
}

// Mock Data targeting Mid-Market Ops
const MOCK_INBOX: Disruption[] = [
    {
        id: 'evt-4819',
        title: 'Red Sea Re-routing',
        category: 'Auto',
        severity: 94,
        mttd: '14m',
        delayHours: 72,
        affectedUnits: 1, // Auto measures in days of delay ($250k/day * 3 days) -> mapped via component logic
        lat: 15.3,
        lon: 41.5,
        strategies: [
            {
                id: 'strat-1',
                title: 'Expedite Air Freight Bypass',
                description: 'Divert critical ECU microcontrollers to Dubai air hub. Assures production line continuity for next week.',
                cost: 45000,
                trace: '[AI Agent] Verified port congestion at Salalah. Air freight capacity confirmed with Emirates SkyCargo. Recommended to bypass maritime choke point to prevent $750K line-down penalty.',
                sources: [
                    { title: 'Project44 Alert', url: '#' },
                    { title: 'Supplier contract SLA', url: '#' }
                ]
            },
            {
                id: 'strat-2',
                title: 'Source Backup Supplier in Mexico',
                description: 'Activate Tier-2 supplier in Monterrey. 14-day lead time.',
                cost: 8500,
                trace: '[AI Agent] Monterrey supplier has 400 surplus units. Will not arrive in time for immediate shift, but mitigates secondary stockout.',
                sources: [{ title: 'Vendor ERP Data', url: '#' }]
            }
        ]
    },
    {
        id: 'evt-8821',
        title: 'Taiwan Port Strike',
        category: 'Industrial',
        severity: 85,
        mttd: '27m',
        delayHours: 36,
        affectedUnits: 12,
        lat: 25.03,
        lon: 121.56,
        strategies: [
            {
                id: 'strat-3',
                title: 'Reroute to Kaohsiung',
                description: 'Divert shipment to southern port and truck to manufacturing center.',
                cost: 12000,
                trace: '[AI Agent] Strike isolated to Keelung port workers. Kaohsiung operating at 85% capacity. Trucking rates elevated by 15%.',
                sources: [{ title: 'Bloomberg Terminal', url: '#' }]
            }
        ]
    },
    {
        id: 'evt-9021',
        title: 'Panama Canal Drought',
        category: 'Logistics',
        severity: 78,
        mttd: '1h 12m',
        delayHours: 120,
        affectedUnits: 5,
        lat: 9.145,
        lon: -79.923,
        strategies: [
            {
                id: 'strat-4',
                title: 'Rail Freight via Mexico/US',
                description: 'Unload at West Coast ports and use rail to bypass canal delays.',
                cost: 22000,
                trace: '[AI Agent] Canal draft restrictions limiting daily transits. Rail capacity available via Union Pacific.',
                sources: [{ title: 'Maritime Advisory', url: '#' }]
            }
        ]
    },
    {
        id: 'evt-1102',
        title: 'European Rail Worker Strike',
        category: 'Manufacturing',
        severity: 65,
        mttd: '3h 5m',
        delayHours: 48,
        affectedUnits: 3,
        lat: 50.11,
        lon: 8.68,
        strategies: [
            {
                id: 'strat-5',
                title: 'Activate Dedicated Trucking Fleet',
                description: 'Deploy backup trucking partners to maintain just-in-time delivery.',
                cost: 15500,
                trace: '[AI Agent] DB Netz strike affecting 40% of standard freight paths. Autobahn flow remains unhindered.',
                sources: [{ title: 'Transit Union Notice', url: '#' }]
            }
        ]
    }
];

export default function CommandCenter() {
    const [activeEvent, setActiveEvent] = useState<Disruption>(MOCK_INBOX[0]!);
    const [showModal, setShowModal] = useState<PlaybookStrategy | null>(null);
    const [businessProfile, setBusinessProfile] = useState('');
    const [impactAnalysis, setImpactAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Dynamic calculations based on user requirements
    const { revAtRisk, isSlaBreach } = useMemo(() => {
        let risk = 0;
        // Generic dynamic calculation for visual prototyping
        const days = activeEvent.delayHours / 24;
        risk = (85000 * days) + (10000 * activeEvent.affectedUnits);

        // SLA Breach triggering "Contract Review Risk" if > 24h
        const isBreach = activeEvent.delayHours > 24;

        return { revAtRisk: risk, isSlaBreach: isBreach };
    }, [activeEvent]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

    const navigateToWorldMonitor = () => {
        window.location.href = `/world-monitor?lat=${activeEvent.lat}&lon=${activeEvent.lon}&zoom=6`;
    };

    const handleApprove = (strat: PlaybookStrategy) => {
        if (strat.cost > 10000) {
            setShowModal(strat);
        } else {
            alert(`Strategy ${strat.id} approved automatically. cost < $10k`);
        }
    };

    const handleAnalyzeImpact = async () => {
        if (!businessProfile.trim()) {
            alert('Please describe your business or supply chain first.');
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
            Industry Context: ${activeEvent.category}

            Based on my business profile and this worldly event, generate a concise, highly specific 3-paragraph Operational Impact & Risk Assessment. Detail how my manufacturing, fulfillment, or revenue could directly be harmed, and what immediate pivoting I should consider. Use a professional, urgent, tactical tone. Keep the response to plain text or simple markdown.`;

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
                })
            });

            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].text) {
                setImpactAnalysis(data.candidates[0].content.parts[0].text);
            } else {
                setImpactAnalysis('Failed to generate impact analysis (Unexpected API schema).');
            }
        } catch (error) {
            console.error('Gemini API Error:', error);
            setImpactAnalysis('Error connecting to OSIRIS Intelligence API.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="scc-container">
            {/* Inbox Sidebar */}
            <aside className="scc-sidebar">
                <div className="scc-sidebar-header">
                    <img src="/osiris-logo.png" alt="OSIRIS Logo" style={{ height: 32, width: 32, objectFit: 'contain', marginRight: 8 }} />
                    <h1 className="scc-h1">OSIRIS Inbox</h1>
                </div>
                <div className="scc-inbox-list">
                    {MOCK_INBOX.map((evt) => (
                        <div
                            key={evt.id}
                            className={`scc-inbox-item scc-glass ${activeEvent.id === evt.id ? 'active' : ''}`}
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

            {/* Main Action Dashboard */}
            <main className="scc-main">
                <header className="scc-top-actions">
                    <div>
                        <h2 className="scc-h2" style={{ fontSize: '2rem', marginBottom: 4 }}>Global Intelligence Dashboard</h2>
                        <p className="scc-text-sm">Real-time OSINT monitoring and custom business impact analysis.</p>
                    </div>
                    <button className="scc-secondary-btn" onClick={navigateToWorldMonitor} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={18} />
                        <span>View Deep-Dive in OSIRIS Monitor</span>
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '60% 1fr', gap: 24, padding: 24 }}>
                    {/* Left Column: Metrics & Playbook */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Impact Dashboard */}
                        <div className="scc-metrics-grid">
                            <div className="scc-glass scc-metric-card">
                                <span className="scc-text-sm">Dynamic Revenue at Risk</span>
                                <span className="scc-metric-value danger">{formatCurrency(revAtRisk)}</span>
                                <span className="scc-text-sm" style={{ opacity: 0.7 }}>
                                    Based on industry average baseline
                                </span>
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

                        {/* AI Playbook */}
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
                                        {strat.trace}

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

                        {/* Drafting Station */}
                        <div className="scc-glass scc-metric-card">
                            <h2 className="scc-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileText size={20} /> Drafting Station
                            </h2>
                            <div className="scc-metrics-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8 }}>
                                    <div className="scc-text-sm" style={{ marginBottom: 8 }}>Supplier Communication Draft</div>
                                    <p style={{ fontSize: '0.9rem', color: '#d4d4d8', lineHeight: 1.5 }}>
                                        "URGENT: Regarding PO-8812. Due to the {activeEvent.title}, please confirm receipt of diversion instructions to backup fulfillment. We are authorizing the air freight premium."
                                    </p>
                                    <button className="scc-secondary-btn" style={{ marginTop: 16, padding: '6px 12px' }}>Copy to Clipboard</button>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 8 }}>
                                    <div className="scc-text-sm" style={{ marginBottom: 8 }}>ERP Adjustment Flags</div>
                                    <div className="scc-flex-start" style={{ alignItems: 'center', marginBottom: 8 }}>
                                        <CheckCircle size={16} color="#10b981" />
                                        <span style={{ fontSize: '0.9rem' }}>NetSuite Sub-contract updated</span>
                                    </div>
                                    <div className="scc-flex-start" style={{ alignItems: 'center' }}>
                                        <CheckCircle size={16} color="#10b981" />
                                        <span style={{ fontSize: '0.9rem' }}>Inventory Lead Time extended (+3d)</span>
                                    </div>
                                    <button className="scc-secondary-btn" style={{ marginTop: 16, padding: '6px 12px' }}>Sync ERP</button>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Dynamic Gemini Business Impact Tools */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div className="scc-glass scc-metric-card" style={{ padding: 20 }}>
                            <h2 className="scc-h2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <Briefcase size={20} color="#a855f7" /> Custom Impact Analysis
                            </h2>
                            <p className="scc-text-sm" style={{ marginBottom: 16, color: '#e4e4e7', lineHeight: 1.5 }}>
                                Describe your business, supply chain dependencies, or paste CSV data to generate a custom operational risk report using the OSIRIS Gemini engine.
                            </p>
                            <textarea
                                value={businessProfile}
                                onChange={(e) => setBusinessProfile(e.target.value)}
                                placeholder="E.g., We manufacture industrial EVs in Germany. We import lithium-ion cells from Shenzhen and rely on specialized steel tracking from Taiwan. Our tolerance for delay is max 5 days before line-down."
                                style={{
                                    width: '100%',
                                    height: '180px',
                                    background: 'rgba(0,0,0,0.4)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: 8,
                                    padding: 12,
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    resize: 'vertical',
                                    marginBottom: 16,
                                    fontFamily: 'inherit'
                                }}
                            />
                            <button
                                className="scc-primary-btn"
                                style={{ width: '100%', justifyContent: 'center', background: '#a855f7', padding: '12px 16px' }}
                                onClick={handleAnalyzeImpact}
                                disabled={isAnalyzing}
                            >
                                {isAnalyzing ? 'Analyzing Topography...' : (
                                    <>
                                        <Cpu size={16} /> Generate Risk Report
                                    </>
                                )}
                            </button>
                        </div>

                        {impactAnalysis && (
                            <div className="scc-glass scc-metric-card" style={{ padding: 20, borderTop: '4px solid #a855f7' }}>
                                <h3 className="scc-h3" style={{ marginBottom: 12, color: '#d8b4fe' }}>OSIRIS Intelligence Report</h3>
                                <div style={{ fontSize: '0.9rem', color: '#f4f4f5', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {impactAnalysis}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </main>

            {/* HITL Modal */}
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
                            <button className="scc-primary-btn" onClick={() => { alert('Verified & Executed.'); setShowModal(null); }}>
                                Confirm Execution
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

