import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, ShieldAlert, Cpu, X, Activity } from 'lucide-react';

const API_URL = 'http://localhost:3000';

export default function Dashboard() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form state
    const [newProject, setNewProject] = useState({
        name: '',
        target: '',
        header: 'X-Bug-Bounty: hacker123',
        color: '#ff003c',
        options: {
            subdomains: true,
            ports: true,
            vulnerabilities: true
        }
    });

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API_URL}/api/projects`);
            const data = await res.json();
            setProjects(data);
        } catch (err) {
            console.error('Error fetching projects:', err);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        try {
            await fetch(`${API_URL}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newProject)
            });
            setIsModalOpen(false);
            setNewProject({ ...newProject, name: '', target: '' });
            fetchProjects();
        } catch (err) {
            console.error('Error creating project:', err);
        }
    };

    const handleOptionChange = (option) => {
        setNewProject({
            ...newProject,
            options: { ...newProject.options, [option]: !newProject.options[option] }
        });
    };

    return (
        <div className="dashboard-container" style={{ position: 'relative', height: '100%' }}>
            <div className="header">
                <div>
                    <h1 className="page-title">Bug Bounty Projects</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Manage and monitor your automated recon scans.</p>
                </div>
                <button className="glass-btn primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} /> New Project
                </button>
            </div>

            <div className="projects-grid">
                {projects.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No projects found. Create one to get started.</p>}
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className="project-card glass-panel"
                        onClick={() => navigate(`/project/${p.id}`)}
                        style={{ cursor: 'pointer', borderTop: `4px solid ${p.color || 'var(--accent-color)'}` }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 className="project-title">{p.name}</h2>
                            <Globe size={20} color={p.color || "var(--accent-color)"} />
                        </div>

                        <span className="project-target" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.target}</span>

                        <div className="project-stats" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <div className="stat">
                                <span className="stat-label">Total Findings</span>
                                <span className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={16} color="var(--accent-color)" /> {p.findingsCount || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 100
                }}>
                    <div className="glass-panel" style={{ width: '500px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Create New Project</h2>
                            <button className="glass-btn" style={{ padding: '8px' }} onClick={() => setIsModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Project Name</label>
                                <input required type="text" className="glass-input" value={newProject.name} onChange={(e) => setNewProject({...newProject, name: e.target.value})} placeholder="e.g. Tesla Bug Bounty" />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Target (Wildcard/Domain)</label>
                                <input required type="text" className="glass-input" value={newProject.target} onChange={(e) => setNewProject({...newProject, target: e.target.value})} placeholder="e.g. *.tesla.com" />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Custom HTTP Header</label>
                                <input type="text" className="glass-input" value={newProject.header} onChange={(e) => setNewProject({...newProject, header: e.target.value})} placeholder="Header needed for authorization" />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Project Accent Color</label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input type="color" value={newProject.color} onChange={(e) => setNewProject({...newProject, color: e.target.value})} style={{ width: '40px', height: '40px', background: 'transparent', border: 'none', cursor: 'pointer' }} />
                                        <span style={{ fontFamily: 'var(--font-mono)' }}>{newProject.color}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Scan Options</label>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={newProject.options.subdomains} onChange={() => handleOptionChange('subdomains')} />
                                        Find Subdomains
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={newProject.options.ports} onChange={() => handleOptionChange('ports')} />
                                        Port Scan
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={newProject.options.vulnerabilities} onChange={() => handleOptionChange('vulnerabilities')} />
                                        Vuln/Secret Scan
                                    </label>
                                </div>
                            </div>

                            <button type="submit" className="glass-btn primary" style={{ marginTop: '16px' }}>Create Project</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
