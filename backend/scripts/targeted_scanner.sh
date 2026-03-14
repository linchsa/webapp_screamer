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
fi

# ─── MODULE: PORT SCAN ───────────────────────────────────────────────────────
if has_module "ports"; then
    echo "[NMAP] Starting port scan on $DOMAIN..."
    nmap -sV -T4 --top-ports 1000 -Pn "$DOMAIN" -oJ "$PROJECT_DIR/ports.json" -oN "$PROJECT_DIR/ports.txt" 2>/dev/null || true
    echo "[NMAP] Port scan complete."
fi

# ─── MODULE: JS SECRETS ──────────────────────────────────────────────────────
if has_module "js_secrets"; then
    echo "[KATANA] Crawling JS files on $DOMAIN..."
    mkdir -p "$PROJECT_DIR/assets"
    KATANA_ARGS="-silent -jc -jsl -depth 3 -js-crawl"
    if [ -n "$HEADER" ]; then
        echo "https://$DOMAIN" | katana $KATANA_ARGS -H "$HEADER" 2>/dev/null \
            | grep -E "\.js$" | sort -u > "$PROJECT_DIR/js_urls.txt" || true
    else
        echo "https://$DOMAIN" | katana $KATANA_ARGS 2>/dev/null \
            | grep -E "\.js$" | sort -u > "$PROJECT_DIR/js_urls.txt" || true
    fi
    JS_COUNT=$(wc -l < "$PROJECT_DIR/js_urls.txt" 2>/dev/null || echo 0)
    echo "[KATANA] Found $JS_COUNT JS files. Downloading for analysis..."

    # Download JS files
    if [ "$JS_COUNT" -gt 0 ]; then
        while IFS= read -r url; do
            fname=$(echo "$url" | md5sum | cut -d' ' -f1).js
            HEADER_ARG=""
            [ -n "$HEADER" ] && HEADER_ARG="-H \"$HEADER\""
            curl -sk $HEADER_ARG -o "$PROJECT_DIR/assets/$fname" "$url" 2>/dev/null || true
        done < "$PROJECT_DIR/js_urls.txt"
    fi

    # Scan with gitleaks
    echo "[GITLEAKS] Scanning for secrets..."
    gitleaks detect --no-git --source="$PROJECT_DIR/assets" --report-format=json \
        --report-path="$PROJECT_DIR/secrets.json" -q 2>/dev/null || true
    # Also scan with nuclei exposure templates
    echo "[NUCLEI] Scanning for exposed keys & tokens..."
    if [ "$JS_COUNT" -gt 0 ]; then
        nuclei -l "$PROJECT_DIR/js_urls.txt" -tags "exposure,token" -silent -nc \
            -json -o "$PROJECT_DIR/nuclei_secrets.json" 2>/dev/null || true
    fi
    echo "[JS SECRETS] Secret scanning complete."
fi

# ─── MODULE: ENDPOINTS ───────────────────────────────────────────────────────
if has_module "endpoints"; then
    echo "[ENDPOINTS] Crawling $DOMAIN for API endpoints..."
    KATANA_ARGS="-silent -jc -jsl -depth 4"
    if [ -n "$HEADER" ]; then
        echo "https://$DOMAIN" | katana $KATANA_ARGS -H "$HEADER" 2>/dev/null \
            > "$PROJECT_DIR/katana_urls.txt" || true
    else
        echo "https://$DOMAIN" | katana $KATANA_ARGS 2>/dev/null \
            > "$PROJECT_DIR/katana_urls.txt" || true
    fi
    # Fetch historical URLs from gau
    echo "[GAU] Fetching historical URLs..."
    echo "$DOMAIN" | gau --threads 5 2>/dev/null >> "$PROJECT_DIR/katana_urls.txt" || true
    sort -u "$PROJECT_DIR/katana_urls.txt" > "$PROJECT_DIR/endpoints.txt"
    EP_COUNT=$(wc -l < "$PROJECT_DIR/endpoints.txt")
    echo "[ENDPOINTS] Found $EP_COUNT unique endpoints."
fi

# ─── MODULE: TECH FINGERPRINT ────────────────────────────────────────────────
if has_module "tech"; then
    echo "[NUCLEI] Running technology fingerprint scan on $DOMAIN..."
    echo "https://$DOMAIN" | nuclei -tags "tech,cms,panel,config" -silent -nc \
        -json -o "$PROJECT_DIR/tech.json" 2>/dev/null || true
    echo "[TECH] Fingerprinting complete."
fi

# ─── MODULE: WPSCAN ──────────────────────────────────────────────────────────
if has_module "wpscan"; then
    echo "[WPSCAN] Running WordPress audit on $DOMAIN..."
    WP_ARGS="--url https://$DOMAIN --format json --output $PROJECT_DIR/wpscan.json --no-update -t 10"
    if [ -n "$WPSCAN_KEY" ]; then
        WP_ARGS="$WP_ARGS --api-token $WPSCAN_KEY"
    fi
    if [ -n "$HEADER" ]; then
        WP_ARGS="$WP_ARGS --headers \"$HEADER\""
    fi
    wpscan $WP_ARGS 2>/dev/null || true
    echo "[WPSCAN] WordPress audit complete."
fi

echo "[SYSTEM] All selected modules complete for $DOMAIN."
