import React, { useState, useEffect } from 'react';
import { Shield, Radio, Key, Link2, Cpu, Globe, Search, ChevronRight, AlertTriangle, Info, ShieldCheck, Database, LayoutGrid, List } from 'lucide-react';

const API_URL = 'http://localhost:3000';

const MODULE_META = {
    waf:        { icon: <Shield size={18} />,   label: 'WAF / CDN',         color: '#a78bfa', desc: 'Protection Layer' },
    port:       { icon: <Radio size={18} />,    label: 'Open Ports',        color: '#60a5fa', desc: 'Network Surface' },
    js_secret:  { icon: <Key size={18} />,      label: 'Secrets & Keys',    color: '#ff4d4d', desc: 'Sensitive Data' },
    endpoint:   { icon: <Link2 size={18} />,    label: 'Endpoints',        color: '#fbbf24', desc: 'API Surface' },
    tech:       { icon: <Cpu size={18} />,      label: 'Technologies',     color: '#34d399', desc: 'Stack Fingerprint' },
    wpscan_vuln:{ icon: <Globe size={18} />,    label: 'WP Analysis',      color: '#f97316', desc: 'CMS Vulnerabilities' },
};

const severityColor = (s) => {
    switch ((s || '').toLowerCase()) {
        case 'critical': return '#ff4d4d';
        case 'high':     return '#ff944d';
        case 'medium':   return '#ffd11a';
        case 'low':      return '#60a5fa';
        default:         return '#a6a6a6';
    }
};

export default function SubdomainDashboard({ projectId }) {
    const [subdomains, setSubdomains] = useState([]);
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [findings, setFindings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModule, setActiveModule] = useState('all');

    // Fetch subdomains on mount
    useEffect(() => {
        fetch(`${API_URL}/api/projects/${projectId}/subdomains`)
            .then(r => r.json())
            .then(data => {
                setSubdomains(Array.isArray(data) ? data : []);
                if (data.length > 0 && !selectedDomain) setSelectedDomain(data[0].domain);
            })
            .catch(console.error);
    }, [projectId]);

    // Fetch findings when selectedDomain changes
    useEffect(() => {
        if (!selectedDomain) return;
        setLoading(true);
        fetch(`${API_URL}/api/projects/${projectId}/domain-scan/${encodeURIComponent(selectedDomain)}`)
            .then(r => r.json())
            .then(data => {
                setFindings(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [projectId, selectedDomain]);

    const filteredSubdomains = subdomains.filter(s => s.domain.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const byType = findings.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || []);
        acc[f.type].push(f);
        return acc;
    }, {});

    const displayFindings = activeModule === 'all' ? findings : byType[activeModule] || [];

    return (
        <div style={{ display: 'flex', gap: '20px', height: '100%', overflow: 'hidden' }}>
            {/* Sidebar: Subdomain List */}
            <div className="glass-panel" style={{ width: '280px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Database size={18} color="var(--accent-color)" />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Targets</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            className="glass-input" 
                            placeholder="Filter domains..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '6px 10px 6px 32px', fontSize: '0.8rem', width: '100%' }} 
                        />
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {filteredSubdomains.map(s => {
                        const isSelected = selectedDomain === s.domain;
                        return (
                            <button 
                                key={s.domain}
                                onClick={() => setSelectedDomain(s.domain)}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px', textAlign: 'left',
                                    display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                                    background: isSelected ? 'rgba(0,255,157,0.08)' : 'transparent',
                                    border: `1px solid ${isSelected ? 'var(--accent-color)' : 'transparent'}`,
                                    transition: 'all 0.15s', marginBottom: '2px'
                                }}
                            >
                                <div style={{ 
                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                    background: s.context?.status_code >= 200 && s.context?.status_code < 300 ? '#00ff9d' : '#666'
                                }} />
                                <span style={{ 
                                    flex: 1, fontSize: '0.82rem', fontFamily: 'var(--font-mono)', 
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    color: isSelected ? 'var(--accent-color)' : 'var(--text-main)'
                                }}>{s.domain}</span>
                                {isSelected && <ChevronRight size={14} color="var(--accent-color)" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Content: Dashboard */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '20px' }}>
                {selectedDomain ? (
                    <>
                        {/* Domain Header Card */}
                        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid var(--accent-color)' }}>
                            <div>
                                <h1 style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', margin: 0, color: 'var(--accent-color)' }}>{selectedDomain}</h1>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Security Intelligence Hub</span>
                                    {findings.some(f => f.type === 'waf') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(167,139,250,0.1)', border: '1px solid #a78bfa', borderRadius: '100px', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 700 }}>
                                            <Shield size={12} /> {findings.find(f => f.type === 'waf')?.cdn_waf || 'WAF PROTECTED'}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Findings Found</div>
                                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{findings.length}</div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                            <button 
                                onClick={() => setActiveModule('all')}
                                className="glass-panel hover-row" 
                                style={{ 
                                    padding: '16px', textAlign: 'center', cursor: 'pointer',
                                    border: `1px solid ${activeModule === 'all' ? 'var(--accent-color)' : 'var(--panel-border)'}`,
                                    background: activeModule === 'all' ? 'rgba(0,255,157,0.05)' : 'var(--panel-bg)'
                                }}
                            >
                                <LayoutGrid size={20} style={{ marginBottom: '8px', color: activeModule === 'all' ? 'var(--accent-color)' : 'var(--text-muted)' }} />
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overview</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{findings.length}</div>
                            </button>
                            {Object.entries(MODULE_META).map(([id, meta]) => {
                                const count = byType[id]?.length || 0;
                                const isActive = activeModule === id;
                                return (
                                    <button 
                                        key={id}
                                        onClick={() => setActiveModule(id)}
                                        className="glass-panel hover-row" 
                                        style={{ 
                                            padding: '16px', textAlign: 'center', cursor: 'pointer',
                                            opacity: count === 0 ? 0.4 : 1,
                                            border: `1px solid ${isActive ? meta.color : 'var(--panel-border)'}`,
                                            background: isActive ? `rgba(${hexToRgb(meta.color)}, 0.1)` : 'var(--panel-bg)'
                                        }}
                                    >
                                        <div style={{ color: isActive ? meta.color : 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>{meta.icon}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{meta.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: count > 0 && id === 'js_secret' ? '#ff4d4d' : 'inherit' }}>{count}</div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Findings Area */}
                        <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <List size={18} color="var(--accent-color)" />
                                    <span style={{ fontWeight: 600 }}>{activeModule === 'all' ? 'All Intelligence' : MODULE_META[activeModule]?.label}</span>
                                </div>
                                {loading && <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', animation: 'blink 1.5s infinite' }}>● UPDATING...</div>}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                {displayFindings.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', opacity: 0.3 }}>
                                        <ShieldCheck size={48} />
                                        <span>No findings for this module. Run a targeted scan!</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {displayFindings.map((f, i) => {
                                            const meta = MODULE_META[f.type] || { color: '#a6a6a6', label: f.type };
                                            const sColor = severityColor(f.severity);
                                            const ctx = f.context || {};
                                            
                                            return (
                                                <div key={f.id || i} style={{
                                                    padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                                                    border: '1px solid rgba(255,255,255,0.05)', borderLeft: `4px solid ${meta.color}`,
                                                    display: 'flex', gap: '20px', alignItems: 'flex-start'
                                                }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                            <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '2px 8px', background: meta.color, color: '#000', borderRadius: '4px', textTransform: 'uppercase' }}>{meta.label}</span>
                                                            <span style={{ fontSize: '0.62rem', fontWeight: 900, padding: '2px 8px', border: `1px solid ${sColor}`, color: sColor, borderRadius: '4px', textTransform: 'uppercase' }}>{f.severity}</span>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(f.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-main)', wordBreak: 'break-all', marginBottom: '10px' }}>
                                                            {f.value}
                                                        </div>
                                                        {Object.keys(ctx).length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'x 16px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                                                                {Object.entries(ctx).map(([k, v]) => (
                                                                    v && <div key={k} style={{ fontSize: '0.75rem' }}>
                                                                        <span style={{ color: 'var(--accent-color)', marginRight: '6px', fontWeight: 600 }}>{k}:</span>
                                                                        <span style={{ color: 'var(--text-muted)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
                        <Globe size={64} style={{ marginBottom: '20px' }} />
                        <h2>Select a target to view intelligence</h2>
                    </div>
                )}
            </div>
        </div>
    );
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}
