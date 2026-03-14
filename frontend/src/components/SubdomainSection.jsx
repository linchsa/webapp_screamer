import React, { useState, useEffect, useRef } from 'react';
import { Globe, Play, Square, Terminal, Download, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';

const API_URL = 'http://localhost:3000';

const getStatusStyle = (code) => {
    if (!code) return { color: '#a6a6a6', bg: 'rgba(166,166,166,0.1)', border: '#a6a6a6' };
    if (code >= 200 && code < 300) return { color: '#00ff9d', bg: 'rgba(0,255,157,0.1)', border: '#00ff9d' };
    if (code >= 300 && code < 400) return { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: '#60a5fa' };
    if (code >= 400 && code < 500) return { color: '#ffd11a', bg: 'rgba(255,209,26,0.1)', border: '#ffd11a' };
    return { color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)', border: '#ff4d4d' };
};

const getRowAccent = (row) => {
    const rd = row.context?.redirect_type;
    if (rd === 'soft_redirect') return '#fbbf24';
    if (rd === 'redirect')      return '#60a5fa';
    const c = row.context?.status_code;
    if (c >= 200 && c < 300)    return '#00ff9d';
    return 'rgba(255,255,255,0.08)';
};

const SortTh = ({ label, col, sort, onSort, style = {} }) => (
    <th onClick={() => onSort(col)} style={{
        padding: '8px 10px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        color: sort.col === col ? 'var(--accent-color)' : 'var(--text-muted)',
        fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg)', ...style
    }}>
        {label}
        {sort.col === col
            ? (sort.dir === 'asc' ? <ChevronUp size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
                                  : <ChevronDown size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />)
            : <ChevronDown size={10} style={{ marginLeft: 3, verticalAlign: 'middle', opacity: 0.25 }} />}
    </th>
);

export default function SubdomainSection({ projectId, target, customHeader, socketRef }) {
    const [scanActive, setScanActive] = useState(false);
    const [logs, setLogs]             = useState([]);
    const [subdomains, setSubdomains] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [sort, setSort]             = useState({ col: 'domain', dir: 'asc' });
    const [showLogs, setShowLogs]     = useState(false);

    const termRef = useRef(null);

    useEffect(() => { fetchSubdomains(); }, [projectId]);

    useEffect(() => {
        if (!socketRef?.current) return;
        const sock = socketRef.current;

        const onLog = (data) => {
            if (data.projectId === projectId || data.projectId === parseInt(projectId)) {
                setLogs(prev => [...prev, data.log]);
                setShowLogs(true);
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
        return () => { sock.off('subdomain-log', onLog); sock.off('subdomain-scan-finished', onFinished); };
    }, [socketRef, projectId]);

    useEffect(() => {
        if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
    }, [logs]);

    const fetchSubdomains = async () => {
        try {
            const res = await fetch(`${API_URL}/api/projects/${projectId}/subdomains`);
            if (res.ok) setSubdomains(await res.json());
        } catch (e) { console.error('[SubdomainSection] fetch error:', e); }
    };

    const handleStart = () => {
        if (!socketRef?.current) return;
        setLogs([]);
        setScanActive(true);
        setShowLogs(true);
        socketRef.current.emit('start-subdomain-scan', {
            projectId: parseInt(projectId), target, header: customHeader || ''
        });
    };

    const handleStop = () => {
        socketRef.current?.emit('stop-scan', { projectId: parseInt(projectId) });
        setScanActive(false);
    };

    const exportJson = () => {
        const data = filteredAndSorted.map(r => ({
            subdomain:     r.domain,
            status_code:   r.context?.status_code,
            title:         r.context?.title,
            ip:            r.context?.ip,
            tech:          r.context?.tech,
            final_url:     r.context?.final_url,
            redirect_type: r.context?.redirect_type || null,
            cdn_waf:       r.cdn_waf || null,
            timestamp:     r.timestamp
        }));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subdomains_${(target || '').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Stats
    const total        = subdomains.length;
    const aliveCount   = subdomains.filter(r => r.context?.status_code >= 200 && r.context?.status_code < 400).length;
    const softCount    = subdomains.filter(r => r.context?.redirect_type === 'soft_redirect').length;
    const redirCount   = subdomains.filter(r => r.context?.redirect_type === 'redirect').length;

    // Filter
    const filtered = subdomains.filter(row => {
        const term = searchTerm.toLowerCase();
        const match = !searchTerm
            || (row.domain || '').toLowerCase().includes(term)
            || (row.context?.ip || '').includes(term)
            || (row.context?.title || '').toLowerCase().includes(term)
            || (row.context?.tech || '').toLowerCase().includes(term);
        if (!match) return false;
        if (filterType === 'alive')         return row.context?.status_code >= 200 && row.context?.status_code < 400;
        if (filterType === 'soft_redirect') return row.context?.redirect_type === 'soft_redirect';
        if (filterType === 'redirect')      return row.context?.redirect_type === 'redirect';
        return true;
    });

    const handleSort = (col) => setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }));

    const filteredAndSorted = [...filtered].sort((a, b) => {
        let av, bv;
        switch (sort.col) {
            case 'status': av = a.context?.status_code || 0; bv = b.context?.status_code || 0; break;
            case 'title':  av = (a.context?.title || '').toLowerCase(); bv = (b.context?.title || '').toLowerCase(); break;
            case 'ip':     av = a.context?.ip || ''; bv = b.context?.ip || ''; break;
            default:       av = (a.domain || '').toLowerCase(); bv = (b.domain || '').toLowerCase();
        }
        if (av < bv) return sort.dir === 'asc' ? -1 : 1;
        if (av > bv) return sort.dir === 'asc' ?  1 : -1;
        return 0;
    });

    const STAT_CARDS = [
        { key: 'all',          label: 'Total',   value: total,      color: 'var(--text-main)' },
        { key: 'alive',        label: 'Alive',   value: aliveCount, color: '#00ff9d' },
        { key: 'soft_redirect',label: 'Soft 200',value: softCount,  color: '#fbbf24' },
        { key: 'redirect',     label: 'Redir',   value: redirCount, color: '#60a5fa' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflow: 'hidden', width: '100%' }}>

            {/* ── Row 1: Title + Actions ──────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <Globe size={18} color="var(--accent-color)" />
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>Subdomain Discovery</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 7px', borderRadius: '4px' }}>
                    {target}
                </code>

                <div style={{ flex: 1 }} />

                {!scanActive
                    ? <button className="glass-btn primary" onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.85rem' }}>
                        <Play size={14} /> Run Discovery
                      </button>
                    : <button className="glass-btn danger" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.85rem', background: 'var(--danger-color)', color: '#fff' }}>
                        <Square size={14} fill="currentColor" /> Stop
                      </button>
                }
                <button className="glass-btn" onClick={fetchSubdomains} title="Refresh" style={{ padding: '6px 10px' }}>
                    <RefreshCw size={14} />
                </button>
                <button className="glass-btn" onClick={exportJson} disabled={filteredAndSorted.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem', opacity: filteredAndSorted.length === 0 ? 0.4 : 1 }}>
                    <Download size={14} /> Export JSON
                </button>
            </div>

            {/* ── Row 2: Stats + Search in one horizontal bar ──────────────── */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'nowrap' }}>
                {STAT_CARDS.map(s => (
                    <button key={s.key} onClick={() => setFilterType(s.active || filterType === s.key ? 'all' : s.key)}
                        className="glass-panel"
                        style={{
                            padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                            border: `1px solid ${filterType === s.key ? s.color : 'var(--panel-border)'}`,
                            background: filterType === s.key ? 'rgba(0,0,0,0.3)' : 'var(--panel-bg)',
                            borderRadius: '8px', flexShrink: 0, transition: 'border-color 0.15s'
                        }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.label}</span>
                    </button>
                ))}

                {/* Search fills remaining space */}
                <input
                    type="text"
                    className="glass-input"
                    placeholder="Filter by subdomain, IP, title or tech..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: '6px 12px', margin: 0, fontSize: '0.85rem' }}
                />

                {/* Collapsible log toggle */}
                {logs.length > 0 && (
                    <button className="glass-btn" onClick={() => setShowLogs(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', fontSize: '0.78rem', flexShrink: 0 }}>
                        <Terminal size={12} />
                        {showLogs ? 'Hide Logs' : `Logs (${logs.length})`}
                        {scanActive && <span style={{ color: 'var(--accent-color)', animation: 'blink 1.5s infinite' }}>●</span>}
                    </button>
                )}
            </div>

            {/* ── Collapsible Terminal ──────────────────────────────────────── */}
            {showLogs && (
                <div className="glass-panel" style={{ flexShrink: 0, height: '120px', display: 'flex', flexDirection: 'column' }}>
                    <div ref={termRef} style={{
                        flex: 1, overflowY: 'auto', padding: '8px 12px',
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', flexDirection: 'column', gap: '2px'
                    }}>
                        {logs.map((log, i) => {
                            const isErr = log.includes('[ERR]');
                            const isSys = log.includes('[SYSTEM]');
                            return (
                                <div key={i} style={{ color: isErr ? 'var(--danger-color)' : isSys ? '#a78bfa' : '#00ff9d' }}>
                                    {log}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Results table ─────────────────────────────────────────────── */}
            <div className="glass-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {filteredAndSorted.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '10px' }}>
                        <Globe size={36} style={{ opacity: 0.2 }} />
                        <span style={{ fontSize: '0.9rem' }}>{total === 0 ? 'No results yet — click Run Discovery to start.' : 'No subdomains match the current filter.'}</span>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '64px' }} />   {/* Status */}
                                    <col style={{ width: '26%' }} />    {/* Subdomain */}
                                    <col style={{ width: '18%' }} />    {/* Title */}
                                    <col style={{ width: '110px' }} />  {/* IP */}
                                    <col style={{ width: '16%' }} />    {/* Tech */}
                                    <col style={{ width: '80px' }} />   {/* Redirect */}
                                    <col style={{ width: '20%' }} />    {/* Final URL */}
                                </colgroup>
                                <thead>
                                    <tr>
                                        <SortTh label="Status"   col="status" sort={sort} onSort={handleSort} />
                                        <SortTh label="Subdomain" col="domain" sort={sort} onSort={handleSort} />
                                        <SortTh label="Title"    col="title"  sort={sort} onSort={handleSort} />
                                        <SortTh label="IP"       col="ip"     sort={sort} onSort={handleSort} />
                                        <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg)' }}>Tech / CDN</th>
                                        <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg)' }}>Flag</th>
                                        <th style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg)' }}>Final URL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSorted.map((row, idx) => {
                                        const code    = row.context?.status_code;
                                        const accent  = getRowAccent(row);
                                        const sSt     = getStatusStyle(code);
                                        const rdType  = row.context?.redirect_type;
                                        const techArr = (row.context?.tech || '').split(',').filter(Boolean).slice(0, 3);

                                        return (
                                            <tr key={row.id || idx} className="hover-row" style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                borderLeft: `3px solid ${accent}`,
                                            }}>
                                                {/* Status */}
                                                <td style={{ padding: '7px 10px' }}>
                                                    <span style={{
                                                        padding: '1px 6px', borderRadius: '100px', fontSize: '0.68rem', fontWeight: 700,
                                                        background: sSt.bg, color: sSt.color, border: `1px solid ${sSt.border}`,
                                                        fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap'
                                                    }}>{code || '—'}</span>
                                                </td>

                                                {/* Subdomain */}
                                                <td style={{ padding: '7px 10px', overflow: 'hidden', maxWidth: 0 }}>
                                                    <a href={row.context?.final_url || `https://${row.domain}`}
                                                       target="_blank" rel="noreferrer"
                                                       title={row.domain}
                                                       style={{
                                                           color: 'var(--accent-color)', textDecoration: 'none',
                                                           fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                                                           display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                       }}>
                                                        {row.domain}
                                                    </a>
                                                </td>

                                                {/* Title */}
                                                <td style={{ padding: '7px 10px', overflow: 'hidden', maxWidth: 0 }}>
                                                    <span title={row.context?.title} style={{
                                                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        color: 'var(--text-muted)', fontSize: '0.8rem'
                                                    }}>{row.context?.title || '—'}</span>
                                                </td>

                                                {/* IP */}
                                                <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {row.context?.ip || '—'}
                                                </td>

                                                {/* Tech */}
                                                <td style={{ padding: '7px 10px', overflow: 'hidden', maxWidth: 0 }}>
                                                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap', overflow: 'hidden' }}>
                                                        {row.cdn_waf && (
                                                            <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(0,208,255,0.4)', color: '#00d0ff', background: 'rgba(0,208,255,0.08)', whiteSpace: 'nowrap', fontWeight: 700, flexShrink: 0 }}>
                                                                {row.cdn_waf}
                                                            </span>
                                                        )}
                                                        {techArr.map((t, i) => (
                                                            <span key={i} style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                {t.trim()}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>

                                                {/* Redirect flag */}
                                                <td style={{ padding: '7px 10px' }}>
                                                    {rdType === 'soft_redirect' && (
                                                        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '100px', fontWeight: 700, border: '1px solid #fbbf24', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', whiteSpace: 'nowrap' }}>SOFT 200</span>
                                                    )}
                                                    {rdType === 'redirect' && (
                                                        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '100px', fontWeight: 700, border: '1px solid #60a5fa', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', whiteSpace: 'nowrap' }}>REDIR</span>
                                                    )}
                                                    {!rdType && code >= 200 && code < 300 && (
                                                        <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '100px', fontWeight: 700, border: '1px solid #00ff9d', color: '#00ff9d', background: 'rgba(0,255,157,0.08)', whiteSpace: 'nowrap' }}>ALIVE</span>
                                                    )}
                                                </td>

                                                {/* Final URL */}
                                                <td style={{ padding: '7px 10px', overflow: 'hidden', maxWidth: 0 }}>
                                                    {row.context?.final_url && row.context.final_url !== `https://${row.domain}` && row.context.final_url !== `http://${row.domain}` ? (
                                                        <span title={row.context.final_url} style={{
                                                            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)'
                                                        }}>{row.context.final_url}</span>
                                                    ) : <span style={{ opacity: 0.25 }}>—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--panel-border)', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                            <span>Showing {filteredAndSorted.length} of {total}</span>
                            <span>Click stat cards to filter · Click headers to sort</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
