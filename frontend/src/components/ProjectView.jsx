import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Terminal, Network, ShieldAlert, Cpu, Download } from 'lucide-react';
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

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    const fetchProjectData = async () => {
        try {
            const pRes = await fetch(`${API_URL}/api/projects/${id}`);
            const pData = await pRes.json();
            setProject(pData);
            if (!customHeader && pData.header) {
                setCustomHeader(pData.header);
            }

            const fRes = await fetch(`${API_URL}/api/projects/${id}/findings`);
            const fData = await fRes.json();
            setFindings(fData);
            
            // Calculate stats
            let sub = 0, port = 0, vuln = 0;
            fData.forEach(f => {
                if (f.type === 'subdomain') sub++;
                else if (f.type === 'port') port++;
                else vuln++;
            });
            setStats({ subdomains: sub, ports: port, vulns: vuln });
        } catch (err) {
            console.error('Error fetching project data', err);
        }
    };

    const fetchActiveStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/api/scans/active`);
            const activeScans = await res.json();
            const isScanning = activeScans.some(s => s.projectId === id || s.projectId === parseInt(id));
            setScanActive(isScanning);
            if (isScanning) {
                setLogs(prev => [...prev, '[SYSTEM] Reattached to running scan...']);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleStartScan = () => {
        setScanActive(true);
        // Start via socket
        socketRef.current.emit('start-scan', {
            projectId: parseInt(id),
            projectName: project?.name,
            target: project?.target,
            header: customHeader
        });
    };

    const handleStopScan = () => {
        setScanActive(false);
        socketRef.current.emit('stop-scan', { projectId: parseInt(id) });
        setLogs((prev) => [...prev, '[SYSTEM] Scan stopped by user.']);
        fetchProjectData();
    };

    const exportToCsv = () => {
        if (findings.length === 0) {
            alert("No findings to export.");
            return;
        }
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Time,Type,Value\n";
        findings.forEach(row => {
            csvContent += `"${row.timestamp}","${row.type}","${row.value}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${project?.name?.replace(/\s+/g, '_') || 'project'}_findings.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!project) return <div style={{ padding: '24px' }}>Loading project details...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
            <div className="header" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="glass-btn" onClick={() => navigate('/')} style={{ padding: '8px' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="page-title">{project.name}</h1>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
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

            <div className="glass-panel" style={{ padding: '24px', borderTop: `4px solid ${project.color || 'var(--accent-color)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ color: 'var(--text-muted)' }}>Scan Configuration</h3>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-color)', fontWeight: 'bold' }}>TARGET: {project.target}</span>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Bug Bounty Custom HTTP Header</label>
                    <input
                        type="text"
                        className="glass-input"
                        value={customHeader}
                        onChange={(e) => setCustomHeader(e.target.value)}
                        disabled={scanActive}
                        placeholder="e.g. X-Bug-Bounty: hacker123"
                    />
                </div>
            </div>

            <div style={{ display: 'flex', gap: '32px', flex: 1, minHeight: 0 }}>
                {/* Terminal logs */}
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
                            return (
                                <div key={i} style={{ color: isError ? 'var(--danger-color)' : 'inherit' }}>
                                    {log}
                                </div>
                            );
                        })}
                        {scanActive && (
                            <div className="cursor-blink" style={{ animation: 'blink 1s step-end infinite' }}>_</div>
                        )}
                    </div>
                </div>

                {/* Quick Results Summary */}
                <div style={{ width: '350px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Scan Insights</h3>

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
                    
                    {findings.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                             <h4 style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>Latest Discoveries</h4>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                 {findings.slice(0, 5).map(f => (
                                     <div key={f.id} className="glass-panel" style={{ padding: '12px', fontSize: '0.85rem' }}>
                                         <span style={{ color: 'var(--accent-color)', marginRight: '8px', fontWeight: 'bold' }}>[{f.type.toUpperCase()}]</span>
                                         <span style={{ fontFamily: 'var(--font-mono)' }}>{f.value}</span>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
        </div>
    );
}
