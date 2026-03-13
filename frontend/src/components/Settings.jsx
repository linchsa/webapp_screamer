import React, { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Database, Moon, Sun, Lock } from 'lucide-react';

const API_URL = 'http://localhost:3000';

export default function Settings() {
    const [settings, setSettings] = useState({
        theme: 'dark',
        scan_profile: 'normal',
        rate_limit: 10,
        wpscan_key: ''
    });
    
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${API_URL}/api/settings`);
                const data = await res.json();
                if (data && !data.error) {
                    setSettings(data);
                    applyTheme(data.theme);
                }
            } catch (err) {
                console.error("Failed to load settings", err);
            }
        };
        fetchSettings();
    }, []);

    const applyTheme = (theme) => {
        if (theme === 'light') {
            document.documentElement.style.setProperty('--bg-base', '#ffffff');
            document.documentElement.style.setProperty('--panel-bg', 'rgba(240, 240, 240, 0.7)');
            document.documentElement.style.setProperty('--text-main', '#1a1a1a');
            document.documentElement.style.setProperty('--text-muted', '#666666');
            document.documentElement.style.setProperty('--panel-border', 'rgba(0,0,0,0.1)');
        } else {
            // Restore dark (default)
            document.documentElement.style.setProperty('--bg-base', '#0a0a0c');
            document.documentElement.style.setProperty('--panel-bg', 'rgba(20, 20, 24, 0.7)');
            document.documentElement.style.setProperty('--text-main', '#e0e0e0');
            document.documentElement.style.setProperty('--text-muted', '#a0a0a5');
            document.documentElement.style.setProperty('--panel-border', 'rgba(255, 255, 255, 0.05)');
        }
    };

    const handleSave = async () => {
        try {
            await fetch(`${API_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            applyTheme(settings.theme);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error("Failed to save settings", err);
        }
    };

    return (
        <div className="dashboard-container" style={{ position: 'relative', height: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <div className="header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Global configurations, API keys, and app preferences.</p>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <SettingsIcon size={20} color="var(--accent-color)" />
                        <h2 style={{ fontSize: '1.2rem' }}>Appearance</h2>
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Theme</label>
                        <select 
                            className="glass-input" 
                            value={settings.theme} 
                            onChange={(e) => setSettings({...settings, theme: e.target.value})}
                        >
                            <option value="dark">Screamer Dark (Default)</option>
                            <option value="light">Screamer Light</option>
                        </select>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <Database size={20} color="var(--accent-color)" />
                        <h2 style={{ fontSize: '1.2rem' }}>Scanner Configuration</h2>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Scan Intensity (Intelligence Depth)</label>
                            <select 
                                className="glass-input" 
                                value={settings.scan_profile} 
                                onChange={(e) => setSettings({...settings, scan_profile: e.target.value})}
                            >
                                <option value="quick">Quick Win (Panels, Takeovers, Sensitive Configs)</option>
                                <option value="standard">Standard (Balanced Recon & Vulns)</option>
                                <option value="full">Full Recon (Aggressive, Extensive Discovery)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Global Rate Limit (Requests / Second)</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="1000"
                                className="glass-input" 
                                value={settings.rate_limit} 
                                onChange={(e) => setSettings({...settings, rate_limit: parseInt(e.target.value)})}
                            />
                            <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>Limits max requests globally to respect bug bounty rules.</small>
                        </div>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <Lock size={20} color="var(--accent-color)" />
                        <h2 style={{ fontSize: '1.2rem' }}>API Keys & Integrations</h2>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>WPScan API Token</label>
                        <input 
                            type="password" 
                            className="glass-input" 
                            placeholder="Entet WPScan API Token to fetch CVEs"
                            value={settings.wpscan_key} 
                            onChange={(e) => setSettings({...settings, wpscan_key: e.target.value})}
                        />
                        <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>Required if you want comprehensive WordPress plugin and core vulnerability analysis.</small>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="glass-btn primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Save size={18} /> Save Settings
                    </button>
                    {saved && <span style={{ color: '#00ff9d', fontFamily: 'var(--font-mono)' }}>✓ Saved Successfully</span>}
                </div>
            </div>
        </div>
    );
}
