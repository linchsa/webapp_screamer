import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, Target, Cpu } from 'lucide-react';

const API_URL = 'http://localhost:3000';

export default function ActiveScans() {
    const navigate = useNavigate();
    const [scans, setScans] = useState([]);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        fetchActiveScans();
        
        // Poll for updates and update UI timers
        const interval = setInterval(() => {
            fetchActiveScans();
            setNow(Date.now());
        }, 3000);
        
        // Also update just the timer every second for smoothness
        const timerInterval = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        
        return () => {
            clearInterval(interval);
            clearInterval(timerInterval);
        };
    }, []);

    const fetchActiveScans = async () => {
        try {
            const res = await fetch(`${API_URL}/api/scans/active`);
            const data = await res.json();
            setScans(data);
        } catch (err) {
            console.error('Failed to fetch active scans', err);
        }
    };
    
    const formatDuration = (startTime) => {
        const diff = Math.floor((now - startTime) / 1000);
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    };

    return (
        <div className="dashboard-container">
            <div className="header">
                <div>
                    <h1 className="page-title">Active Scans</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Monitor recon pipelines currently executing in the background.</p>
                </div>
            </div>

            <div className="projects-grid">
                {scans.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={18} /> No scans currently running.
                    </div>
                )}
                
                {scans.map((scan) => (
                    <div
                        key={scan.projectId}
                        className="project-card glass-panel"
                        onClick={() => navigate(`/project/${scan.projectId}`)}
                        style={{ cursor: 'pointer', border: '1px solid var(--accent-color)' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 className="project-title">{scan.projectName}</h2>
                            <Activity size={20} color="var(--accent-color)" style={{ animation: 'blink 2s infinite' }} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                            <Target size={14} /> {scan.target}
                        </div>

                        <div className="project-stats" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <div className="stat">
                                <span className="stat-label">Elapsed Time</span>
                                <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00ff9d' }}>
                                    <Clock size={16} /> {formatDuration(scan.startTime)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <style>{`
                @keyframes blink { 50% { opacity: 0.3; } }
            `}</style>
        </div>
    );
}
