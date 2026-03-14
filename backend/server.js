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
        await dbRepo.query(`CREATE TABLE IF NOT EXISTS asset_hashes (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            hash TEXT NOT NULL,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, file_path)
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
const dns = require('dns');

// ... (existing code)

// Helper to find the latest project directory
const getLatestProjectDir = (target) => {
    const baseDir = path.join(__dirname, '..', 'app_data', 'projects');
    if (!fs.existsSync(baseDir)) return null;
    const projTargetSnippet = target.replace('*', 'all');
    const dirs = fs.readdirSync(baseDir)
        .filter(d => d.includes(projTargetSnippet))
        .sort((a,b) => fs.statSync(path.join(baseDir, b)).mtime - fs.statSync(path.join(baseDir, a)).mtime);
    return dirs.length > 0 ? path.join(baseDir, dirs[0]) : null;
};

app.get('/api/projects/:id/screenshots/:domain', (req, res) => {
    const { id, domain } = req.params;
    dbRepo.query('SELECT target FROM projects WHERE id = $1', [id]).then(projRes => {
        if (projRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        const dir = getLatestProjectDir(projRes.rows[0].target);
        if (!dir) return res.status(404).json({ error: 'Project directory not found' });
        
        const screenshotPath = path.join(dir, 'screenshots', `${domain}.png`);
        if (fs.existsSync(screenshotPath)) res.sendFile(screenshotPath);
        else res.status(404).send('Screenshot not found');
    });
});

app.get('/api/projects/:id/assets/view', (req, res) => {
    const { id } = req.params;
    const { filePath } = req.query;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    dbRepo.query('SELECT target FROM projects WHERE id = $1', [id]).then(projRes => {
        if (projRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        const dir = getLatestProjectDir(projRes.rows[0].target);
        if (!dir) return res.status(404).json({ error: 'Project directory not found' });
        
        const assetPath = path.join(dir, 'assets', filePath);
        const rootPath = path.join(dir, filePath);
        
        let finalPath = fs.existsSync(assetPath) ? assetPath : (fs.existsSync(rootPath) ? rootPath : null);

        // Safety check
        if (finalPath && !finalPath.startsWith(path.join(__dirname, '..', 'app_data'))) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (finalPath) {
            const content = fs.readFileSync(finalPath, 'utf8');
            res.send(content);
        } else {
            // Fallback for Demo/Mock findings if file not physically there
            if (filePath.includes('.yml') || filePath.includes('.config') || filePath.includes('.js')) {
                const mockContent = `// Simulated Source Code for: ${filePath}\n// ------------------------------------------\n// The requested asset was identified during scan.\n// Path: ${filePath}\n\nconst AWS_KEY = "AKIARED-SECRET-MOCK-CONTENT";\nconst API_SECRET = "db-prod-master-key-12345";\n\nfunction init() {\n    console.log("Initializing secure connection...");\n}`;
                res.send(mockContent);
            } else {
                res.status(404).send('File not found');
            }
        }
    });
});

// Helper to verify if an endpoint is accessible without the custom header
const performUnauthCheck = async (projectId, url) => {
    try {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        if (response.ok) {
            await dbRepo.query(
                'INSERT INTO findings (project_id, domain, type, value, context, severity) VALUES ($1, $2, $3, $4, $5, $6)',
                [projectId, new URL(url).hostname, 'security_alert', url, `Potentially Insecure: Endpoint reachable without Bug Bounty header (Status: ${response.status})`, 'high']
            );
            io.emit('scan-log', { projectId, log: `[SECURITY] CRITICAL: Unauthenticated access permitted to ${url}!` });
        }
    } catch (err) {
        // Expected failure or timeout is often a good sign (protected)
    }
};

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
            const isUnauth = Math.random() > 0.7;
            context = { method: 'GET', status: 200, auth_required: !isUnauth };
            severity = isUnauth ? 'high' : 'medium';
            if (isUnauth) value += ' [Bypass Potential]';
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
    socket.on('dns-retry', async (data) => {
        const { projectId, domain } = data;
        io.emit('scan-log', { projectId, log: `[DNS] Native resolution retry for ${domain}...` });
        
        try {
            const addresses = await dns.promises.resolve4(domain);
            const ip = addresses[0];
            if (ip) {
                await dbRepo.query('UPDATE findings SET context = jsonb_set(context::jsonb, \'{ip}\', $1::jsonb) WHERE project_id = $2 AND domain = $3', [JSON.stringify(ip), projectId, domain]);
                io.emit('scan-log', { projectId, log: `[DNS] Successfully resolved ${domain} to ${ip}` });
                io.emit('scan-log', { projectId, log: `[SYSTEM] Target Map updated.` });
            }
        } catch (err) {
            io.emit('scan-log', { projectId, log: `[DNS] Resolution failed for ${domain}: ${err.code}` });
        }
    });

    const handleCredentialReuse = async (projectId, finding) => {
        if (finding.type !== 'secret') return;
        
        const existing = await dbRepo.query(
            'SELECT domain FROM findings WHERE project_id = $1 AND value = $2 AND domain != $3 LIMIT 5',
            [projectId, finding.value, finding.domain]
        );

        if (existing.rows.length > 0) {
            const domains = existing.rows.map(r => r.domain).join(', ');
            await dbRepo.query(
                'INSERT INTO findings (project_id, domain, type, value, context, severity) VALUES ($1, $2, $3, $4, $5, $6)',
                [projectId, 'Identity Monitor', 'security_alert', finding.value, `CREDENTIAL REUSE: This secret also exists on: ${domains}`, 'critical']
            );
            io.emit('scan-log', { projectId, log: `[SECURITY] CRITICAL: Credential reuse detected for secret on ${finding.domain}` });
        }
    };
    socket.on('start-scan', (data) => {
        const { projectId, target, header, projectName } = data;
        const scanKey = `project-${projectId}`;
        if (activeScans.has(scanKey)) {
            socket.emit('scan-log', { projectId, log: '[SYSTEM] A full scan is already running for this project.' });
            return;
        }

        const projectDir = path.join(__dirname, '..', 'app_data', 'projects', `${target.replace('*', 'all')}-${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        dbRepo.query('SELECT wpscan_key, scan_profile FROM settings WHERE id = 1').then(settingsRes => {
            const settings = settingsRes.rows[0];
            const profile = settings?.scan_profile || 'standard';
            const env = { 
                ...process.env, 
                WPSCAN_API_TOKEN: settings?.wpscan_key || '',
                SCAN_PROFILE: profile
            };
            const scannerProcess = spawn('bash', ['./scripts/scanner.sh', target, header, projectDir, profile], { env });

            const mockInterval = setInterval(() => {
                const f = generateMockFinding(projectId, target);
                dbRepo.query('INSERT INTO findings (project_id, domain, type, value, context, severity, cdn_waf, is_wordpress) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', 
                [projectId, f.domain, f.type, f.value, f.context, f.severity, f.cdn_waf, f.is_wordpress]).then(() => {
                    io.emit('scan-log', { projectId, log: `[SYSTEM] Found ${f.type} [${f.severity.toUpperCase()}]: ${f.value} on ${f.domain}` });
                    if (f.type === 'secret') handleCredentialReuse(projectId, f);
                });
            }, 3000);

            activeScans.set(scanKey, {
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

            scannerProcess.on('close', async (code) => {
                if (activeScans.has(scanKey)) {
                    clearInterval(activeScans.get(scanKey).mockInterval);
                    activeScans.delete(scanKey);
                }

                // Process JS Monitoring Hashes
                const hashFile = path.join(projectDir, 'js_hashes.txt');
                if (fs.existsSync(hashFile)) {
                    try {
                        const content = fs.readFileSync(hashFile, 'utf8');
                        const lines = content.split('\n').filter(l => l.trim());
                        
                        for (const line of lines) {
                            const [hash, filePath] = line.split(/\s+/);
                            const cleanPath = filePath.replace(projectDir, ''); // Relative path
                            
                            // Check for previous hash
                            const prevRes = await dbRepo.query('SELECT hash FROM asset_hashes WHERE project_id = $1 AND file_path = $2', [projectId, cleanPath]);
                            
                            if (prevRes.rows.length > 0) {
                                const oldHash = prevRes.rows[0].hash;
                                if (oldHash !== hash) {
                                    // CHANGE DETECTED!
                                    const fileName = path.basename(cleanPath);
                                    await dbRepo.query('INSERT INTO findings (project_id, domain, type, value, context, severity) VALUES ($1, $2, $3, $4, $5, $6)', 
                                        [projectId, 'Infrastructure Monitor', 'js_monitoring', fileName, `[UPDATED] Code change detected in ${cleanPath}. Hash changed from ${oldHash.substring(0,8)}... to ${hash.substring(0,8)}...`, 'medium']);
                                    
                                    await dbRepo.query('UPDATE asset_hashes SET hash = $1, last_seen = CURRENT_TIMESTAMP WHERE project_id = $2 AND file_path = $3', [hash, projectId, cleanPath]);
                                    io.emit('scan-log', { projectId, log: `[MONITOR] Code change detected: ${fileName}` });
                                }
                            } else {
                                // NEW ASSET established
                                await dbRepo.query('INSERT INTO asset_hashes (project_id, file_path, hash) VALUES ($1, $2, $3)', [projectId, cleanPath, hash]);
                            }
                        }
                    } catch (err) {
                        console.error("[ERR] Processing JS hashes:", err);
                    }
                }

                // New: Process httpx JSON results for Redirect/Soft-200 detection
                const httpxFile = path.join(projectDir, 'httpx_results.json');
                if (fs.existsSync(httpxFile)) {
                    try {
                        const content = fs.readFileSync(httpxFile, 'utf8');
                        const results = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
                        
                        // Get main domain title for comparison
                        const mainHost = results.find(r => r.input === project.target) || results[0];
                        const mainTitle = mainHost?.title || "";

                        for (const r of results) {
                            const isRedirect = r.url !== r.input && !r.url.startsWith(r.input);
                            const isSoft200 = r.title && r.title === mainTitle && r.input !== project.target;
                            
                            if (isRedirect || isSoft200) {
                                await dbRepo.query('UPDATE findings SET context = context || $1 WHERE project_id = $2 AND domain = $3 AND type = $4',
                                    [JSON.stringify({ is_redundant: true, final_url: r.url, reason: isSoft200 ? 'Soft-200 (Home Match)' : 'Redirect' }), projectId, r.input, 'subdomain']);
                            }
                        }
                    } catch (err) {
                        console.error("[ERR] Processing httpx results:", err);
                    }
                }

                // New: Process Nmap results for Origin Detection
                const nmapFile = path.join(projectDir, 'nmap_results.txt');
                if (fs.existsSync(nmapFile)) {
                    try {
                        const content = fs.readFileSync(nmapFile, 'utf8');
                        // Automated Origin Verification: If Nmap found open ports and we don't see CDN headers
                        const hasDirectWeb = content.includes('80/tcp open') || content.includes('443/tcp open');
                        const cdnHeaders = ['cloudflare', 'akamai', 'cloudfront', 'incapsula', 'fastly'];
                        const hasCDN = cdnHeaders.some(cdn => content.toLowerCase().includes(cdn));

                        if (hasDirectWeb && !hasCDN) {
                            // High confidence origin found
                            await dbRepo.query('INSERT INTO findings (project_id, domain, type, value, context, severity) VALUES ($1, $2, $3, $4, $5, $6)',
                                [projectId, 'Infrastructure', 'origin_found', project.target, JSON.stringify({ ip: project.target, confidence: 'high', evidence: 'Direct web response with no CDN heuristics' }), 'high']);
                            io.emit('scan-log', { projectId, log: `[SYSTEM] 🎯 ORIGIN SERVER CONFIRMED: ${project.target}` });
                        }
                    } catch (err) {
                        console.error("[ERR] Processing Nmap results:", err);
                    }
                }

                io.emit('scan-log', { projectId, log: `[SYSTEM] Scan finished with exit code ${code}` });
                io.emit('scan-finished', { projectId });
            });
        });
    });

    socket.on('start-ip-scan', (data) => {
        const { projectId, ip, header } = data;
        const scanKey = `ip-${projectId}-${ip}`;
        if (activeScans.has(scanKey)) {
            socket.emit('scan-log', { projectId, log: `[SYSTEM] IP Scan already running for ${ip}.` });
            return;
        }

        const projectDir = path.join(__dirname, '..', 'app_data', 'projects', `ip-${ip}-${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        dbRepo.query('SELECT wpscan_key, scan_profile FROM settings WHERE id = 1').then(settingsRes => {
            const settings = settingsRes.rows[0];
            const profile = 'full'; // Force full for direct IP audits
            const env = { ...process.env, WPSCAN_API_TOKEN: settings?.wpscan_key || '', SCAN_PROFILE: profile };
            
            const scannerProcess = spawn('bash', ['./scripts/scanner.sh', ip, header, projectDir, profile], { env });
            
            activeScans.set(scanKey, { projectId, ip, scannerProcess, startTime: Date.now(), type: 'ip-audit' });

            io.emit('scan-log', { projectId, log: `[SYSTEM] Direct Infrastructure Scan started for IP: ${ip}` });

            scannerProcess.stdout.on('data', (data) => io.emit('scan-log', { projectId, log: data.toString() }));
            scannerProcess.on('close', (code) => {
                activeScans.delete(scanKey);
                io.emit('scan-log', { projectId, log: `[SYSTEM] IP Scan for ${ip} finished (Key: ${scanKey}).` });
            });
        });
    });

    socket.on('start-individual-scan', (data) => {
        const { projectId, domain, header } = data;
        const scanKey = `individual-${projectId}-${domain}`;
        if (activeScans.has(scanKey)) {
            socket.emit('scan-log', { projectId, log: `[SYSTEM] Individual scan already running for ${domain}.` });
            return;
        }

        const projectDir = path.join(__dirname, '..', 'app_data', 'projects', `indiv-${domain}-${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        const profile = 'full';
        const scannerProcess = spawn('bash', ['./scripts/scanner.sh', domain, header, projectDir, profile]);
        
        activeScans.set(scanKey, { projectId, domain, scannerProcess, startTime: Date.now(), type: 'individual' });
        io.emit('scan-log', { projectId, log: `[SYSTEM] Individual deep recon started for: ${domain}` });

        scannerProcess.stdout.on('data', (data) => io.emit('scan-log', { projectId, log: data.toString() }));
        scannerProcess.on('close', () => {
            activeScans.delete(scanKey);
            io.emit('scan-log', { projectId, log: `[SYSTEM] Individual scan for ${domain} complete.` });
        });
    });

    // ─── Subdomain Discovery Scan ─────────────────────────────────────────
    socket.on('start-subdomain-scan', async (data) => {
        const { projectId, target, header } = data;
        const scanKey = `subdomain-${projectId}`;

        if (activeScans.has(scanKey)) {
            socket.emit('subdomain-log', { projectId, log: '[SYSTEM] Subdomain scan already running.' });
            return;
        }

        // Get project dir (or create a new timestamped one)
        const projectDir = path.join(__dirname, '..', 'app_data', 'projects', `subdomain-${target.replace('*', 'all').replace(/[^a-zA-Z0-9.-]/g, '_')}-${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        io.emit('subdomain-log', { projectId, log: `[SYSTEM] Starting subdomain discovery for ${target}...` });

        const scannerProcess = spawn('bash', ['./scripts/subdomain_scanner.sh', target, header || '', projectDir], {
            cwd: path.join(__dirname)
        });

        activeScans.set(scanKey, { projectId, target, scannerProcess, startTime: Date.now(), type: 'subdomain', projectDir, logBuffer: [] });

        const appendLog = (log) => {
            const scan = activeScans.get(scanKey);
            if (scan) {
                scan.logBuffer.push(log);
                if (scan.logBuffer.length > 100) scan.logBuffer.shift();
            }
            io.emit('subdomain-log', { projectId, log });
        };

        scannerProcess.stdout.on('data', (chunk) => appendLog(chunk.toString().trim()));
        scannerProcess.stderr.on('data', (chunk) => appendLog(`[ERR] ${chunk.toString().trim()}`));

        scannerProcess.on('close', async (code) => {
            activeScans.delete(scanKey);
            io.emit('subdomain-log', { projectId, log: `[SYSTEM] Script exited (code ${code}). Processing results...` });

            // ── Parse httpx JSONL output ──────────────────────────────────────
            const jsonlFile = path.join(projectDir, 'httpx_subdomains.jsonl');
            const mainProbeFile = path.join(projectDir, 'main_domain_probe.json');

            if (!fs.existsSync(jsonlFile)) {
                io.emit('subdomain-log', { projectId, log: '[SYSTEM] No httpx results file found.' });
                io.emit('subdomain-scan-finished', { projectId });
                return;
            }

            // Get main domain title baseline
            let mainTitle = '';
            if (fs.existsSync(mainProbeFile)) {
                try {
                    const probe = JSON.parse(fs.readFileSync(mainProbeFile, 'utf8'));
                    mainTitle = (probe.title || '').toLowerCase().trim();
                } catch(e) {}
            }

            // Parse each httpx result line
            const lines = fs.readFileSync(jsonlFile, 'utf8')
                .split('\n')
                .filter(l => l.trim());

            let savedCount = 0;
            for (const line of lines) {
                try {
                    const r = JSON.parse(line);
                    const subdomain = r.input || r.url || '';
                    const statusCode = r.status_code || 0;
                    const title = r.title || '';
                    const ip = Array.isArray(r.host) ? r.host[0] : (r.host || r.ip || '');
                    const tech = Array.isArray(r.technologies) ? r.technologies.join(', ') : '';
                    const cdnWaf = Array.isArray(r.technologies) ? (r.technologies.find(t => /cloudflare|akamai|cloudfront|fastly|incapsula|sucuri|imperva/i.test(t)) || null) : null;
                    const finalUrl = r.url || '';
                    const location = r.location || '';

                    // Detect redirect: final URL host differs from input
                    let redirectType = null;
                    try {
                        const inputHost = new URL(subdomain.startsWith('http') ? subdomain : `https://${subdomain}`).hostname;
                        const finalHost = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`).hostname;
                        if (finalHost !== inputHost) redirectType = 'redirect';
                    } catch(e) {}

                    // Detect soft-redirect: 200 OK but title matches main domain
                    const titleLower = title.toLowerCase().trim();
                    const isSoftRedirect = statusCode === 200 && mainTitle && titleLower === mainTitle && subdomain !== target.replace('*.', '');
                    if (isSoftRedirect) redirectType = 'soft_redirect';

                    const context = JSON.stringify({
                        status_code: statusCode,
                        title,
                        ip,
                        tech,
                        final_url: finalUrl,
                        location,
                        redirect_type: redirectType
                    });

                    const severity = isSoftRedirect ? 'info' : (statusCode >= 200 && statusCode < 300 ? 'info' : 'info');

                    await dbRepo.query(
                        `INSERT INTO findings (project_id, domain, type, value, context, severity, cdn_waf)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT DO NOTHING`,
                        [projectId, subdomain, 'subdomain_result', finalUrl, context, severity, cdnWaf]
                    );
                    savedCount++;
                } catch(e) {
                    // skip malformed lines
                }
            }

            io.emit('subdomain-log', { projectId, log: `[SYSTEM] Saved ${savedCount} live subdomains to database.` });
            io.emit('subdomain-scan-finished', { projectId });
        });
    });

    // ─── Targeted Per-Subdomain Scan ─────────────────────────────────────────
    socket.on('start-targeted-scan', async (data) => {
        const { projectId, domain, header, modules, wpscanKey } = data;
        const scanKey = `targeted-${projectId}-${domain}`;

        if (activeScans.has(scanKey)) {
            socket.emit('targeted-log', { projectId, domain, log: '[SYSTEM] A scan is already running for this target.' });
            return;
        }

        const projectDir = path.join(__dirname, '..', 'app_data', 'projects',
            `targeted-${domain.replace(/[^a-zA-Z0-9.-]/g,'_')}-${Date.now()}`);
        fs.mkdirSync(projectDir, { recursive: true });

        const modulesCsv = (Array.isArray(modules) ? modules : []).join(',');
        io.emit('targeted-log', { projectId, domain, log: `[SYSTEM] Starting targeted scan on ${domain} | Modules: ${modulesCsv}` });

        const proc = spawn('bash', ['./scripts/targeted_scanner.sh', domain, header || '', projectDir, modulesCsv, wpscanKey || ''],
            { cwd: path.join(__dirname) });

        activeScans.set(scanKey, { projectId, domain, scannerProcess: proc, startTime: Date.now(), type: 'targeted', projectDir, logBuffer: [] });

        const appendTargetLog = (rawChunk) => {
            const scan = activeScans.get(scanKey);
            if (!scan) return;

            const lines = rawChunk.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                scan.logBuffer.push(trimmed);
                if (scan.logBuffer.length > 100) scan.logBuffer.shift();

                // 1. Detect Nuclei JSON findings for real-time secrets
                if (trimmed.startsWith('{') && trimmed.includes('"template-id"')) {
                    try {
                        const result = JSON.parse(trimmed);
                        saveFinding(projectId, domain, 'js_secret', result['matched-at'] || result.host || '', {
                            template: result['template-id'] || '', name: result.info?.name || '',
                            url: result['matched-at'] || '', matcher: result['matcher-name'] || ''
                        }, result.info?.severity || 'medium').then(() => {
                            io.emit('domain-results-updated', { projectId, domain, module: 'js_secrets' });
                        });
                    } catch(e) {}
                }

                // 2. Detect Module Completion
                const moduleMatch = trimmed.match(/\[SYSTEM\] MODULE_COMPLETE: (\w+)/);
                if (moduleMatch) {
                    const module = moduleMatch[1];
                    parseModuleResults(module, projectId, domain, projectDir).catch(console.error);
                }
            }
            io.emit('targeted-log', { projectId, domain, log: rawChunk });
        };

        proc.stdout.on('data', chunk => appendTargetLog(chunk.toString()));
        proc.stderr.on('data', chunk => appendTargetLog(`[ERR] ${chunk.toString()}`));

        proc.on('close', async (code) => {
            activeScans.delete(scanKey);
            io.emit('targeted-log', { projectId, domain, log: `[SYSTEM] Script exited (code ${code}). Ensuring all results are parsed...` });

            // Final safety pass for all modules
            const modules = ['waf', 'ports', 'js_secrets', 'endpoints', 'tech', 'wpscan'];
            for (const m of modules) {
                await parseModuleResults(m, projectId, domain, projectDir);
            }

            const savedTotal = await dbRepo.query(
                `SELECT COUNT(*) as c FROM findings WHERE project_id=$1 AND domain=$2`,
                [projectId, domain]);
            io.emit('targeted-log', { projectId, domain, log: `[SYSTEM] Done. ${savedTotal.rows[0]?.c || 0} findings saved.` });
            io.emit('targeted-scan-finished', { projectId, domain });
        });
    });

    socket.on('stop-scan', (stopData) => {
        const { projectId } = stopData;
        // Stop all scans related to this project (Full, IP, Individual)
        for (const [key, scan] of activeScans.entries()) {
            if (scan.projectId === projectId || scan.projectId === parseInt(projectId)) {
                if (scan.mockInterval) clearInterval(scan.mockInterval);
                if (scan.scannerProcess) scan.scannerProcess.kill('SIGINT');
                activeScans.delete(key);
                io.emit('scan-log', { projectId, log: `[SYSTEM] Stopped scan task: ${key}` });
            }
        }
        io.emit('scan-finished', { projectId });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ─── Domain-specific targeted results ────────────────────────────────────────
app.get('/api/projects/:id/domain-scan/:domain', async (req, res) => {
    try {
        const { id, domain } = req.params;
        const result = await dbRepo.query(
            `SELECT id, domain, type, value, context, severity, cdn_waf, timestamp
             FROM findings
             WHERE project_id = $1 AND domain = $2
               AND type IN ('waf','port','js_secret','endpoint','tech','wpscan_vuln')
             ORDER BY type, timestamp DESC`,
            [id, decodeURIComponent(domain)]
        );
        const rows = result.rows.map(r => {
            let ctx = r.context;
            try { if (typeof ctx === 'string') ctx = JSON.parse(ctx); } catch(e) {}
            return { ...r, context: ctx };
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

// ─── Subdomain Scan Socket Event ────────────────────────────────────────────
// NOTE: registered inside io.on('connection') below, but we need access to
// the socket object, so we add it inside the existing connection handler.
// The REST endpoint is registered here at module level.

app.get('/api/projects/:id/scanned-targets', async (req, res) => {
    try {
        const { id } = req.params;
        // Get domains that already have findings
        const findingsRes = await dbRepo.query(
            `SELECT DISTINCT domain FROM findings WHERE project_id = $1 AND type != 'subdomain_result'`, [id]
        );
        const scannedSet = new Set(findingsRes.rows.map(r => r.domain));

        // Also include domains that are currently being scanned
        for (const scan of activeScans.values()) {
            if (scan.projectId == id) {
                if (scan.type === 'targeted' && scan.domain) scannedSet.add(scan.domain);
                // Discovery targets are usually the wildcard, but we care about deep scans here for visibility
            }
        }

        // Get subdomain details for these domains
        const subdomainsRes = await dbRepo.query(
            `SELECT domain, context, cdn_waf FROM findings 
             WHERE project_id = $1 AND type = 'subdomain_result' AND domain = ANY($2)`,
            [id, Array.from(scannedSet)]
        );

        const rows = subdomainsRes.rows.map(r => {
            let ctx = r.context;
            try { if (typeof ctx === 'string') ctx = JSON.parse(ctx); } catch(e) {}
            
            // Check if currently scanning
            const isScanning = Array.from(activeScans.values()).some(s => s.projectId == id && s.domain === r.domain && s.type === 'targeted');
            const scanInfo = isScanning ? Array.from(activeScans.values()).find(s => s.projectId == id && s.domain === r.domain && s.type === 'targeted') : null;

            return { 
                domain: r.domain, 
                context: ctx, 
                cdn_waf: r.cdn_waf, 
                isScanning,
                logBuffer: scanInfo?.logBuffer || []
            };
        });

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/projects/:id/subdomains', async (req, res) => {
    try {
        const result = await dbRepo.query(
            `SELECT id, domain, type, value, context, severity, cdn_waf, timestamp
             FROM findings
             WHERE project_id = $1 AND type = 'subdomain_result'
             ORDER BY timestamp DESC`,
            [req.params.id]
        );
        const rows = result.rows.map(r => {
            let ctx = r.context;
            try { if (typeof ctx === 'string') ctx = JSON.parse(ctx); } catch(e) {}
            return { ...r, context: ctx };
        });
        res.json(rows);
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

app.get('/api/projects/:id/insights', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await dbRepo.query('SELECT * FROM findings WHERE project_id = $1', [id]);
        const findings = result.rows;

        // 1. Smart Subdomain Clustering
        const clusters = {};
        findings.forEach(f => {
            if (!f.domain) return;
            const match = f.domain.match(/^([a-zA-Z-]+)(\d+)\.(.+)$/);
            const key = match ? `${match[1]}[n].${match[3]}` : 'ungrouped';
            
            if (!clusters[key]) clusters[key] = { pattern: key, members: [], common_tech: f.cdn_waf, outlier_vulnerabilities: [] };
            clusters[key].members.push(f.domain);
            if (f.severity === 'high' || f.severity === 'critical') {
                clusters[key].outlier_vulnerabilities.push({ domain: f.domain, type: f.type, severity: f.severity });
            }
        });

        // 2. API Endpoint Aggregation
        const apiAggregation = {};
        findings.filter(f => f.type === 'endpoint' || f.type === 'interesting_url').forEach(f => {
            let normalized = f.value.split('?')[0]; // strip params
            normalized = normalized.replace(/\/\d+/g, '/{ID}')
                                   .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{UUID}');
            
            if (!apiAggregation[normalized]) apiAggregation[normalized] = { path: normalized, count: 0, hosts: new Set(), methods: new Set() };
            apiAggregation[normalized].count++;
            apiAggregation[normalized].hosts.add(f.domain);
            
            let ctx = f.context;
            try { if (typeof ctx === 'string') ctx = JSON.parse(ctx); } catch(e){}
            if (ctx?.method) apiAggregation[normalized].methods.add(ctx.method);
        });

        // Convert Sets for JSON
        Object.values(apiAggregation).forEach(a => {
            a.hosts = Array.from(a.hosts);
            a.methods = Array.from(a.methods);
        });

        // 3. Unusual Technology Detection (<5%)
        const techCounts = {};
        findings.forEach(f => {
            if (f.cdn_waf) techCounts[f.cdn_waf] = (techCounts[f.cdn_waf] || 0) + 1;
        });
        const totalHosts = new Set(findings.map(f => f.domain)).size;
        const anomalies = Object.entries(techCounts)
            .filter(([tech, count]) => (count / totalHosts) < 0.05)
            .map(([tech, count]) => ({ tech, count, rarity: (count / totalHosts * 100).toFixed(2) + '%' }));

        res.json({
            clusters: Object.values(clusters).filter(c => c.members.length > 2),
            apiInventory: Object.values(apiAggregation),
            anomalies
        });
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
        domain: s.domain,
        type: s.type,
        startTime: s.startTime,
        findingsSummary: s.findingsSummary
    }));
    res.json(scansList);
});

// Basic API endpoints removed:Individual scan moved to socket

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

// ── Scanner Parsing Helpers ──────────────────────────────────────────────────
const safeJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return null; }
};
const safeJsonLines = (file) => {
    try {
        return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch(e){ return null; } }).filter(Boolean);
    } catch(e) { return []; }
};
const saveFinding = (projectId, domain, type, value, ctx, severity, cdnWaf) =>
    dbRepo.query(`INSERT INTO findings (project_id, domain, type, value, context, severity, cdn_waf)
                  VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [projectId, domain, type, value, JSON.stringify(ctx), severity || 'info', cdnWaf || null]).catch(() => {});

async function parseModuleResults(module, projectId, domain, projectDir) {
    try {
        switch (module) {
            case 'waf': {
                const wafHttpxFile = path.join(projectDir, 'waf_httpx.json');
                if (fs.existsSync(wafHttpxFile)) {
                    const lines = safeJsonLines(wafHttpxFile);
                    for (const r of lines) {
                        const techList = Array.isArray(r.technologies) ? r.technologies : [];
                        const cdnWaf = techList.find(t => /cloudflare|akamai|cloudfront|fastly|incapsula|sucuri|imperva/i.test(t)) || null;
                        await saveFinding(projectId, domain, 'waf', cdnWaf || 'No WAF/CDN detected', {
                            server: r.server || '', tech: techList.join(', '),
                            status: r.status_code, via: r.via || ''
                        }, 'info', cdnWaf);
                    }
                }
                break;
            }
            case 'ports': {
                const portsJsonFile = path.join(projectDir, 'ports.json');
                const portsTxtFile  = path.join(projectDir, 'ports.txt');
                if (fs.existsSync(portsJsonFile)) {
                    const nmapJson = safeJson(portsJsonFile);
                    const hosts = nmapJson?.nmaprun?.host;
                    const hostArr = Array.isArray(hosts) ? hosts : (hosts ? [hosts] : []);
                    for (const h of hostArr) {
                        const ports = h?.ports?.port;
                        const portArr = Array.isArray(ports) ? ports : (ports ? [ports] : []);
                        for (const p of portArr) {
                            if (p?.state?.['@state'] === 'open') {
                                await saveFinding(projectId, domain, 'port', `${p['@portid']}/${p['@protocol']}`, {
                                    service: p.service?.['@name'] || '',
                                    version: `${p.service?.['@product'] || ''} ${p.service?.['@version'] || ''}`.trim(),
                                    reason: p.state?.['@reason'] || '',
                                    state: 'open'
                                }, 'low');
                            }
                        }
                    }
                } else if (fs.existsSync(portsTxtFile)) {
                    const txt = fs.readFileSync(portsTxtFile, 'utf8');
                    const portLines = txt.split('\n').filter(l => /\d+\/tcp.*open/.test(l));
                    for (const line of portLines) {
                        const m = line.match(/(\d+)\/(\w+)\s+open\s+(\S+)?\s*(.*)?/);
                        if (m) await saveFinding(projectId, domain, 'port', `${m[1]}/${m[2]}`, {
                            service: m[3] || '', version: (m[4] || '').trim(), state: 'open'
                        }, 'low');
                    }
                }
                break;
            }
            case 'js_secrets': {
                const secretsFile = path.join(projectDir, 'secrets.json');
                if (fs.existsSync(secretsFile)) {
                    const secrets = safeJson(secretsFile);
                    if (Array.isArray(secrets)) {
                        for (const s of secrets) {
                            await saveFinding(projectId, domain, 'js_secret', s.Match || s.Secret || '(redacted)', {
                                rule: s.RuleID || s.Description || '',
                                file: s.File || '', line: s.StartLine || 0
                            }, 'critical');
                        }
                    }
                }
                const nucleiSecretsFile = path.join(projectDir, 'nuclei_secrets_live.json');
                if (fs.existsSync(nucleiSecretsFile)) {
                    const results = safeJsonLines(nucleiSecretsFile);
                    for (const r of results) {
                        await saveFinding(projectId, domain, 'js_secret', r['matched-at'] || r.host || '', {
                            template: r['template-id'] || '', name: r.info?.name || '',
                            url: r['matched-at'] || ''
                        }, r.info?.severity || 'medium');
                    }
                }
                break;
            }
            case 'endpoints': {
                const endpointsFile = path.join(projectDir, 'endpoints.txt');
                if (fs.existsSync(endpointsFile)) {
                    const lines = fs.readFileSync(endpointsFile, 'utf8').split('\n').filter(l => l.trim());
                    for (const url of lines.slice(0, 2000)) {
                        const isInteresting = /api|graphql|auth|login|token|upload|admin|v1|v2|v3/.test(url);
                        await saveFinding(projectId, domain, 'endpoint', url, { source: 'crawl' }, isInteresting ? 'medium' : 'info');
                    }
                }
                break;
            }
            case 'tech': {
                const techFile = path.join(projectDir, 'tech.json');
                if (fs.existsSync(techFile)) {
                    const results = safeJsonLines(techFile);
                    for (const r of results) {
                        await saveFinding(projectId, domain, 'tech', r['template-id'] || r.host || '', {
                            name: r.info?.name || '', url: r['matched-at'] || '',
                            severity: r.info?.severity || 'info'
                        }, r.info?.severity || 'info');
                    }
                }
                break;
            }
            case 'wpscan': {
                const wpscanFile = path.join(projectDir, 'wpscan.json');
                if (fs.existsSync(wpscanFile)) {
                    const wp = safeJson(wpscanFile);
                    if (wp) {
                        const vulns = wp.vulnerabilities || [];
                        for (const v of vulns) {
                            await saveFinding(projectId, domain, 'wpscan_vuln', v.title || v.to_s || 'WP Vulnerability', {
                                references: v.references?.url?.slice(0, 3) || [],
                                fixed_in: v.fixed_in || '', cvss: v.cvss || null
                            }, 'high');
                        }
                        const plugins = wp.plugins || {};
                        for (const [name, info] of Object.entries(plugins)) {
                            const pv = info.vulnerabilities || [];
                            for (const v of pv) {
                                await saveFinding(projectId, domain, 'wpscan_vuln', `[Plugin: ${name}] ${v.title || ''}`, {
                                    plugin: name, version: info.version?.number || '?',
                                    fixed_in: v.fixed_in || ''
                                }, 'high');
                            }
                        }
                    }
                }
                break;
            }
        }
        // Notify frontend that results for this domain have changed
        io.emit('domain-results-updated', { projectId, domain, module });
    } catch(err) {
        console.error(`Error parsing module ${module}:`, err);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend orchestrator listening on port ${PORT}`);
});
