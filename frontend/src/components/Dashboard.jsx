import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, ShieldAlert, Cpu } from 'lucide-react';

// Mock data, eventually fetched from Node.js backend
const mockProjects = [
    { id: '1', name: 'Example Bug Bounty', wildcard: '*.example.com', subdomains: 42, vulns: 3 },
    { id: '2', name: 'Tesla Program', wildcard: '*.tesla.com', subdomains: 156, vulns: 0 },
];

export default function Dashboard() {
    const navigate = useNavigate();
    const [projects] = useState(mockProjects);

    return (
        <div className="dashboard-container">
            <div className="header">
                <div>
                    <h1 className="page-title">Bug Bounty Projects</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Manage and monitor your automated recon scans.</p>
                </div>
                <button className="glass-btn primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} /> New Project
                </button>
            </div>

            <div className="projects-grid">
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className="project-card glass-panel"
                        onClick={() => navigate(`/project/${p.id}`)}
                        style={{ cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 className="project-title">{p.name}</h2>
                            <Globe size={20} color="var(--accent-color)" />
                        </div>

                        <span className="project-target">{p.wildcard}</span>

                        <div className="project-stats">
                            <div className="stat">
                                <span className="stat-label">Subdomains</span>
                                <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Cpu size={16} /> {p.subdomains}
                                </span>
                            </div>
                            <div className="stat">
                                <span className="stat-label">Secrets/Vulns</span>
                                <span className="stat-value" style={{ color: p.vulns > 0 ? 'var(--danger-color)' : 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldAlert size={16} /> {p.vulns}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
