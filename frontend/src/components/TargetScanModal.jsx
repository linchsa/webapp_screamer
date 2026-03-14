import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Terminal, Shield, Radio, Key, Link2, Cpu, Globe } from 'lucide-react';

const MODULES = [
    { id: 'waf',        label: 'WAF / CDN Detection',      icon: <Shield size={15} />,  color: '#a78bfa', desc: 'cdncheck + httpx headers' },
    { id: 'ports',      label: 'Port Scan (nmap)',          icon: <Radio size={15} />,   color: '#60a5fa', desc: 'Top 1000 ports + service IDs' },
    { id: 'js_secrets', label: 'JS Secrets & API Keys',    icon: <Key size={15} />,     color: '#ff4d4d', desc: 'Katana crawl → Gitleaks + Nuclei' },
    { id: 'endpoints',  label: 'API Endpoint Discovery',   icon: <Link2 size={15} />,   color: '#fbbf24', desc: 'Katana + GAU deep crawl' },
    { id: 'tech',       label: 'Technology Fingerprint',   icon: <Cpu size={15} />,     color: '#34d399', desc: 'Nuclei tech/cms/panel templates' },
    { id: 'wpscan',     label: 'WordPress Audit (WPScan)', icon: <Globe size={15} />,   color: '#f97316', desc: 'Requires WPScan API key in Settings' },
];

export default function TargetScanModal({ domain, isWordpress, projectId, customHeader, socketRef, onClose, onViewResults, wpscanKey }) {
    const [selected, setSelected] = useState(() => {
        const defaults = ['waf', 'ports', 'js_secrets', 'endpoints', 'tech'];
        if (isWordpress) defaults.push('wpscan');
        return new Set(defaults);
    });
    const [scanning, setScanning]   = useState(false);
    const [logs, setLogs]           = useState([]);
    const [finished, setFinished]   = useState(false);

    const termRef = useRef(null);

    useEffect(() => {
        if (!socketRef?.current) return;
        const sock = socketRef.current;

        const onLog = (data) => {
            if ((data.projectId === projectId || data.projectId === parseInt(projectId)) && data.domain === domain) {
                setLogs(prev => [...prev, data.log]);
            }
        };
        const onFinished = (data) => {
            if ((data.projectId === projectId || data.projectId === parseInt(projectId)) && data.domain === domain) {
                setScanning(false);
                setFinished(true);
            }
        };

        sock.on('targeted-log', onLog);
        sock.on('targeted-scan-finished', onFinished);
        return () => { sock.off('targeted-log', onLog); sock.off('targeted-scan-finished', onFinished); };
    }, [socketRef, projectId, domain]);

    useEffect(() => {
        if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
    }, [logs]);

    const toggle = (id) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const handleLaunch = () => {
        if (!socketRef?.current || selected.size === 0) return;
        setScanning(true);
        setFinished(false);
        setLogs([]);
        socketRef.current.emit('start-targeted-scan', {
            projectId: parseInt(projectId),
            domain,
            header: customHeader || '',
            modules: Array.from(selected),
            wpscanKey: wpscanKey || ''
        });
    };

    return (
        // Backdrop
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', zIndex: 2000, padding: '20px'
            }}
        >
            <div className="glass-panel" style={{
                width: '100%', maxWidth: '560px',
                border: '1px solid var(--accent-color)',
                boxShadow: '0 0 40px rgba(0,255,157,0.1)',
                display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '14px 20px', borderBottom: '1px solid var(--panel-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>🎯 Targeted Scan</div>
                        <code style={{
                            fontSize: '0.78rem', color: 'var(--accent-color)',
                            background: 'rgba(0,255,157,0.08)', padding: '1px 7px', borderRadius: '4px'
                        }}>
                            {domain}
                        </code>
                    </div>
                    <button className="glass-btn" onClick={onClose} style={{ padding: '4px' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Module selector */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                        Select modules to run:
                    </div>
                    {MODULES.map(m => {
                        const active = selected.has(m.id);
                        const isWpModule = m.id === 'wpscan';
                        return (
                            <button
                                key={m.id}
                                onClick={() => !scanning && toggle(m.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 14px', borderRadius: '8px', cursor: scanning ? 'default' : 'pointer',
                                    background: active ? `rgba(${hexToRgb(m.color)}, 0.08)` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${active ? m.color : 'var(--panel-border)'}`,
                                    transition: 'all 0.15s', textAlign: 'left', width: '100%'
                                }}
                            >
                                {/* Checkbox */}
                                <div style={{
                                    width: 16, height: 16, borderRadius: '4px', flexShrink: 0,
                                    border: `2px solid ${active ? m.color : 'rgba(255,255,255,0.2)'}`,
                                    background: active ? m.color : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s'
                                }}>
                                    {active && <span style={{ color: '#000', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                                </div>

                                <span style={{ color: m.color, flexShrink: 0 }}>{m.icon}</span>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: active ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                        {m.label}
                                        {isWpModule && !isWordpress && (
                                            <span style={{ marginLeft: 8, fontSize: '0.62rem', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '4px', padding: '1px 5px' }}>
                                                WP not detected
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.desc}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Launch button */}
                <div style={{ padding: '0 20px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {!scanning ? (
                        <button
                            className="glass-btn primary"
                            onClick={handleLaunch}
                            disabled={selected.size === 0}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '8px', padding: '10px', fontSize: '0.9rem', fontWeight: 700,
                                opacity: selected.size === 0 ? 0.4 : 1
                            }}
                        >
                            <Play size={16} />
                            Launch {selected.size} Module{selected.size !== 1 ? 's' : ''}
                        </button>
                    ) : (
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '10px', padding: '10px', fontSize: '0.88rem', color: 'var(--accent-color)',
                            border: '1px solid rgba(0,255,157,0.2)', borderRadius: '8px', background: 'rgba(0,255,157,0.04)'
                        }}>
                            <span style={{ animation: 'blink 1.5s infinite' }}>●</span>
                            Scanning in progress...
                        </div>
                    )}
                    {finished && !scanning && (
                        <button
                            className="glass-btn primary"
                            onClick={onViewResults}
                            style={{ padding: '10px 18px', fontWeight: 700 }}
                        >
                            View Results
                        </button>
                    )}
                </div>

                {/* Live log terminal */}
                {logs.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--panel-border)' }}>
                        <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <Terminal size={11} /> Scanner Output
                        </div>
                        <div
                            ref={termRef}
                            style={{
                                height: '140px', overflowY: 'auto', padding: '6px 14px',
                                fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                                background: 'rgba(0,0,0,0.6)', display: 'flex',
                                flexDirection: 'column', gap: '2px'
                            }}
                        >
                            {logs.map((log, i) => {
                                const isErr = log.includes('[ERR]');
                                const isSys = log.includes('[SYSTEM]');
                                return (
                                    <div key={i} style={{ color: isErr ? '#ff4d4d' : isSys ? '#a78bfa' : '#00ff9d' }}>
                                        {log}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Converts #rrggbb → "r,g,b" for rgba()
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}
