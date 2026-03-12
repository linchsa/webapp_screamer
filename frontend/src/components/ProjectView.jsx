import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Terminal, Network, ShieldAlert, Cpu } from 'lucide-react';

export default function ProjectView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [customHeader, setCustomHeader] = useState('X-Bug-Bounty: hacker123');
    const [scanActive, setScanActive] = useState(false);
    const [logs, setLogs] = useState(['Initializing Bug Bounty Recon Pipeline...', 'Waiting to start...']);

    const terminalRef = useRef(null);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    const handleStartScan = () => {
        setScanActive(true);
        setLogs((prev) => [...prev, `[SYSTEM] Started scan for project ${id} with header: ${customHeader}`]);
        // In actual implementation, emit Socket.io event here

        // Mock incoming logs
        setTimeout(() => {
            setLogs((prev) => [...prev, '[SUBFINDER] Found api.example.com', '[SUBFINDER] Found dev.example.com']);
        }, 1500);

        setTimeout(() => {
            setLogs((prev) => [...prev, '[NAABU] Open ports on api.example.com: 80, 443, 8080']);
        }, 3000);
    };

    const handleStopScan = () => {
        setScanActive(false);
        setLogs((prev) => [...prev, '[SYSTEM] Scan stopped by user.']);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
            <div className="header" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="glass-btn" onClick={() => navigate('/')} style={{ padding: '8px' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="page-title">Project Details: {id === '1' ? 'Example Bug Bounty' : 'Tesla Program'}</h1>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    {!scanActive ? (
                        <button className="glass-btn primary" onClick={handleStartScan} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Play size={18} /> Launch Scan
                        </button>
                    ) : (
                        <button className="glass-btn danger" onClick={handleStopScan} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Square size={18} fill="currentColor" /> Stop Scan
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>Scan Configuration</h3>
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
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Terminal size={18} color="var(--accent-color)" />
                        <span style={{ fontWeight: 500 }}>Live Output</span>
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
                        {logs.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
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
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>24</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>New Subdomains</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Network size={24} color="var(--accent-color)" />
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>12</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Open Ports</div>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderColor: 'rgba(255, 51, 102, 0.3)' }}>
                        <ShieldAlert size={24} color="var(--danger-color)" />
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--danger-color)' }}>1</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Secret Token Found (JS Map)</div>
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
