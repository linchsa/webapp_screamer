const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "DELETE"]
    }
});

// Setup SQLite Map
const dbPath = path.join(__dirname, '..', 'app_data', 'database.sqlite');
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON;'); // Enable CASCADE
    db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    target TEXT,
    header TEXT,
    color TEXT,
    options TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
    db.run(`CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    domain TEXT,
    type TEXT,
    value TEXT,
    context TEXT,
    cdn_waf TEXT,
    is_wordpress BOOLEAN DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT DEFAULT 'dark',
    scan_profile TEXT DEFAULT 'normal',
    rate_limit INTEGER DEFAULT 10,
    wpscan_key TEXT DEFAULT ''
  )`);
    // Ensure default settings exist
    db.run(`INSERT OR IGNORE INTO settings (id, theme, scan_profile, rate_limit, wpscan_key) VALUES (1, 'dark', 'normal', 10, '')`);
});

// Active Scans Tracking
const activeScans = new Map();

// Helper to generate advanced mocks
const generateMockFinding = (projectId, baseTarget) => {
    const types = ['subdomain', 'port', 'secret', 'endpoint', 'wp_vuln'];
    const type = types[Math.floor(Math.random() * types.length)];
    const sdPrefixes = ['api', 'dev', 'staging', 'admin', 'test'];
    const sd = `${sdPrefixes[Math.floor(Math.random() * sdPrefixes.length)]}${Math.floor(Math.random() * 100)}.${baseTarget.replace('*.', '')}`;
    const cdns = [null, 'Cloudflare', 'Akamai', 'AWS CloudFront'];
    const cdn = Math.random() > 0.6 ? cdns[Math.floor(Math.random() * cdns.length)] : null;
    const isWp = Math.random() > 0.8;

    let value = '';
    let context = {};

    switch (type) {
        case 'port':
            value = `${Math.floor(Math.random() * 8000) + 80}`;
            context = { protocol: value == 443 ? 'https' : 'http', service: value == 22 ? 'ssh' : 'web' };
            break;
        case 'subdomain':
            value = sd;
            context = { ip: `104.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` };
            break;
        case 'secret':
            value = `AKIA${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
            context = { key_type: 'AWS Access Key', file: 'config/aws.yml', line: 42 };
            break;
        case 'endpoint':
            value = `/api/v1/users/${Math.floor(Math.random() * 9999)}`;
            context = { method: 'GET', status: 200, auth_required: false };
            break;
        case 'wp_vuln':
            value = `CVE-2023-${Math.floor(Math.random() * 9999)}`;
            context = { plugin: 'elementor', cvss: 8.5, description: 'Unauthenticated RCE via arbitrary file upload.' };
            break;
    }

    return { type, value, domain: sd, context: JSON.stringify(context), cdn_waf: cdn, is_wordpress: isWp };
};

// Socket.io for live streaming
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-scan', (data) => {
        const { projectId, target, header, projectName } = data;
        
        if (activeScans.has(projectId)) {
            socket.emit('scan-log', { projectId, log: '[SYSTEM] Scan is already running for this project.' });
            return;
        }
        
        console.log(`Starting scan for project ${projectId} on ${target} with header: ${header}`);

        io.emit('scan-log', { projectId, log: `[SYSTEM] Initializing scan pipeline for ${target}...` });

        // Retrieve settings before starting the scan
        db.get('SELECT wpscan_key, scan_profile FROM settings WHERE id = 1', [], (err, settings) => {
            if (err || !settings) {
                io.emit('scan-log', { projectId, log: `[SYSTEM] Could not load Global Settings. Using defaults.` });
            } else {
                if (settings.wpscan_key) {
                    io.emit('scan-log', { projectId, log: `[SYSTEM] WPScan API Key found. WordPress automated analysis enabled.` });
                }
                io.emit('scan-log', { projectId, log: `[SYSTEM] Scan Profile: ${settings.scan_profile.toUpperCase()}` });
            }

            // In actual deployment, the tools run inside Docker. Here we spawn a shell script.
            // We pass the API key via environment variable
            const env = { ...process.env, WPSCAN_API_TOKEN: settings?.wpscan_key || '' };
            const scannerProcess = spawn('bash', ['./scripts/scanner.sh', target, header], { env });

            // Mock finding generation for demo purposes
            const mockInterval = setInterval(() => {
                const f = generateMockFinding(projectId, target);
                
                db.run('INSERT INTO findings (project_id, domain, type, value, context, cdn_waf, is_wordpress) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [projectId, f.domain, f.type, f.value, f.context, f.cdn_waf, f.is_wordpress], function(err) {
                    if (!err) {
                        io.emit('scan-log', { projectId, log: `[SYSTEM] Found ${f.type}: ${f.value} on ${f.domain}` });
                    } else {
                        io.emit('scan-log', { projectId, log: `[ERR] DB Insert: ${err.message}` });
                    }
                });
            }, 3000);

            activeScans.set(projectId, {
                projectId,
                projectName: projectName || `Project #${projectId}`,
                target,
                startTime: Date.now(),
                findingsSummary: { subdomains: 0, ports: 0, vulnerabilities: 0 },
                scannerProcess,
                mockInterval
            });

            scannerProcess.stdout.on('data', (data) => {
                io.emit('scan-log', { projectId, log: data.toString() });
            });

            scannerProcess.stderr.on('data', (data) => {
                io.emit('scan-log', { projectId, log: `[ERR] ${data.toString()}` });
            });

            scannerProcess.on('close', (code) => {
                if (activeScans.has(projectId)) {
                    clearInterval(activeScans.get(projectId).mockInterval);
                    activeScans.delete(projectId);
                }
                io.emit('scan-log', { projectId, log: `[SYSTEM] Scan finished with exit code ${code}` });
                io.emit('scan-finished', { projectId });
            });
        });
    });

    socket.on('stop-scan', (stopData) => {
        const { projectId } = stopData;
        if (activeScans.has(projectId)) {
            const scan = activeScans.get(projectId);
            clearInterval(scan.mockInterval);
            scan.scannerProcess.kill('SIGINT');
            activeScans.delete(projectId);
            io.emit('scan-log', { projectId, log: `[SYSTEM] Scan stopped by user.` });
            io.emit('scan-finished', { projectId });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Basic API endpoints
app.get('/api/projects', (req, res) => {
    db.all('SELECT * FROM projects', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Count findings for each project to send initial 0 states
        const promises = rows.map(row => {
            return new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM findings WHERE project_id = ?', [row.id], (err, result) => {
                    if (err) resolve({ ...row, findingsCount: 0 });
                    else resolve({ ...row, findingsCount: result.count, options: row.options ? JSON.parse(row.options) : {} });
                });
            });
        });
        
        Promise.all(promises).then(results => res.json(results));
    });
});

app.get('/api/projects/:id', (req, res) => {
    db.get('SELECT * FROM projects WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Project not found" });
        row.options = row.options ? JSON.parse(row.options) : {};
        res.json(row);
    });
});

app.delete('/api/projects/:id', (req, res) => {
    db.run('DELETE FROM projects WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

app.get('/api/projects/:id/findings', (req, res) => {
    db.all('SELECT * FROM findings WHERE project_id = ? ORDER BY timestamp DESC', [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/projects', (req, res) => {
    const { name, target, header, color, options } = req.body;
    db.run('INSERT INTO projects (name, target, header, color, options) VALUES (?, ?, ?, ?, ?)', 
    [name, target, header, color, JSON.stringify(options || {})], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, target, header, color, options });
    });
});

app.get('/api/scans/active', (req, res) => {
    const scansList = Array.from(activeScans.values()).map(s => ({
        projectId: s.projectId,
        projectName: s.projectName,
        target: s.target,
        startTime: s.startTime,
        findingsSummary: s.findingsSummary
    }));
    res.json(scansList);
});

// Settings API
app.get('/api/settings', (req, res) => {
    db.get('SELECT * FROM settings WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.post('/api/settings', (req, res) => {
    const { theme, scan_profile, rate_limit, wpscan_key } = req.body;
    db.run('UPDATE settings SET theme = ?, scan_profile = ?, rate_limit = ?, wpscan_key = ? WHERE id = 1', 
    [theme, scan_profile, rate_limit, wpscan_key], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend orchestrator listening on port ${PORT}`);
});
