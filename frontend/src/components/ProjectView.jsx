import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Terminal, Network, ShieldAlert, Cpu, Download, Trash2, List, TableProperties } from 'lucide-react';
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

    // Group findings by domain with filter
    const filteredFindings = findings.filter(f => 
        searchTerm === '' || 
        f.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.context && f.context.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (f.domain && f.domain.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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

            {/* Tabs & Search */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
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
                </div>

                {activeTab === 'results' && (
                    <div className="glass-panel" style={{ flex: 1, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                         <input
                            type="text"
                            className="glass-input"
                            style={{ padding: '6px 12px', flex: 1, margin: 0 }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search technology, status, endpoint or secret..."
                        />
                    </div>
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
                ) : (
                    <div className="glass-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <h2 style={{ paddingBottom: '16px', borderBottom: '1px solid var(--panel-border)' }}>Detailed Discovery Results</h2>
                        
                        {Object.keys(groupedFindings).length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>{searchTerm ? 'No results matching your search.' : 'No findings yet.'}</p>
                        ) : (
                            Object.entries(groupedFindings).map(([domain, fList]) => (
                                <div key={domain} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <h3 style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-color)', margin: 0, fontSize: '1.2rem' }}>{domain}</h3>
                                            <button className="glass-btn" style={{ padding: '4px', borderRadius: '4px' }} title="Individual Scan" onClick={() => handleIndividualScan(domain)}>
                                                <Play size={14} />
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                                            {fList.some(f => f.cdn_waf) && <span style={{ padding: '4px 8px', background: 'var(--panel-bg)', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>CDN/WAF: {fList.find(f => f.cdn_waf)?.cdn_waf}</span>}
                                            {fList.some(f => f.is_wordpress) && <span style={{ padding: '4px 8px', background: 'rgba(0, 115, 170, 0.2)', color: '#00d0ff', borderRadius: '4px', border: '1px solid rgba(0, 115, 170, 0.5)' }}>WordPress Detection</span>}
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
                                                            <td style={{ padding: '12px', fontWeight: 500 }}>{f.type?.toUpperCase() || 'UNKNOWN'}</td>
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

            <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
        </div>
    );
}
