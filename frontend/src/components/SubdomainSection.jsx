import React, { useState, useEffect, useRef } from 'react';
import { Globe, Play, Square, Terminal, Download, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import io from 'socket.io-client';

const API_URL = 'http://localhost:3000';

// ─── Status badge colours ─────────────────────────────────────────────────────
const getStatusStyle = (code) => {
    if (!code) return { color: '#a6a6a6', bg: 'rgba(166,166,166,0.1)', border: '#a6a6a6' };
    if (code >= 200 && code < 300) return { color: '#00ff9d', bg: 'rgba(0,255,157,0.1)', border: '#00ff9d' };
    if (code >= 300 && code < 400) return { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: '#60a5fa' };
    if (code >= 400 && code < 500) return { color: '#ffd11a', bg: 'rgba(255,209,26,0.1)', border: '#ffd11a' };
    return { color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)', border: '#ff4d4d' };
};

const getRowAccent = (row) => {
    const rdType = row.context?.redirect_type;
    if (rdType === 'soft_redirect') return '#fbbf24'; // amber – soft 200 redirect
    if (rdType === 'redirect')      return '#60a5fa'; // blue – followed redirect
    const code = row.context?.status_code;
    if (code >= 200 && code < 300)  return '#00ff9d'; // green – clean alive
    return 'transparent';
};

// ─── Sortable column header ───────────────────────────────────────────────────
const SortHeader = ({ label, col, sort, onSort, style = {} }) => {
    const active = sort.col === col;
    return (
        <th
            onClick={() => onSort(col)}
            style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
                     color: active ? 'var(--accent-color)' : 'var(--text-muted)',
                     whiteSpace: 'nowrap', ...style }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {label}
                {active
                    ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                    : <ChevronDown size={12} style={{ opacity: 0.3 }} />}
            </span>
        </th>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function SubdomainSection({ projectId, target, customHeader, socketRef }) {
    const [scanActive, setScanActive]   = useState(false);
    const [logs, setLogs]               = useState([]);
    const [subdomains, setSubdomains]   = useState([]);
    const [searchTerm, setSearchTerm]   = useState('');
    const [filterType, setFilterType]   = useState('all'); // 'all' | 'alive' | 'soft_redirect' | 'redirect'
    const [sort, setSort]               = useState({ col: 'domain', dir: 'asc' });

    const termRef = useRef(null);

    // ── Fetch saved results on mount ──────────────────────────────────────────
    useEffect(() => {
        fetchSubdomains();
    }, [projectId]);

    // ── Socket listeners ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!socketRef?.current) return;
        const sock = socketRef.current;

        const onLog = (data) => {
            if (data.projectId === projectId || data.projectId === parseInt(projectId)) {
                setLogs(prev => [...prev, data.log]);
            }
        };
        const onFinished = (data) => {
            if (data.projectId === projectId || data.projectId === parseInt(projectId)) {
                setScanActive(false);
                fetchSubdomains();
            }
        };

        sock.on('subdomain-log', onLog);
        sock.on('subdomain-scan-finished', onFinished);

        return () => {
            sock.off('subdomain-log', onLog);
            sock.off('subdomain-scan-finished', onFinished);
        };
    }, [socketRef, projectId]);

    // ── Auto-scroll terminal ──────────────────────────────────────────────────
    useEffect(() => {
        if (termRef.current) {
            termRef.current.scrollTop = termRef.current.scrollHeight;
        }
    }, [logs]);

    const fetchSubdomains = async () => {
        try {
            const res = await fetch(`${API_URL}/api/projects/${projectId}/subdomains`);
            if (res.ok) {
                const data = await res.json();
                setSubdomains(data);
            }
        } catch (e) {
            console.error('[SubdomainSection] fetch error:', e);
        }
    };

    const handleStart = () => {
        if (!socketRef?.current) return;
        setLogs([]);
        setScanActive(true);
        socketRef.current.emit('start-subdomain-scan', {
            projectId: parseInt(projectId),
            target,
            header: customHeader || ''
        });
    };

    const handleStop = () => {
        if (!socketRef?.current) return;
        socketRef.current.emit('stop-scan', { projectId: parseInt(projectId) });
        setScanActive(false);
    };

    // ─── Export to JSON ───────────────────────────────────────────────────────
    const exportJson = () => {
        const exportData = filteredAndSorted.map(row => ({
            subdomain:      row.domain,
            status_code:    row.context?.status_code,
            title:          row.context?.title,
            ip:             row.context?.ip,
            tech:           row.context?.tech,
            final_url:      row.context?.final_url,
            redirect_type:  row.context?.redirect_type || null,
            cdn_waf:        row.cdn_waf || null,
            timestamp:      row.timestamp
        }));
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subdomains_${target.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─── Filter ───────────────────────────────────────────────────────────────
    const filtered = subdomains.filter(row => {
        const matchSearch = !searchTerm
            || (row.domain || '').toLowerCase().includes(searchTerm.toLowerCase())
            || (row.context?.ip || '').includes(searchTerm)
            || (row.context?.title || '').toLowerCase().includes(searchTerm.toLowerCase())
            || (row.context?.tech || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchSearch) return false;

        if (filterType === 'alive')         return row.context?.status_code >= 200 && row.context?.status_code < 400;
        if (filterType === 'soft_redirect') return row.context?.redirect_type === 'soft_redirect';
        if (filterType === 'redirect')      return row.context?.redirect_type === 'redirect';
        return true;
    });

    // ─── Sort ─────────────────────────────────────────────────────────────────
    const handleSort = (col) => {
        setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));
    };

    const filteredAndSorted = [...filtered].sort((a, b) => {
        let av, bv;
        switch (sort.col) {
            case 'status': av = a.context?.status_code || 0; bv = b.context?.status_code || 0; break;
            case 'title':  av = (a.context?.title || '').toLowerCase(); bv = (b.context?.title || '').toLowerCase(); break;
            case 'ip':     av = a.context?.ip || ''; bv = b.context?.ip || ''; break;
            case 'tech':   av = a.context?.tech || ''; bv = b.context?.tech || ''; break;
            default:       av = (a.domain || '').toLowerCase(); bv = (b.domain || '').toLowerCase();
        }
        if (av < bv) return sort.dir === 'asc' ? -1 : 1;
        if (av > bv) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // ─── Stats ────────────────────────────────────────────────────────────────
    const total       = subdomains.length;
    const aliveCount  = subdomains.filter(r => r.context?.status_code >= 200 && r.context?.status_code < 400).length;
    const softRedirects = subdomains.filter(r => r.context?.redirect_type === 'soft_redirect').length;
    const redirects   = subdomains.filter(r => r.context?.redirect_type === 'redirect').length;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0 }}>

            {/* ── Top action bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Globe size={22} color="var(--accent-color)" />
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Subdomain Discovery</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {target}
                    </span>
                </div>

                <div style={{ flex: 1 }} />

                {!scanActive ? (
                    <button
                        className="glass-btn primary"
                        onClick={handleStart}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Play size={16} /> Run Discovery
                    </button>
                ) : (
                    <button
                        className="glass-btn danger"
                        onClick={handleStop}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--danger-color)', color: '#fff' }}
                    >
                        <Square size={16} fill="currentColor" /> Stop
                    </button>
                )}

                <button
                    className="glass-btn"
                    onClick={fetchSubdomains}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    title="Refresh results"
                >
                    <RefreshCw size={16} />
                </button>

                <button
                    className="glass-btn"
                    onClick={exportJson}
                    disabled={filteredAndSorted.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: filteredAndSorted.length === 0 ? 0.4 : 1 }}
                >
                    <Download size={16} /> Export JSON
                </button>
            </div>

            {/* ── Stats row ── */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                    { label: 'Total Found',    value: total,        color: 'var(--text-main)', active: filterType === 'all',         key: 'all' },
                    { label: 'Alive',          value: aliveCount,   color: '#00ff9d',          active: filterType === 'alive',        key: 'alive' },
                    { label: 'Soft Redirects', value: softRedirects, color: '#fbbf24',         active: filterType === 'soft_redirect', key: 'soft_redirect' },
                    { label: 'Redirects',      value: redirects,    color: '#60a5fa',          active: filterType === 'redirect',     key: 'redirect' },
                ].map(stat => (
                    <button
                        key={stat.key}
                        className="glass-panel"
                        onClick={() => setFilterType(stat.active ? 'all' : stat.key)}
                        style={{
                            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px',
                            cursor: 'pointer', border: `1px solid ${stat.active ? stat.color : 'var(--panel-border)'}`,
                            background: stat.active ? `rgba(0,0,0,0.3)` : 'var(--panel-bg)',
                            transition: 'all 0.2s', borderRadius: '10px'
                        }}
                    >
                        <span style={{ fontSize: '1.4rem', fontWeight: 700, color: stat.color }}>
                            {stat.value}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stat.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Search bar ── */}
            <input
                type="text"
                className="glass-input"
                placeholder="Filter by subdomain, IP, title or tech..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: '8px 16px', width: '100%', boxSizing: 'border-box' }}
            />

            {/* ── Live log terminal (collapsible, only when active or has logs) ── */}
            {(scanActive || logs.length > 0) && (
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: '180px' }}>
                    <div style={{
                        padding: '8px 16px', borderBottom: '1px solid var(--panel-border)',
                        display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem'
                    }}>
                        <Terminal size={14} color="var(--accent-color)" />
                        <span style={{ color: 'var(--text-muted)' }}>Scanner Output</span>
                        {scanActive && <span style={{ marginLeft: 'auto', color: 'var(--accent-color)', animation: 'blink 1.5s infinite', fontSize: '0.75rem' }}>● RUNNING</span>}
                    </div>
                    <div
                        ref={termRef}
                        style={{
                            flex: 1, overflowY: 'auto', padding: '10px 16px',
                            fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                            color: '#00ff9d', background: 'rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column', gap: '4px'
                        }}
                    >
                        {logs.map((log, i) => {
                            const isErr = log.includes('[ERR]');
                            const isSys = log.includes('[SYSTEM]');
                            const color = isErr ? 'var(--danger-color)' : isSys ? '#a78bfa' : '#00ff9d';
                            return <div key={i} style={{ color }}>{log}</div>;
                        })}
                    </div>
                </div>
            )}

            {/* ── Results table ── */}
            <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {filteredAndSorted.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {total === 0
                            ? '👁 No subdomain results yet. Run discovery to start.'
                            : 'No subdomains match your current filter.'}
                    </div>
                ) : (
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--panel-bg)', zIndex: 2 }}>
                                <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                                    <SortHeader label="Status" col="status" sort={sort} onSort={handleSort} style={{ width: '90px' }} />
                                    <SortHeader label="Subdomain" col="domain" sort={sort} onSort={handleSort} />
                                    <SortHeader label="Title" col="title" sort={sort} onSort={handleSort} />
                                    <SortHeader label="IP" col="ip" sort={sort} onSort={handleSort} style={{ width: '140px' }} />
                                    <SortHeader label="Tech / CDN" col="tech" sort={sort} onSort={handleSort} />
                                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', width: '120px' }}>Redirect</th>
                                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', width: '200px' }}>Final URL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSorted.map((row, idx) => {
                                    const code     = row.context?.status_code;
                                    const accent   = getRowAccent(row);
                                    const stStyle  = getStatusStyle(code);
                                    const rdType   = row.context?.redirect_type;

                                    return (
                                        <tr
                                            key={row.id || idx}
                                            className="hover-row"
                                            style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                borderLeft: `3px solid ${accent}`,
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            {/* Status */}
                                            <td style={{ padding: '10px 16px' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '100px',
                                                    fontSize: '0.75rem', fontWeight: 700,
                                                    background: stStyle.bg, color: stStyle.color,
                                                    border: `1px solid ${stStyle.border}`,
                                                    fontFamily: 'var(--font-mono)'
                                                }}>
                                                    {code || '—'}
                                                </span>
                                            </td>

                                            {/* Subdomain */}
                                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                                                <a
                                                    href={row.context?.final_url || `https://${row.domain}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{ color: 'var(--accent-color)', textDecoration: 'none' }}
                                                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                >
                                                    {row.domain}
                                                </a>
                                            </td>

                                            {/* Title */}
                                            <td style={{ padding: '10px 16px', color: 'var(--text-muted)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={row.context?.title}>
                                                {row.context?.title || <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>

                                            {/* IP */}
                                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {row.context?.ip || '—'}
                                            </td>

                                            {/* Tech */}
                                            <td style={{ padding: '10px 16px' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {(row.context?.tech || '').split(',').filter(Boolean).map((t, i) => (
                                                        <span key={i} style={{
                                                            fontSize: '0.65rem', padding: '1px 6px',
                                                            borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)',
                                                            color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)',
                                                            whiteSpace: 'nowrap'
                                                        }}>{t.trim()}</span>
                                                    ))}
                                                    {row.cdn_waf && (
                                                        <span style={{
                                                            fontSize: '0.65rem', padding: '1px 6px',
                                                            borderRadius: '4px', border: '1px solid rgba(0,208,255,0.4)',
                                                            color: '#00d0ff', background: 'rgba(0,208,255,0.08)',
                                                            whiteSpace: 'nowrap', fontWeight: 700
                                                        }}>{row.cdn_waf}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Redirect type badge */}
                                            <td style={{ padding: '10px 16px' }}>
                                                {rdType === 'soft_redirect' && (
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: '100px', fontWeight: 700, border: '1px solid #fbbf24', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', whiteSpace: 'nowrap' }}>
                                                        SOFT 200
                                                    </span>
                                                )}
                                                {rdType === 'redirect' && (
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: '100px', fontWeight: 700, border: '1px solid #60a5fa', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', whiteSpace: 'nowrap' }}>
                                                        REDIRECT
                                                    </span>
                                                )}
                                                {!rdType && code >= 200 && code < 300 && (
                                                    <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: '100px', fontWeight: 700, border: '1px solid #00ff9d', color: '#00ff9d', background: 'rgba(0,255,157,0.08)', whiteSpace: 'nowrap' }}>
                                                        ALIVE
                                                    </span>
                                                )}
                                            </td>

                                            {/* Final URL */}
                                            <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={row.context?.final_url}>
                                                {row.context?.final_url && row.context.final_url !== `https://${row.domain}` && row.context.final_url !== `http://${row.domain}`
                                                    ? row.context.final_url
                                                    : <span style={{ opacity: 0.3 }}>—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer count */}
                {filteredAndSorted.length > 0 && (
                    <div style={{ padding: '8px 16px', borderTop: '1px solid var(--panel-border)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Showing {filteredAndSorted.length} of {total} results</span>
                        <span>Click column headers to sort · Click stat cards to filter</span>
                    </div>
                )}
            </div>
        </div>
    );
}
