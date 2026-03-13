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
        methods: ["GET", "POST"]
    }
});

// Setup SQLite Map
const dbPath = path.join(__dirname, '..', 'app_data', 'database.sqlite');
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
    type TEXT,
    value TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id)
  )`);
});

// Active Scans Tracking
const activeScans = new Map();

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

        activeScans.set(projectId, {
            projectId,
            projectName: projectName || `Project #${projectId}`,
            target,
            startTime: Date.now(),
            findingsSummary: { subdomains: 0, ports: 0, vulnerabilities: 0 }
        });

        io.emit('scan-log', { projectId, log: `[SYSTEM] Initializing scan pipeline for ${target}...` });

        // In actual deployment, the tools run inside Docker. Here we spawn a shell script.
        const scannerProcess = spawn('bash', ['./scripts/scanner.sh', target, header]);

        // Mock finding generation for demo purposes
        const mockInterval = setInterval(() => {
            const types = ['subdomain', 'port', 'secret'];
            const type = types[Math.floor(Math.random() * types.length)];
            const value = type === 'port' ? `${Math.floor(Math.random() * 8000) + 80}` : type === 'subdomain' ? `api${Math.floor(Math.random() * 100)}.target.com` : `Token_XYZ_${Math.floor(Math.random() * 9999)}`;
            
            db.run('INSERT INTO findings (project_id, type, value) VALUES (?, ?, ?)', [projectId, type, value], function(err) {
                if (!err) {
                    io.emit('scan-log', { projectId, log: `[SYSTEM] Found ${type}: ${value}` });
                }
            });
        }, 4000);

        scannerProcess.stdout.on('data', (data) => {
            io.emit('scan-log', { projectId, log: data.toString() });
        });

        scannerProcess.stderr.on('data', (data) => {
            io.emit('scan-log', { projectId, log: `[ERR] ${data.toString()}` });
        });

        scannerProcess.on('close', (code) => {
            clearInterval(mockInterval);
            activeScans.delete(projectId);
            io.emit('scan-log', { projectId, log: `[SYSTEM] Scan finished with exit code ${code}` });
            io.emit('scan-finished', { projectId });
        });
        
        socket.on('stop-scan', (stopData) => {
            if (stopData.projectId === projectId) {
                clearInterval(mockInterval);
                scannerProcess.kill('SIGINT');
                activeScans.delete(projectId);
            }
        });
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
    const scansList = Array.from(activeScans.values());
    res.json(scansList);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend orchestrator listening on port ${PORT}`);
});
