#!/bin/bash
# Subdomain Discovery Script
# Usage: ./subdomain_scanner.sh <target_domain> <custom_header> <project_dir>

TARGET=$1
HEADER=$2
PROJECT_DIR=$3

# Strip wildcard prefix if present (*.example.com -> example.com)
CLEAN_TARGET="${TARGET#\*.}"

echo "[SYSTEM] Starting Subdomain Discovery for: $CLEAN_TARGET"
echo "[SYSTEM] Output directory: $PROJECT_DIR"

# Step 1: Subfinder — passive subdomain enumeration
echo "[SUBFINDER] Running passive subdomain discovery on $CLEAN_TARGET..."
subfinder -d "$CLEAN_TARGET" -all -silent > "$PROJECT_DIR/subdomains_raw.txt" 2>/dev/null

SUB_COUNT=$(wc -l < "$PROJECT_DIR/subdomains_raw.txt")
echo "[SUBFINDER] Found $SUB_COUNT potential subdomains"

if [ "$SUB_COUNT" -eq 0 ]; then
    echo "[SYSTEM] No subdomains found. Exiting."
    echo "[]" > "$PROJECT_DIR/subdomains.json"
    exit 0
fi

# Step 2: httpx — probe for live hosts, collect title/ip/tech/redirect info
echo "[HTTPX] Probing live hosts (this may take a while)..."

HTTPX_ARGS="-silent -sc -title -ip -tech-detect -follow-redirects -location -json"

if [ -n "$HEADER" ]; then
    cat "$PROJECT_DIR/subdomains_raw.txt" | httpx $HTTPX_ARGS -H "$HEADER" -o "$PROJECT_DIR/httpx_subdomains.jsonl" > /dev/null 2>&1
else
    cat "$PROJECT_DIR/subdomains_raw.txt" | httpx $HTTPX_ARGS -o "$PROJECT_DIR/httpx_subdomains.jsonl" > /dev/null 2>&1
fi

ALIVE_COUNT=$(wc -l < "$PROJECT_DIR/httpx_subdomains.jsonl")
echo "[HTTPX] Found $ALIVE_COUNT live hosts"

# Step 3: Probe the main domain's title (for soft-redirect detection)
echo "[HTTPX] Probing main domain for baseline title..."
echo "$CLEAN_TARGET" | httpx -silent -title -json 2>/dev/null | head -1 > "$PROJECT_DIR/main_domain_probe.json"
MAIN_TITLE=$(cat "$PROJECT_DIR/main_domain_probe.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('title',''))" 2>/dev/null || echo "")
echo "[SYSTEM] Main domain title baseline: \"$MAIN_TITLE\""

echo "[SYSTEM] Subdomain discovery complete. $ALIVE_COUNT live hosts identified."
