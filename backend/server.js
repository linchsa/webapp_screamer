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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Socket.io for live streaming
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-scan', (data) => {
        const { projectId, target, header } = data;
        console.log(`Starting scan for project ${projectId} on ${target} with header: ${header}`);

        io.emit('scan-log', { projectId, log: `[SYSTEM] Initializing scan pipeline for ${target}...` });

        // In actual deployment, the tools run inside Docker. Here we spawn a shell script.
        const scannerProcess = spawn('bash', ['./scripts/scanner.sh', target, header]);

        scannerProcess.stdout.on('data', (data) => {
            io.emit('scan-log', { projectId, log: data.toString() });
        });

        scannerProcess.stderr.on('data', (data) => {
            io.emit('scan-log', { projectId, log: `[ERR] ${data.toString()}` });
        });

        scannerProcess.on('close', (code) => {
            io.emit('scan-log', { projectId, log: `[SYSTEM] Scan finished with exit code ${code}` });
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
        res.json(rows);
    });
});

app.post('/api/projects', (req, res) => {
    const { name, target, header } = req.body;
    db.run('INSERT INTO projects (name, target, header) VALUES (?, ?, ?)', [name, target, header], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, target, header });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend orchestrator listening on port ${PORT}`);
});
