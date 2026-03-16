import React, { useState, useEffect, useRef } from 'react';
import { Shield, Radio, Key, Link2, Cpu, Globe, Search, ChevronRight, AlertTriangle, Info, ShieldCheck, Database, LayoutGrid, List, Terminal, Activity } from 'lucide-react';

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

export default function SubdomainDashboard({ projectId, socketRef }) {
    const [subdomains, setSubdomains] = useState([]);
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [findings, setFindings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModule, setActiveModule] = useState('all');
    const [scanLogs, setScanLogs] = useState({}); // { domain: [logs] }
    
    const terminalRef = useRef(null);

    // Fetch scanned targets
    useEffect(() => {
        const fetchTargets = () => {
            fetch(`${API_URL}/api/projects/${projectId}/scanned-targets`)
                .then(r => r.json())
                .then(data => {
                    const sorted = Array.isArray(data) ? data : [];
                    setSubdomains(sorted);
                    
                    // Initialize logs for scanning domains if they have logBuffer
                    const initialLogs = {};
                    sorted.forEach(s => {
                        if (s.logBuffer && s.logBuffer.length > 0) {
                            initialLogs[s.domain] = s.logBuffer;
                        }
                    });
                    setScanLogs(prev => ({ ...prev, ...initialLogs }));

                    if (sorted.length > 0) setSelectedDomain(curr => curr || sorted[0].domain);
                })
                .catch(console.error);
        };

        fetchTargets();
        const interval = setInterval(fetchTargets, 10000); // Poll for new scanned targets every 10s
        return () => clearInterval(interval);
    }, [projectId]);

    // Socket listener for targeted logs
    useEffect(() => {
        if (!socketRef?.current) return;
        const socket = socketRef.current;

        const onTargetedLog = (data) => {
            if (data.projectId == projectId) {
                setScanLogs(prev => ({
                    ...prev,
                    [data.domain]: [...(prev[data.domain] || []), data.log].slice(-100)
                }));
            }
        };

        const onTargetedFinished = (data) => {
            if (data.projectId == projectId) {
                // Refresh subdomains list to update scanning state
                fetch(`${API_URL}/api/projects/${projectId}/scanned-targets`)
                    .then(r => r.json())
                    .then(setSubdomains)
                    .catch(() => {});
            }
        };

        const onResultsUpdated = (data) => {
            if (data.projectId == projectId && data.domain === selectedDomain) {
                fetchFindings(selectedDomain);
            }
        };

        socket.on('targeted-log', onTargetedLog);
        socket.on('targeted-scan-finished', onTargetedFinished);
        socket.on('domain-results-updated', onResultsUpdated);
        return () => {
            socket.off('targeted-log', onTargetedLog);
            socket.off('targeted-scan-finished', onTargetedFinished);
            socket.off('domain-results-updated', onResultsUpdated);
        };
    }, [socketRef, projectId, selectedDomain]);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [scanLogs, selectedDomain]);

    // Fetch findings when selectedDomain changes
    const fetchFindings = (domain) => {
        if (!domain) return;
        setLoading(true);
        fetch(`${API_URL}/api/projects/${projectId}/domain-scan/${encodeURIComponent(domain)}`)
            .then(r => r.json())
            .then(data => {
                setFindings(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchFindings(selectedDomain);
        
        // Fetch historical logs when a domain is selected
        if (selectedDomain) {
            fetch(`${API_URL}/api/projects/${projectId}/domain-logs/${encodeURIComponent(selectedDomain)}`)
                .then(r => r.json())
                .then(history => {
                    setScanLogs(prev => ({
                        ...prev,
                        [selectedDomain]: Array.isArray(history) ? history : []
                    }));
                })
                .catch(console.error);
        }
    }, [projectId, selectedDomain]);

    const filteredSubdomains = subdomains.filter(s => s.domain.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const currSubdomain = subdomains.find(s => s.domain === selectedDomain);
    const isScanning = currSubdomain?.isScanning;

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
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Scanned Targets</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            className="glass-input" 
                            placeholder="Filter targets..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '6px 10px 6px 32px', fontSize: '0.8rem', width: '100%' }} 
                        />
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {filteredSubdomains.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            No scanned targets yet.
                        </div>
                    ) : filteredSubdomains.map(s => {
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
                                    background: s.isScanning ? 'var(--danger-color)' : (s.context?.status_code >= 200 && s.context?.status_code < 300 ? '#00ff9d' : '#666'),
                                    boxShadow: s.isScanning ? '0 0 8px var(--danger-color)' : 'none',
                                    animation: s.isScanning ? 'blink 1.5s infinite' : 'none'
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
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '16px' }}>
                {selectedDomain ? (
                    <>
                        {/* Domain Header Card */}
                        <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${isScanning ? 'var(--danger-color)' : 'var(--accent-color)'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div>
                                    <h1 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', margin: 0, color: isScanning ? 'var(--danger-color)' : 'var(--accent-color)' }}>{selectedDomain}</h1>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Database size={12} /> Intelligence Profile
                                        </span>
                                        {findings.some(f => f.type === 'waf') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', background: 'rgba(167,139,250,0.1)', border: '1px solid #a78bfa', borderRadius: '100px', color: '#a78bfa', fontSize: '0.65rem', fontWeight: 700 }}>
                                                <Shield size={10} /> {findings.find(f => f.type === 'waf')?.cdn_waf || 'WAF PROTECTED'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {isScanning && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,77,77,0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '0.75rem', fontWeight: 800, animation: 'blink 2s infinite' }}>
                                        <Activity size={14} /> LIVE BACKGROUND SCANNING...
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Findings Discovered</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{findings.length}</div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                            <button 
                                onClick={() => setActiveModule('all')}
                                className="glass-panel hover-row" 
                                style={{ 
                                    padding: '12px', textAlign: 'center', cursor: 'pointer',
                                    border: `1px solid ${activeModule === 'all' ? 'var(--accent-color)' : 'var(--panel-border)'}`,
                                    background: activeModule === 'all' ? 'rgba(0,255,157,0.05)' : 'var(--panel-bg)',
                                    minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                                }}
                            >
                                <LayoutGrid size={18} style={{ marginBottom: '4px', color: activeModule === 'all' ? 'var(--accent-color)' : 'var(--text-muted)' }} />
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Overview</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{findings.length}</div>
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
                                            padding: '12px', textAlign: 'center', cursor: 'pointer',
                                            opacity: count === 0 ? 0.4 : 1,
                                            border: `1px solid ${isActive ? meta.color : 'var(--panel-border)'}`,
                                            background: isActive ? `rgba(${hexToRgb(meta.color)}, 0.1)` : 'var(--panel-bg)',
                                            minHeight: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ color: isActive ? meta.color : 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>{meta.icon}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{meta.label}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: count > 0 && id === 'js_secret' ? '#ff4d4d' : 'inherit' }}>{count}</div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Findings Area */}
                        <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <List size={16} color="var(--accent-color)" />
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{activeModule === 'all' ? 'All Intelligence' : MODULE_META[activeModule]?.label}</span>
                                </div>
                                {loading && <div style={{ fontSize: '0.7rem', color: 'var(--accent-color)', animation: 'blink 1.5s infinite' }}>● UPDATING...</div>}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                {displayFindings.length === 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', opacity: 0.15 }}>
                                        <ShieldCheck size={40} />
                                        <span style={{ fontSize: '0.8rem' }}>No findings yet. Check back after scan finishes.</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {displayFindings.map((f, i) => {
                                            const meta = MODULE_META[f.type] || { color: '#a6a6a6', label: f.type };
                                            const sColor = severityColor(f.severity);
                                            const ctx = f.context || {};
                                            
                                            return (
                                                <div key={f.id || i} style={{
                                                    padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                                                    border: '1px solid rgba(255,255,255,0.05)', borderLeft: `3px solid ${meta.color}`,
                                                    display: 'flex', gap: '16px', alignItems: 'flex-start'
                                                }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', background: meta.color, color: '#000', borderRadius: '3px', textTransform: 'uppercase' }}>{meta.label}</span>
                                                            <span style={{ fontSize: '0.55rem', fontWeight: 900, padding: '1px 6px', border: `1px solid ${sColor}`, color: sColor, borderRadius: '3px', textTransform: 'uppercase' }}>{f.severity}</span>
                                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{new Date(f.timestamp).toLocaleString()}</span>
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)', wordBreak: 'break-all', marginBottom: '8px' }}>
                                                            {f.value}
                                                        </div>
                                                        {Object.keys(ctx).length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', background: 'rgba(0,0,0,0.15)', padding: '8px', borderRadius: '6px' }}>
                                                                {Object.entries(ctx).map(([k, v]) => (
                                                                    v && <div key={k} style={{ fontSize: '0.7rem' }}>
                                                                        <span style={{ color: 'var(--accent-color)', marginRight: '4px', opacity: 0.7 }}>{k}:</span>
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

                        {/* Live Scan Verbosity Terminal */}
                        {(isScanning || (scanLogs[selectedDomain]?.length > 0)) && (
                            <div className="glass-panel" style={{ height: '180px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${isScanning ? 'var(--danger-color)' : 'var(--panel-border)'}` }}>
                                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                                        <Terminal size={14} color={isScanning ? 'var(--danger-color)' : 'var(--text-muted)'} /> 
                                        LIVE VERBOSITY: {selectedDomain}
                                    </div>
                                    {isScanning && <div style={{ fontSize: '0.65rem', animation: 'blink 1s infinite', color: 'var(--danger-color)' }}>RECIEVING STREAM...</div>}
                                </div>
                                <div ref={terminalRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', background: '#000', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {scanLogs[selectedDomain]?.map((log, i) => {
                                        const logStr = String(log);
                                        const color = logStr.includes('[ERR]') ? '#ff4d4d' : logStr.includes('[SYSTEM]') ? '#a78bfa' : '#00ff9d';
                                        return <div key={i} style={{ color, opacity: 0.9 }}>{logStr}</div>;
                                    })}
                                    {isScanning && <div style={{ color: 'var(--accent-color)', marginTop: '4px' }}>_</div>}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
                        <Globe size={64} style={{ marginBottom: '20px' }} />
                        <h2>Select a target to view intelligence profile</h2>
                        <span style={{ fontSize: '0.9rem' }}>Only subdomains with active scans or discovered findings are shown.</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function hexToRgb(hex) {
    const r = parseInt(hex?.slice(1, 3), 16) || 0;
    const g = parseInt(hex?.slice(3, 5), 16) || 0;
    const b = parseInt(hex?.slice(5, 7), 16) || 0;
    return `${r},${g},${b}`;
}
