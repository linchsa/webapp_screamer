# ⚡ WebApp Screamer: Advanced Bug Bounty Automation

WebApp Screamer is a powerful, modular, and automated reconnaissance dashboard designed for bug bounty hunters. Built on top of Kali Linux, it integrates industry-standard tools for subdomain discovery, intensive port scanning, real-time secret discovery, and advanced technology fingerprinting.

![Architecture](https://img.shields.io/badge/Architecture-Modular-blue)
![Platform](https://img.shields.io/badge/Platform-Docker_Kali-orange)
![Status](https://img.shields.io/badge/Status-Active_Development-green)

---

## 🔥 Key Features

### 🎯 Targeted Modular Scanning
Don't waste time scanning everything. Select specific subdomains and choose exactly what to scan:
- **WAF/CDN Detection**: identify protection layers using `cdncheck` and `httpx`.
- **Intensive Port Scan**: Full `nmap -sV -sC -Pn` scan with reason reporting.
- **Real-time JS Secrets**: Dynamic pipeline (`katana | nuclei`) that shows findings **as they are discovered**.
- **Deep Endpoint Crawling**: Intensive crawling with `katana` (depth 5, form filling) + historical `gau` discovery.
- **Tech Fingerprinting**: Zero-noise technology detection using advanced `nuclei` templates.
- **Wordpress Audit**: Integrated `wpscan` with custom API key support.

### 📜 Persistent Terminal History
Every scan module preserves its terminal output in the PostgreSQL database.
- See exactly what the tools are doing in real-time.
- Consult historical logs at any time, even after page refreshes or server restarts.
- Clean, line-buffered output for a console-like experience.

### 🧠 Intelligence Dashboard
- **Smart Clustering**: Automatically groups subdomains by pattern (e.g., `dev[n].target.com`).
- **Live Status Monitoring**: Visualize which scans are active, pending, or completed.
- **Security Insights**: Quick view of outlier vulnerabilities and critical findings across the entire project.

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite) + Tailwind CSS (Cyberpunk/Dark Aesthetics).
- **Backend**: Node.js + Express + Socket.io (Real-time events).
- **Database**: PostgreSQL (Findings, Logs, Hashing).
- **OS**: Kali Linux (Docker-based).
- **Security Tools**: Subfinder, Httpx, Katana, Nuclei, Nmap, Gitleaks, Gau, WPScan.

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Docker & Docker Compose installed.

### 2. Clone and Build
```bash
git clone https://github.com/your-repo/webapp_screamer.git
cd webapp_screamer
docker-compose up --build
```

### 3. Access the Dashboard
Navigate to `http://localhost:5173` (or your configured port).

---

## 📖 Usage Guide

### 1. Create a Project
- Click on "New Project".
- Enter the target (e.g., `*.target.com`).
- Add custom headers if needed (for private bug bounty programs).

### 2. Run Discovery
- Launch the initial Discovery to find subdomains.
- Monitor the progress in the "Active Scans" section.

### 3. Deep Scan (Targeted)
- Go to the **Intelligence** section.
- Click on a subdomain to open its dashboard.
- Select the modules you want to run (Ports, Secrets, etc.).
- Watch the **Live Verbosity** terminal as findings appear in real-time.

---

## 🛠️ Developer Configuration

### Environment Variables (.env)
```env
DB_USER=postgres
DB_PASS=postgres
DB_NAME=screamer
DB_HOST=db
WPSCAN_API_KEY=your_key_here
```

### Customizing Scans
Modify `backend/scripts/targeted_scanner.sh` to adjust tool flags or add new modules.

---

## 🤝 Contributing
Feel free to open issues or submit pull requests for new tools or UI improvements.

## ⚠️ Legal Disclaimer
This tool is for educational and authorized security testing purposes only. Use it only against targets you have explicit permission to test.
