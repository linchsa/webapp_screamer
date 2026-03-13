import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Terminal, Network, ShieldAlert, Cpu, Download, Trash2, List, TableProperties, Eye, X, Database, Flame } from 'lucide-react';
import io from 'socket.io-client';

const API_URL = 'http://localhost:3000';

export default function ProjectView() {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [project, setProject] = useState(null);
    const [customHeader, setCustomHeader] = useState('');
    const [scanActive, setScanActive] = useState(false);
    const [logs, setLogs] = useState(['Connecting to backend...']);
    const [findings, setFindings] = useState([]);
    const [activeTab, setActiveTab] = useState('logs'); // 'logs' or 'results'
    
    // Stats for insights
    const [stats, setStats] = useState({ subdomains: 0, ports: 0, vulns: 0 });

    const [quickFilters, setQuickFilters] = useState({
        only200: false,
        onlySecrets: false,
        onlyParams: false
    });

    const [viewCode, setViewCode] = useState(null); // { path, content, finding }
    const [hoveredDomain, setHoveredDomain] = useState(null);

    const terminalRef = useRef(null);
    const socketRef = useRef(null);

    // Fetch initial data
    useEffect(() => {
        fetchProjectData();
        fetchActiveStatus();
        
        socketRef.current = io(API_URL);
        
        socketRef.current.on('connect', () => {
            setLogs(prev => [...prev, '[SYSTEM] Connected to orchestrator.']);
        });
        
        socketRef.current.on('scan-log', (data) => {
            if (data.projectId === id || data.projectId === parseInt(id)) {
                setLogs(prev => [...prev, data.log]);
            }
        });
        
        socketRef.current.on('scan-finished', (data) => {
            if (data.projectId === id || data.projectId === parseInt(id)) {
                setScanActive(false);
                fetchProjectData(); // Refresh findings
            }
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [id]);

    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (terminalRef.current && activeTab === 'logs') {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs, activeTab]);

    const getSeverityStyles = (severity) => {
        switch (severity?.toLowerCase()) {
            case 'critical': return { color: '#ff4d4d', bg: 'rgba(255, 77, 77, 0.1)', border: '#ff4d4d' };
            case 'high': return { color: '#ff944d', bg: 'rgba(255, 148, 77, 0.1)', border: '#ff944d' };
            case 'medium': return { color: '#ffd11a', bg: 'rgba(255, 209, 26, 0.1)', border: '#ffd11a' };
            case 'low': return { color: '#1ad1ff', bg: 'rgba(26, 209, 255, 0.1)', border: '#1ad1ff' };
            default: return { color: '#a6a6a6', bg: 'rgba(166, 166, 166, 0.1)', border: '#a6a6a6' };
        }
    };

    const fetchProjectData = async () => {
        try {
            const res = await fetch(`${API_URL}/api/projects/${id}`);
            const data = await res.json();
            setProject(data);
            setCustomHeader(data.header || '');

            const findRes = await fetch(`${API_URL}/api/projects/${id}/findings`);
            const findData = await findRes.json();
            
            // Process findings to ensure context is object
            const processed = findData.map(f => {
                let ctx = f.context;
                try {
                    if (typeof ctx === 'string') ctx = JSON.parse(ctx);
                } catch (e) {}
                return { ...f, contextObj: ctx };
            });
            
            setFindings(processed);

            // Update stats
            const subdomains = new Set(processed.map(f => f.domain)).size;
            const ports = processed.filter(f => f.type === 'port').length;
            const vulns = processed.filter(f => f.severity === 'critical' || f.severity === 'high').length;
            setStats({ subdomains, ports, vulns });
        } catch (err) {
            console.error("[ERR] Fetching project data:", err);
        }
    };

    const fetchActiveStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/api/scans/active`);
            const data = await res.json();
            const isActive = data.some(s => s.projectId === parseInt(id));
            setScanActive(isActive);
        } catch (err) {
            console.error(err);
        }
    };

    const handleStartScan = async () => {
        if (!project) return;
        setLogs(prev => [...prev, `[SYSTEM] Preparing scan for ${project.target}...`]);
        socketRef.current.emit('start-scan', {
            projectId: parseInt(id),
            target: project.target,
            header: customHeader,
            projectName: project.name
        });
        setScanActive(true);
        setActiveTab('logs');
    };

    const handleStopScan = async () => {
        socketRef.current.emit('stop-scan', { projectId: parseInt(id) });
        setScanActive(false);
        setLogs(prev => [...prev, '[SYSTEM] Stop signal sent.']);
    };

    const handleDeleteProject = async () => {
        if (window.confirm('Are you sure you want to delete this project?')) {
            await fetch(`${API_URL}/api/projects/${id}`, { method: 'DELETE' });
            navigate('/');
        }
    };

    const exportToCsv = () => {
        const headers = ['Domain', 'Type', 'Value', 'Severity', 'Context'];
        const rows = findings.map(f => [
            f.domain,
            f.type,
            f.value,
            f.severity,
            f.context
        ].join(','));
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screamer_${project?.name}_findings.csv`;
        a.click();
    };

    const handleIndividualScan = async (domain) => {
        try {
            setLogs(prev => [...prev, `[SYSTEM] Requesting individual deep scan for: ${domain}`]);
            const res = await fetch(`${API_URL}/api/scans/individual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: parseInt(id), domain, header: customHeader })
            });
            const data = await res.json();
            if (data.success) {
                // Individual scan started
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleViewCode = async (finding) => {
        let assetPath = '';
        if (finding.type === 'js_monitoring') assetPath = finding.value;
        else if (finding.contextObj?.file) assetPath = finding.contextObj.file;
        else if (finding.context?.includes('assets/')) {
            const match = finding.context.match(/assets\/([^\s]+)/);
            if (match) assetPath = match[1];
        }

        if (!assetPath) {
            alert('Could not determine source path.');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/projects/${id}/assets/view?filePath=${encodeURIComponent(assetPath)}`);
            if (res.ok) {
                const content = await res.text();
                setViewCode(content);
            } else {
                throw new Error('Could not fetch file content');
            }
        } catch (err) {
            console.error(err);
            alert(`Error loading code: ${err.message}`);
        }
    };

    const handleScanIP = (ip) => {
        if (!socket) return;
        socket.emit('start-ip-scan', { projectId: parseInt(id), ip, header: customHeader });
    };


    // Group findings by domain with filter
    const filteredFindings = findings.filter(f => {
        // Search term filter
        const matchesSearch = searchTerm === '' || 
            f.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            f.value?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (f.context && f.context.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (f.domain && f.domain.toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (!matchesSearch) return false;

        // Quick Filters
        if (quickFilters.only200) {
            if (!f.context?.includes('"status":200')) return false;
        }
        if (quickFilters.onlySecrets) {
            if (f.type !== 'secret') return false;
        }
        if (quickFilters.onlyParams) {
            if (f.type !== 'interesting_url') return false;
        }

        return true;
    });

    const groupedFindings = filteredFindings.reduce((acc, finding) => {
        const d = finding.domain || project?.target || 'Unknown Target';
        if (!acc[d]) acc[d] = [];
        acc[d].push(finding);
        return acc;
    }, {});

    if (!project) return <div style={{ padding: '24px' }}>Loading project details...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            {/* ... header code ... */}
            <div className="header" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="glass-btn" onClick={() => navigate('/')} style={{ padding: '8px' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="page-title">{project.name}</h1>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{project.target}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <button className="glass-btn" onClick={handleDeleteProject} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger-color)', borderColor: 'var(--panel-border)' }} title="Delete Project">
                        <Trash2 size={18} /> Delete
                    </button>
                    <button className="glass-btn" onClick={exportToCsv} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', borderColor: 'var(--panel-border)' }}>
                        <Download size={18} /> Export (CSV)
                    </button>
                    
                    {!scanActive ? (
                        <button className="glass-btn primary" onClick={handleStartScan} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Play size={18} /> Launch Scan
                        </button>
                    ) : (
                        <button className="glass-btn danger" onClick={handleStopScan} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--danger-color)', color: '#fff' }}>
                            <Square size={18} fill="currentColor" /> Stop Scan
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs & Search & Quick Filters */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="glass-panel" style={{ display: 'flex', padding: '8px', gap: '8px', width: 'fit-content' }}>
                    <button 
                        className={`glass-btn ${activeTab === 'logs' ? 'primary' : ''}`} 
                        onClick={() => setActiveTab('logs')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: activeTab === 'logs' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'logs' ? '#000' : 'var(--text-main)' }}
                    >
                        <List size={18} /> Live Logs
                    </button>
                    <button 
                        className={`glass-btn ${activeTab === 'results' ? 'primary' : ''}`} 
                        onClick={() => setActiveTab('results')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: activeTab === 'results' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'results' ? '#000' : 'var(--text-main)' }}
                    >
                        <TableProperties size={18} /> Discovery Results
                    </button>
                    <button 
                        className={`glass-btn ${activeTab === 'map' ? 'primary' : ''}`} 
                        onClick={() => setActiveTab('map')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: activeTab === 'map' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'map' ? '#000' : 'var(--text-main)' }}
                    >
                        <Network size={18} /> Target Map
                    </button>
                </div>

                {activeTab === 'results' && (
                    <>
                        <div className="glass-panel" style={{ flex: 1, minWidth: '300px', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                             <input
                                type="text"
                                className="glass-input"
                                style={{ padding: '6px 12px', flex: 1, margin: 0 }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search technology, status, endpoint or secret..."
                            />
                        </div>
                        <div className="glass-panel" style={{ display: 'flex', padding: '8px', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, paddingLeft: '8px' }}>QUICK FILTERS:</span>
                            <button 
                                className="glass-btn" 
                                onClick={() => setQuickFilters(prev => ({ ...prev, only200: !prev.only200 }))}
                                style={{ 
                                    fontSize: '0.75rem', padding: '4px 12px', 
                                    borderColor: quickFilters.only200 ? '#00ff9d' : 'var(--panel-border)',
                                    color: quickFilters.only200 ? '#00ff9d' : 'var(--text-muted)',
                                    background: quickFilters.only200 ? 'rgba(0,255,157,0.05)' : 'transparent'
                                }}
                            >
                                🟢 200 OK
                            </button>
                            <button 
                                className="glass-btn" 
                                onClick={() => setQuickFilters(prev => ({ ...prev, onlySecrets: !prev.onlySecrets }))}
                                style={{ 
                                    fontSize: '0.75rem', padding: '4px 12px', 
                                    borderColor: quickFilters.onlySecrets ? '#ff4d4d' : 'var(--panel-border)',
                                    color: quickFilters.onlySecrets ? '#ff4d4d' : 'var(--text-muted)',
                                    background: quickFilters.onlySecrets ? 'rgba(255,77,77,0.05)' : 'transparent'
                                }}
                            >
                                🔑 JS Secrets
                            </button>
                            <button 
                                className="glass-btn" 
                                onClick={() => setQuickFilters(prev => ({ ...prev, onlyParams: !prev.onlyParams }))}
                                style={{ 
                                    fontSize: '0.75rem', padding: '4px 12px', 
                                    borderColor: quickFilters.onlyParams ? '#ffd11a' : 'var(--panel-border)',
                                    color: quickFilters.onlyParams ? '#ffd11a' : 'var(--text-muted)',
                                    background: quickFilters.onlyParams ? 'rgba(255,209,26,0.05)' : 'transparent'
                                }}
                            >
                                🔗 Sensitive Params
                            </button>
                        </div>
                    </>
                )}

                {activeTab === 'logs' && (
                    <div className="glass-panel" style={{ flex: 1, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom Header:</span>
                        <input
                            type="text"
                            className="glass-input"
                            style={{ padding: '6px 12px', flex: 1, margin: 0 }}
                            value={customHeader}
                            onChange={(e) => setCustomHeader(e.target.value)}
                            disabled={scanActive}
                            placeholder="e.g. X-Bug-Bounty: hacker123"
                        />
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
                {activeTab === 'logs' ? (
                    <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Terminal size={18} color="var(--accent-color)" />
                                <span style={{ fontWeight: 500 }}>Live Output</span>
                            </div>
                            {scanActive && <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', animation: 'blink 1.5s infinite' }}>● SCANNING IN PROGRESS</div>}
                        </div>
                        <div
                            ref={terminalRef}
                            style={{
                                flex: 1,
                                padding: '16px',
                                overflowY: 'auto',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.85rem',
                                color: '#00ff9d',
                                background: 'rgba(0,0,0,0.5)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}
                        >
                            {logs.map((log, i) => {
                                const isError = log.includes('[ERR]') || log.toLowerCase().includes('error');
                                return <div key={i} style={{ color: isError ? 'var(--danger-color)' : 'inherit' }}>{log}</div>;
                            })}
                        </div>
                    </div>
                ) : activeTab === 'results' ? (
                    <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <h2 style={{ paddingBottom: '16px', borderBottom: '1px solid var(--panel-border)' }}>Detailed Discovery Results</h2>
                        
                        {Object.keys(groupedFindings).length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>{searchTerm ? 'No results matching your search.' : 'No findings yet.'}</p>
                        ) : (
                            Object.entries(groupedFindings).map(([domain, fList]) => (
                                <div key={domain} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--panel-border)', position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <h3 
                                                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-color)', margin: 0, fontSize: '1.2rem', cursor: 'help' }}
                                                        onMouseEnter={() => setHoveredDomain(domain)}
                                                        onMouseLeave={() => setHoveredDomain(null)}
                                                    >
                                                        {domain}
                                                    </h3>
                                                    {/(dev|staging|test|qa|beta|old|internal)/i.test(domain) && (
                                                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255, 122, 0, 0.2)', color: '#ff7a00', border: '1px solid #ff7a00', borderRadius: '4px', fontWeight: 'bold' }}>
                                                            SMART TARGET
                                                        </span>
                                                    )}
                                                </div>
                                                {hoveredDomain === domain && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, zIndex: 100, 
                                                        marginTop: '12px', width: '320px', borderRadius: '12px', 
                                                        overflow: 'hidden', border: '2px solid var(--accent-color)',
                                                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)', background: '#000'
                                                    }}>
                                                        <img 
                                                            src={`${API_URL}/api/projects/${id}/screenshots/${domain}`} 
                                                            alt="Host Preview" 
                                                            style={{ width: '100%', display: 'block' }}
                                                            onError={(e) => e.target.style.display='none'}
                                                        />
                                                        <div style={{ padding: '8px', fontSize: '0.7rem', color: '#fff', background: 'rgba(0,255,157,0.2)', textAlign: 'center' }}>
                                                            Visual Recon: {domain}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <button className="glass-btn" style={{ padding: '4px', borderRadius: '4px' }} title="Individual Scan" onClick={() => handleIndividualScan(domain)}>
                                                <Play size={14} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                                            {fList.some(f => f.cdn_waf) && <span style={{ padding: '4px 8px', background: 'var(--panel-bg)', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>CDN/WAF: {fList.find(f => f.cdn_waf)?.cdn_waf}</span>}
                                            {fList.some(f => f.is_wordpress) && <span style={{ padding: '4px 8px', background: 'rgba(0, 115, 170, 0.2)', color: '#00d0ff', borderRadius: '4px', border: '1px solid rgba(0, 115, 170, 0.5)' }}>WordPress</span>}
                                        </div>
                                    </div>

                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
                                                    <th style={{ padding: '12px' }}>Severity</th>
                                                    <th style={{ padding: '12px' }}>Type</th>
                                                    <th style={{ padding: '12px' }}>Value</th>
                                                    <th style={{ padding: '12px' }}>Context Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fList.map((f, i) => {
                                                    const s = getSeverityStyles(f.severity);
                                                    return (
                                                        <tr key={f.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} className="hover-row">
                                                            <td style={{ padding: '12px' }}>
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', 
                                                                    padding: '2px 8px', 
                                                                    borderRadius: '100px', 
                                                                    fontWeight: 'bold',
                                                                    background: s.bg,
                                                                    color: s.color,
                                                                    border: `1px solid ${s.border}`
                                                                }}>
                                                                    {f.severity?.toUpperCase() || 'INFO'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '12px', fontWeight: 500 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    {f.type?.toUpperCase() || 'UNKNOWN'}
                                                                    {(f.type === 'secret' || f.type === 'js_monitoring') && (
                                                                        <button 
                                                                            className="glass-btn" 
                                                                            style={{ padding: '2px', borderRadius: '4px' }} 
                                                                            title="View Source Code"
                                                                            onClick={() => handleViewCode(f)}
                                                                        >
                                                                            <Eye size={12} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{f.value}</td>
                                                            <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                                {f.contextObj && typeof f.contextObj === 'object' ? Object.entries(f.contextObj).map(([k, v]) => (
                                                                    <span key={k} style={{ display: 'inline-block', marginRight: '16px' }}>
                                                                        <strong style={{ color: 'var(--text-main)', marginRight: '4px' }}>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : v}
                                                                    </span>
                                                                )) : (f.context || '')}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="glass-panel" style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
                            <Network size={24} color="var(--accent-color)" />
                            <h2 style={{ margin: 0 }}>Infrastructure Target Map</h2>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
                            {/* Simple Relationship Graph Representation */}
                            {Object.entries(
                                findings.reduce((acc, f) => {
                                    const ip = f.contextObj?.ip || 'Undiscovered IP';
                                    if (!acc[ip]) acc[ip] = { domains: new Set(), wafs: new Set() };
                                    if (f.domain) acc[ip].domains.add(f.domain);
                                    if (f.cdn_waf) acc[ip].wafs.add(f.cdn_waf);
                                    return acc;
                                }, {})
                            ).map(([ip, data]) => {
                                const isOrigin = ip !== 'Undiscovered IP' && [...data.wafs].length === 0;
                                return (
                                    <div key={ip} className="glass-panel" style={{ 
                                        padding: '20px', minWidth: '280px', flex: 1, 
                                        borderLeft: `4px solid ${isOrigin ? '#ff4d00' : 'var(--accent-color)'}`,
                                        position: 'relative',
                                        background: isOrigin ? 'rgba(255, 77, 0, 0.05)' : 'rgba(255,255,255,0.03)'
                                    }}>
                                        {isOrigin && (
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#ff4d00', fontSize: '0.65rem', fontWeight: 'bold' }}>
                                                <Flame size={14} /> ORIGIN SERVER
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <Database size={18} color={isOrigin ? '#ff4d00' : 'var(--accent-color)'} />
                                            <strong style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', color: isOrigin ? '#ff4d00' : 'inherit' }}>{ip}</strong>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Connected Assets:</span>
                                            {[...data.domains].map(d => (
                                                <div key={d} style={{ fontSize: '0.9rem', padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                                                    {d}
                                                    {[...data.wafs].length > 0 && <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#00d0ff' }}>({[...data.wafs].join(', ')})</span>}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <button 
                                            className="glass-btn" 
                                            style={{ marginTop: '16px', width: '100%', padding: '6px', fontSize: '0.75rem', borderColor: isOrigin ? '#ff4d00' : 'var(--panel-border)' }}
                                            onClick={() => handleScanIP(ip)}
                                        >
                                            SCAN INFRASTRUCTURE (IP)
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Quick Results Summary Sidebar */}
                <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Cpu size={24} color="var(--accent-color)" />
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.subdomains}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Subdomains Found</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Network size={24} color="var(--accent-color)" />
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.ports}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Open Ports</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderColor: stats.vulns > 0 ? 'rgba(255, 0, 0, 0.4)' : 'var(--panel-border)' }}>
                        <ShieldAlert size={24} color={stats.vulns > 0 ? 'var(--danger-color)' : 'var(--text-muted)'} />
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.vulns > 0 ? 'var(--danger-color)' : 'inherit' }}>{stats.vulns}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vulns & Secrets</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Code Viewer Modal */}
            {viewCode && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                    padding: '40px'
                }}>
                    <div className="glass-panel" style={{ 
                        width: '100%', maxWidth: '1200px', height: '100%', 
                        display: 'flex', flexDirection: 'column', 
                        border: '1px solid var(--accent-color)',
                        boxShadow: '0 0 30px rgba(0, 255, 157, 0.1)'
                    }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Terminal size={18} color="var(--accent-color)" />
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{viewCode.path}</span>
                            </div>
                            <button className="glass-btn" onClick={() => setViewCode(null)} style={{ padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '24px', background: '#050505' }}>
                            <pre style={{ margin: 0, color: '#e0e0e0', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                                {viewCode.content}
                            </pre>
                        </div>
                        <div style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.02)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Showing source code for finding type: <strong>{viewCode.finding.type}</strong>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
        </div>
    );
}
