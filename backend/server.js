const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
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

// Setup PostgreSQL Pool
const dbRepo = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'screamer',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function initDb() {
    try {
        await dbRepo.query(`CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT,
            target TEXT,
            header TEXT,
            color TEXT,
            options TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await dbRepo.query(`CREATE TABLE IF NOT EXISTS findings (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            domain TEXT,
            type TEXT,
            value TEXT,
            context TEXT,
            severity TEXT DEFAULT 'info',
            cdn_waf TEXT,
            is_wordpress BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await dbRepo.query(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT DEFAULT 'dark',
            scan_profile TEXT DEFAULT 'normal',
            rate_limit INTEGER DEFAULT 10,
            wpscan_key TEXT DEFAULT ''
        )`);
        // Ensure default settings exist
        await dbRepo.query(`INSERT INTO settings (id, theme, scan_profile, rate_limit, wpscan_key) 
                            VALUES (1, 'dark', 'normal', 10, '') 
                            ON CONFLICT (id) DO NOTHING`);
        console.log("[SYSTEM] PostgreSQL Database Initialized.");
    } catch (err) {
        console.error("[ERR] DB Init Error:", err);
    }
}
initDb();

// Active Scans Tracking
const activeScans = new Map();

// Helper to generate advanced mocks
const generateMockFinding = (projectId, baseTarget) => {
    const types = ['subdomain', 'port', 'secret', 'endpoint', 'wp_vuln', 'takeover', 'interesting_url'];
    const type = types[Math.floor(Math.random() * types.length)];
    const sdPrefixes = ['api', 'dev', 'staging', 'admin', 'test'];
    const sd = `${sdPrefixes[Math.floor(Math.random() * sdPrefixes.length)]}${Math.floor(Math.random() * 100)}.${baseTarget.replace('*.', '')}`;
    const cdns = [null, 'Cloudflare', 'Akamai', 'AWS CloudFront'];
    const cdn = Math.random() > 0.6 ? cdns[Math.floor(Math.random() * cdns.length)] : null;
    const isWp = Math.random() > 0.8;

    let value = '';
    let context = {};
    let severity = 'info';

    switch (type) {
        case 'port':
            value = `${Math.floor(Math.random() * 8000) + 80}`;
            context = { protocol: value == 443 ? 'https' : 'http', service: value == 22 ? 'ssh' : 'web' };
            severity = 'low';
            break;
        case 'subdomain':
            value = sd;
            context = { ip: `104.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` };
            severity = 'info';
            break;
        case 'secret':
            value = `AKIA${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
            context = { key_type: 'AWS Access Key', file: 'config/aws.yml', line: 42 };
            severity = 'critical';
            break;
        case 'endpoint':
            value = `/api/v1/users/${Math.floor(Math.random() * 9999)}`;
            context = { method: 'GET', status: 200, auth_required: false };
            severity = 'medium';
            break;
        case 'wp_vuln':
            value = `CVE-2023-${Math.floor(Math.random() * 9999)}`;
            context = { plugin: 'elementor', cvss: 8.5, description: 'Unauthenticated RCE via arbitrary file upload.' };
            severity = 'high';
            break;
        case 'takeover':
            value = sd;
            context = { service: 'AWS S3', status: 'vulnerable', proof: 'NoSuchBucket' };
            severity = 'critical';
            break;
        case 'interesting_url':
            value = `https://${sd}/redirect?url=http://evil.com`;
            context = { param: 'url', pattern: 'redirect' };
            severity = 'medium';
            break;
    }

    return { type, value, domain: sd, context: JSON.stringify(context), severity, cdn_waf: cdn, is_wordpress: isWp };
};

// ... socket events ...
io.on('connection', (socket) => {
    socket.on('start-scan', (data) => {
        const { projectId, target, header, projectName } = data;
        if (activeScans.has(projectId)) {
            socket.emit('scan-log', { projectId, log: '[SYSTEM] Scan is already running for this project.' });
            return;
        }

        const projectDir = path.join(__dirname, '..', 'app_data', 'projects', `${target.replace('*', 'all')}-${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        dbRepo.query('SELECT wpscan_key, scan_profile FROM settings WHERE id = 1').then(settingsRes => {
            const settings = settingsRes.rows[0];
            const env = { ...process.env, WPSCAN_API_TOKEN: settings?.wpscan_key || '' };
            const scannerProcess = spawn('bash', ['./scripts/scanner.sh', target, header, projectDir], { env });

            const mockInterval = setInterval(() => {
                const f = generateMockFinding(projectId, target);
                dbRepo.query('INSERT INTO findings (project_id, domain, type, value, context, severity, cdn_waf, is_wordpress) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', 
                [projectId, f.domain, f.type, f.value, f.context, f.severity, f.cdn_waf, f.is_wordpress]).then(() => {
                    io.emit('scan-log', { projectId, log: `[SYSTEM] Found ${f.type} [${f.severity.toUpperCase()}]: ${f.value} on ${f.domain}` });
                });
            }, 3000);

            activeScans.set(projectId, {
                projectId,
                projectName: projectName || `Project #${projectId}`,
                target,
                startTime: Date.now(),
                projectDir,
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
app.get('/api/projects', async (req, res) => {
    try {
        const result = await dbRepo.query('SELECT * FROM projects');
        const rows = result.rows;
        
        const promises = rows.map(async row => {
            const countResult = await dbRepo.query('SELECT COUNT(*) as count FROM findings WHERE project_id = $1', [row.id]);
            return { 
                ...row, 
                findingsCount: parseInt(countResult.rows[0].count), 
                options: row.options ? JSON.parse(row.options) : {} 
            };
        });
        
        const results = await Promise.all(promises);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects/:id', async (req, res) => {
    try {
        const result = await dbRepo.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Project not found" });
        const row = result.rows[0];
        row.options = row.options ? JSON.parse(row.options) : {};
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        const result = await dbRepo.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
        res.json({ success: true, changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects/:id/findings', async (req, res) => {
    try {
        const result = await dbRepo.query('SELECT * FROM findings WHERE project_id = $1 ORDER BY timestamp DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name, target, header, color, options } = req.body;
    try {
        const result = await dbRepo.query(
            'INSERT INTO projects (name, target, header, color, options) VALUES ($1, $2, $3, $4, $5) RETURNING id', 
            [name, target, header, color, JSON.stringify(options || {})]
        );
        res.json({ id: result.rows[0].id, name, target, header, color, options });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

app.post('/api/scans/individual', async (req, res) => {
    const { projectId, domain, header } = req.body;
    console.log(`[SYSTEM] Starting INDIVIDUAL scan for ${domain} in project ${projectId}`);
    
    io.emit('scan-log', { projectId, log: `[SYSTEM] Individual deep recon started for: ${domain}` });
    
    setTimeout(async () => {
        const mockFinding = {
            project_id: projectId,
            domain: domain,
            type: 'port',
            value: '8080',
            context: JSON.stringify({ service: 'http-alt', banner: 'Jetty/9.4.z' }),
            severity: 'low'
        };
        try {
            await dbRepo.query(
                'INSERT INTO findings (project_id, domain, type, value, context, severity) VALUES ($1, $2, $3, $4, $5, $6)',
                [mockFinding.project_id, mockFinding.domain, mockFinding.type, mockFinding.value, mockFinding.context, mockFinding.severity]
            );
            io.emit('scan-log', { projectId, log: `[SYSTEM] Individual Scan on ${domain} found open port 8080.` });
        } catch (err) {
            console.error(err);
        }
    }, 5000);

    res.json({ success: true, message: `Individual scan queued for ${domain}` });
});

// Settings API
app.get('/api/settings', async (req, res) => {
    try {
        const result = await dbRepo.query('SELECT * FROM settings WHERE id = 1');
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const { theme, scan_profile, rate_limit, wpscan_key } = req.body;
    try {
        await dbRepo.query(
            'UPDATE settings SET theme = $1, scan_profile = $2, rate_limit = $3, wpscan_key = $4 WHERE id = 1', 
            [theme, scan_profile, rate_limit, wpscan_key]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend orchestrator listening on port ${PORT}`);
});
