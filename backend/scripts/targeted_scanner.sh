#!/bin/bash
# Targeted Modular Scanner
# Usage: ./targeted_scanner.sh <domain> <header> <project_dir> <modules_csv> <wpscan_key>

DOMAIN=$1
HEADER=$2
PROJECT_DIR=$3
MODULES=$4          # comma-separated: waf,ports,js_secrets,endpoints,tech,wpscan
WPSCAN_KEY=$5

mkdir -p "$PROJECT_DIR"

echo "[SYSTEM] Target: $DOMAIN"
echo "[SYSTEM] Modules: $MODULES"

# Helper: is module in list?
has_module() { echo "$MODULES" | grep -qw "$1"; }

# ─── MODULE: WAF / CDN ────────────────────────────────────────────────────────
if has_module "waf"; then
    echo "[WAF] Detecting WAF/CDN for $DOMAIN..."
    echo "$DOMAIN" | cdncheck -silent -resp -json 2>/dev/null > "$PROJECT_DIR/waf.json" || true
    # Also grab x-powered-by / server / via headers with httpx
    HTTPX_ARGS="-silent -sc -title -ip -tech-detect -server -csp-probe -json"
    if [ -n "$HEADER" ]; then
        echo "$DOMAIN" | httpx $HTTPX_ARGS -H "$HEADER" 2>/dev/null > "$PROJECT_DIR/waf_httpx.json" || true
    else
        echo "$DOMAIN" | httpx $HTTPX_ARGS 2>/dev/null > "$PROJECT_DIR/waf_httpx.json" || true
    fi
    echo "[WAF] WAF/CDN detection complete."
    echo "[SYSTEM] MODULE_COMPLETE: waf"
fi

# ─── MODULE: PORT SCAN ───────────────────────────────────────────────────────
if has_module "ports"; then
    echo "[NMAP] Starting intensive port scan on $DOMAIN..."
    # Intensive and Verbose flags: -sV -sC -Pn -n -T4 -v --stats-every 10s --top-ports 1000 --open --reason
    # -oX: XML for backend parsing, -oN: Normal output for persistent terminal logs
    nmap -sV -sC -Pn -n -T4 -v --stats-every 10s --top-ports 1000 --open --reason "$DOMAIN" -oX "$PROJECT_DIR/ports.xml" -oN "$PROJECT_DIR/ports.txt" || echo "[ERR] Nmap execution failed or returned error."
    echo "[NMAP] Port scan complete."
    echo "[SYSTEM] MODULE_COMPLETE: ports"
fi

# ─── MODULE: JS SECRETS ──────────────────────────────────────────────────────
if has_module "js_secrets"; then
    echo "[KATANA] Starting live JS crawl and secret scanning on $DOMAIN..."
    mkdir -p "$PROJECT_DIR/assets"
    KATANA_ARGS="-silent -jc -jsl -depth 5 -automatic-form-fill -concurrency 10"
    
    # Real-time pipeline: Katana finds URLs -> Awk counts & filters JS -> Nuclei scans JS
    echo "[SYSTEM] LIVE_JS_SCAN_START"
    KATANA_AWK='{ count++; if(count%50==0) { print "[KATANA] Progress: " count " URLs discovered so far..."; fflush(); } if($0 ~ /\.js$/) { print $0; fflush(); } }'
    if [ -n "$HEADER" ]; then
        echo "https://$DOMAIN" | katana $KATANA_ARGS -H "$HEADER" 2>/dev/null | awk "$KATANA_AWK" | tee "$PROJECT_DIR/js_urls.txt" | nuclei -tags "exposure,token" -silent -nc -j -o "$PROJECT_DIR/nuclei_secrets_live.json" || true
    else
        echo "https://$DOMAIN" | katana $KATANA_ARGS 2>/dev/null | awk "$KATANA_AWK" | tee "$PROJECT_DIR/js_urls.txt" | nuclei -tags "exposure,token" -silent -nc -j -o "$PROJECT_DIR/nuclei_secrets_live.json" || true
    fi

    JS_COUNT=$(wc -l < "$PROJECT_DIR/js_urls.txt" 2>/dev/null || echo 0)
    echo "[KATANA] Crawl complete. $JS_COUNT JS files found. Performing deeper Gitleaks analysis..."

    # Download JS files for Gitleaks (static backup)
    if [ "$JS_COUNT" -gt 0 ]; then
        while IFS= read -r url; do
            fname=$(echo "$url" | md5sum | cut -d' ' -f1).js
            HEADER_ARG=""
            [ -n "$HEADER" ] && HEADER_ARG="-H \"$HEADER\""
            curl -sk $HEADER_ARG --max-time 10 -o "$PROJECT_DIR/assets/$fname" "$url" 2>/dev/null || true
        done < "$PROJECT_DIR/js_urls.txt"
        
        echo "[GITLEAKS] Scanning downloaded assets..."
        gitleaks detect --no-git --source="$PROJECT_DIR/assets" --report-format=json \
            --report-path="$PROJECT_DIR/secrets.json" -q 2>/dev/null || true
    fi

    echo "[JS SECRETS] Secret scanning complete."
    echo "[SYSTEM] MODULE_COMPLETE: js_secrets"
fi

# ─── MODULE: ENDPOINTS ───────────────────────────────────────────────────────
if has_module "endpoints"; then
    echo "[ENDPOINTS] Crawling $DOMAIN for API endpoints..."
    KATANA_ARGS="-silent -jc -jsl -depth 5 -automatic-form-fill -concurrency 10"
    KATANA_AWK_EP='{ count++; if(count%50==0) { print "[KATANA] Progress: " count " URLs discovered so far..."; fflush(); } print $0; fflush(); }'
    if [ -n "$HEADER" ]; then
        echo "https://$DOMAIN" | katana $KATANA_ARGS -H "$HEADER" 2>/dev/null \
            | awk "$KATANA_AWK_EP" > "$PROJECT_DIR/katana_urls.txt" || true
    else
        echo "https://$DOMAIN" | katana $KATANA_ARGS 2>/dev/null \
            | awk "$KATANA_AWK_EP" > "$PROJECT_DIR/katana_urls.txt" || true
    fi
    # Fetch historical URLs from gau
    echo "[GAU] Fetching historical URLs..."
    echo "$DOMAIN" | gau --threads 5 2>/dev/null >> "$PROJECT_DIR/katana_urls.txt" || true
    sort -u "$PROJECT_DIR/katana_urls.txt" > "$PROJECT_DIR/endpoints.txt"
    EP_COUNT=$(wc -l < "$PROJECT_DIR/endpoints.txt")
    echo "[ENDPOINTS] Found $EP_COUNT unique endpoints."
    echo "[SYSTEM] MODULE_COMPLETE: endpoints"
fi

# ─── MODULE: TECH FINGERPRINT ────────────────────────────────────────────────
if has_module "tech"; then
    echo "[NUCLEI] Running technology fingerprint scan on $DOMAIN..."
    echo "https://$DOMAIN" | nuclei -tags "tech,cms,panel,config" -silent -nc \
        -j -o "$PROJECT_DIR/tech.json" 2>/dev/null || true
    echo "[TECH] Fingerprinting complete."
    echo "[SYSTEM] MODULE_COMPLETE: tech"
fi

# ─── MODULE: WPSCAN ──────────────────────────────────────────────────────────
if has_module "wpscan"; then
    echo "[WPSCAN] WordPress audit on $DOMAIN..."
    WP_ARGS="--url https://$DOMAIN --format json --output $PROJECT_DIR/wpscan.json --no-update -t 10"
    if [ -n "$WPSCAN_KEY" ]; then
        WP_ARGS="$WP_ARGS --api-token $WPSCAN_KEY"
    fi
    if [ -n "$HEADER" ]; then
        WP_ARGS="$WP_ARGS --headers \"$HEADER\""
    fi
    wpscan $WP_ARGS 2>/dev/null || true
    echo "[WPSCAN] WordPress audit complete."
    echo "[SYSTEM] MODULE_COMPLETE: wpscan"
fi

echo "[SYSTEM] All selected modules complete for $DOMAIN."
