import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Target, Settings, Activity, ShieldAlert } from 'lucide-react';

export default function Sidebar() {
    return (
        <aside className="sidebar glass-panel">
            <div className="brand">
                <ShieldAlert size={28} className="brand-icon" />
                <span>Webapp Screamer</span>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <NavLink
                    to="/"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    end
                >
                    <LayoutDashboard size={20} />
                    <span>Dashboard</span>
                </NavLink>
                <NavLink
                    to="/targets"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                    <Target size={20} />
                    <span>Targets</span>
                </NavLink>
                <NavLink
                    to="/scans"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                    <Activity size={20} />
                    <span>Active Scans</span>
                </NavLink>
                <NavLink
                    to="/settings"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                    <Settings size={20} />
                    <span>Settings</span>
                </NavLink>
            </nav>
        </aside>
    );
}
