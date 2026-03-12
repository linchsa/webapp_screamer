# Bug Bounty Automation Dashboard 🛡️

A modern, Dockerized Bug Bounty reconnaissance tool with a beautiful visual interface.

## Overview
This platform automates passive and active recon by leveraging top-tier tools from ProjectDiscovery and the community, orchestrated via a Node.js backend and a dark-mode React UI.

### Integrated Tools:
- **Subfinder** (Passive subdomains)
- **Httpx** (Liveness and WAF detection)
- **Naabu** (Port scanning)
- **GAU / Waybackurls** (Historical URL fetching)
- **Katana** (Active JavaScript crawling)
- **Custom Playwright Crawler** (Headless Chromium interaction, dynamic asset downloading)
- **Gitleaks** (Secret detection in downloaded `.js` and `.map` files)

## Features
- **Wildcard Scanning**: Provide `*.example.com` to discover the underlying infrastructure.
- **Custom Bug Bounty Headers**: Essential for private programs (`X-Bug-Bounty: hacker123`).
- **Live Terminal Output**: Logs stream securely in real-time to the React Dashboard via Socket.io.
- **Kali Linux Base**: Built on `kali-rolling`, ensuring maximum compatibility with offensive security standards.

## Quick Start
Requirements: Docker and Docker Compose installed.

1. Clone or navigate to the repository directory.
2. Build and start the containers:
   ```bash
   docker-compose up -d --build
   ```
   *Note: The first build may take some time as it installs Go, Python, Node, Playwright, and compiles the Go-based tools.*
3. Open the UI at: http://localhost:3000

## Architecture
- `docker-compose.yml`: Spins up the `bug_bounty_dashboard` node (Kali + Node.js server).
- `frontend/`: React + Vite UI.
- `backend/`: Express + Socket.io orchestrator.
- `backend/scripts/scanner.sh`: Main pipeline script.
- `backend/scripts/active_crawler.js`: Playwright headless browser automation.
- `app_data/`: Persistent volume storing the SQLite database and all downloaded recon data (subdomains, ports, secrets, assets).
