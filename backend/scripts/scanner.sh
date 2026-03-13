#!/bin/bash
# Bug Bounty Automation Pipeline
# Usage: ./scanner.sh <target_domain> <custom_header>

TARGET=$1
HEADER=$2
PROJECT_DIR="/app/app_data/projects/$TARGET-$(date +%s)"
mkdir -p "$PROJECT_DIR"

echo "[SYSTEM] Starting pipeline for $TARGET"
echo "[SYSTEM] Output directory: $PROJECT_DIR"
echo "[SYSTEM] Using Custom Header: $HEADER"

# 1. Subdomain Discovery
echo "[SUBFINDER] Running passive subdomain discovery..."
subfinder -d "$TARGET" -all -silent > "$PROJECT_DIR/subdomains.txt"
SUB_COUNT=$(wc -l < "$PROJECT_DIR/subdomains.txt")
echo "[SUBFINDER] Found $SUB_COUNT subdomains"

# 2. Alive & WAF Check
echo "[HTTPX] Checking for live hosts..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | httpx -silent -H "$HEADER" -tech-detect > "$PROJECT_DIR/alive.txt"
else
    echo "[HTTPX] No subdomains to check."
    touch "$PROJECT_DIR/alive.txt"
fi
ALIVE_COUNT=$(wc -l < "$PROJECT_DIR/alive.txt")
echo "[HTTPX] Found $ALIVE_COUNT live hosts"

# 3. Port Scanning
echo "[NAABU] Scanning for open ports..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | naabu -silent -p - -o "$PROJECT_DIR/ports.txt"
else
    echo "[NAABU] No subdomains to scan."
fi
echo "[NAABU] Port scan completed. Results saved."

# 4. Passive URLs
echo "[GAU] Fetching historical URLs..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | gau > "$PROJECT_DIR/gau_urls.txt"
else
    touch "$PROJECT_DIR/gau_urls.txt"
fi
URL_COUNT=$(wc -l < "$PROJECT_DIR/gau_urls.txt")
echo "[GAU] Found $URL_COUNT historical URLs"

# 5. Active Crawling with Katana
echo "[KATANA] Starting active crawling..."
if [ "$ALIVE_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/alive.txt" | katana -jc -jsl -H "$HEADER" -silent > "$PROJECT_DIR/katana_urls.txt"
    echo "[KATANA] Active crawling finished"
else
    echo "[KATANA] No live hosts to crawl, skipping."
    touch "$PROJECT_DIR/katana_urls.txt"
fi

# 6. Advanced Playwright Crawler & JS Analyzer
echo "[PLAYWRIGHT] Running deep crawler and asset downloader..."
if [ -f "/app/backend/scripts/active_crawler.js" ]; then
    node /app/backend/scripts/active_crawler.js "$PROJECT_DIR/alive.txt" "$PROJECT_DIR" "$HEADER"
else
    echo "[PLAYWRIGHT] Crawler script not found, skipping."
fi

# 7. Secrets scanning
echo "[GITLEAKS] Scanning downloaded assets for secrets..."
if [ -d "$PROJECT_DIR/assets" ]; then
    gitleaks detect --no-git --source="$PROJECT_DIR/assets" -v > "$PROJECT_DIR/secrets.json" || true
    echo "[GITLEAKS] Secret scan done."
fi

echo "[SYSTEM] Pipeline compilation complete for $TARGET."
