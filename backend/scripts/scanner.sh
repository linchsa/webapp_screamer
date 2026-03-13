#!/bin/bash
# Bug Bounty Automation Pipeline
# Usage: ./scanner.sh <target_domain> <custom_header>

TARGET=$1
HEADER=$2
PROJECT_DIR=$3
PROFILE=${4:-"standard"}

if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR="/app/app_data/projects/$TARGET-$(date +%s)"
fi
mkdir -p "$PROJECT_DIR"

# Configure Nuclei Tags & Depth based on Profile
if [ "$PROFILE" == "quick" ]; then
    NUCLEI_TAGS="takeover,exposure,panel,config"
    NAABU_PORTS="80,443,8080,8443"
    SKIP_KATANA=true
elif [ "$PROFILE" == "full" ]; then
    NUCLEI_TAGS="takeover,exposure,panel,config,vuln,cve,tech,cms"
    NAABU_PORTS="1-10000"
    SKIP_KATANA=false
else
    # Standard
    NUCLEI_TAGS="takeover,exposure,panel,config,vuln"
    NAABU_PORTS="top-1000"
    SKIP_KATANA=false
fi

echo "[SYSTEM] Starting pipeline for $TARGET (Profile: $PROFILE)"
echo "[SYSTEM] Output directory: $PROJECT_DIR"
echo "[SYSTEM] Using Custom Header: $HEADER"

# 1. Target Detection & Domain/IP Discovery
echo "[SYSTEM] Resolving target type..."
if [[ $TARGET =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ $TARGET =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; then
    echo "[SYSTEM] Direct IP/Range target detected: $TARGET"
    echo "$TARGET" > "$PROJECT_DIR/subdomains.txt"
    SUB_COUNT=1
    IS_IP=true
else
    echo "[SUBFINDER] Running passive subdomain discovery..."
    subfinder -d "$TARGET" -all -silent > "$PROJECT_DIR/subdomains.txt"
    SUB_COUNT=$(wc -l < "$PROJECT_DIR/subdomains.txt")
    echo "[SUBFINDER] Found $SUB_COUNT subdomains"
    IS_IP=false
fi

# 2. Alive & WAF Check
echo "[HTTPX] Checking for live hosts..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | httpx -silent -H "$HEADER" -tech-detect -ip > "$PROJECT_DIR/alive.txt"
else
    echo "[HTTPX] No subdomains to check."
    touch "$PROJECT_DIR/alive.txt"
fi
ALIVE_COUNT=$(wc -l < "$PROJECT_DIR/alive.txt")
echo "[HTTPX] Found $ALIVE_COUNT live hosts"

# 3. CNAME & Takeover Resolution
echo "[HTTPX] Resolving CNAMEs for takeover prioritization..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | httpx -silent -cname -nc > "$PROJECT_DIR/cnames.txt"
    # Flag potential takeovers by looking for 404s on cloud-related CNAMEs
    grep -E "cloudfront|s3|azure|github|herokuapp|zendesk" "$PROJECT_DIR/cnames.txt" | grep "404" > "$PROJECT_DIR/potential_takeovers.txt" || true
else
    touch "$PROJECT_DIR/cnames.txt"
    touch "$PROJECT_DIR/potential_takeovers.txt"
fi

# 3. Port Scanning
echo "[NAABU] Scanning for open ports ($NAABU_PORTS)..."
if [ "$SUB_COUNT" -gt 0 ]; then
    cat "$PROJECT_DIR/subdomains.txt" | naabu -silent -p "$NAABU_PORTS" -o "$PROJECT_DIR/ports.txt"
else
    echo "[NAABU] No subdomains to scan."
fi
echo "[NAABU] Port scan completed. Results saved."

# 4. Vulnerability & Takeover Check (Nuclei)
echo "[NUCLEI] Running templates with tags: $NUCLEI_TAGS..."
if [ "$ALIVE_COUNT" -gt 0 ]; then
    nuclei -l "$PROJECT_DIR/alive.txt" -tags "$NUCLEI_TAGS" -silent -nc -o "$PROJECT_DIR/vulnerabilities.txt"
    echo "[NUCLEI] Scan complete."
else
    echo "[NUCLEI] No live hosts to scan."
    touch "$PROJECT_DIR/vulnerabilities.txt"
fi

# 5. Passive URLs & Fuzzing Logic
echo "[GAU] Fetching historical URLs..."
if [ "$SUB_COUNT" -gt 0 ] && [ "$IS_IP" = false ]; then
    cat "$PROJECT_DIR/subdomains.txt" | gau > "$PROJECT_DIR/gau_urls.txt"
else
    touch "$PROJECT_DIR/gau_urls.txt"
fi
URL_COUNT=$(wc -l < "$PROJECT_DIR/gau_urls.txt")
echo "[GAU] Found $URL_COUNT historical URLs"

# 6. Active Crawling with Katana
if [ "$SKIP_KATANA" = true ]; then
    echo "[KATANA] Skipping active crawling as per profile."
    touch "$PROJECT_DIR/katana_urls.txt"
else
    echo "[KATANA] Starting active crawling..."
    if [ "$ALIVE_COUNT" -gt 0 ]; then
        cat "$PROJECT_DIR/alive.txt" | katana -jc -jsl -H "$HEADER" -silent > "$PROJECT_DIR/katana_urls.txt"
        echo "[KATANA] Active crawling finished"
    else
        echo "[KATANA] No live hosts to crawl, skipping."
        touch "$PROJECT_DIR/katana_urls.txt"
    fi
fi

# 7. Intelligent URL Filtering (GF Patterns)
echo "[GF] Extracting interesting parameters and sensitive endpoints..."
cat "$PROJECT_DIR/gau_urls.txt" "$PROJECT_DIR/katana_urls.txt" | sort -u > "$PROJECT_DIR/all_urls.txt"
mkdir -p "$PROJECT_DIR/fuzzing"
# Loop through popular GF patterns
for pattern in redirect ssrf ssti idor lfi rce xss base64 sqli; do
    gf "$pattern" "$PROJECT_DIR/all_urls.txt" > "$PROJECT_DIR/fuzzing/$pattern.txt" 2>/dev/null
done
# Also extract interesting extensions
grep -E "\.config|\.env|\.backup|\.sql|\.php|\.jsp|\.asp" "$PROJECT_DIR/all_urls.txt" > "$PROJECT_DIR/fuzzing/sensitive_ext.txt"
echo "[GF] Filtering complete. Results in $PROJECT_DIR/fuzzing/"

# 8. Advanced Playwright Crawler & JS Analyzer
echo "[PLAYWRIGHT] Running deep crawler and asset downloader..."
if [ -f "/app/backend/scripts/active_crawler.js" ]; then
    node /app/backend/scripts/active_crawler.js "$PROJECT_DIR/alive.txt" "$PROJECT_DIR" "$HEADER"
    
    # New: Hash Comparison Logic (Monitoring)
    if [ -d "$PROJECT_DIR/assets" ]; then
        echo "[MONITOR] Calculating JS hashes for change detection..."
        find "$PROJECT_DIR/assets" -type f -name "*.js" -exec sha256sum {} + > "$PROJECT_DIR/js_hashes.txt"
    fi
else
    echo "[PLAYWRIGHT] Crawler script not found, skipping."
fi

# 9. Secrets scanning
echo "[GITLEAKS] Scanning downloaded assets for secrets..."
if [ -d "$PROJECT_DIR/assets" ]; then
    gitleaks detect --no-git --source="$PROJECT_DIR/assets" -v > "$PROJECT_DIR/secrets.json" || true
    echo "[GITLEAKS] Secret scan done."
fi

echo "[SYSTEM] Pipeline compilation complete for $TARGET."
