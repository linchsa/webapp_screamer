FROM kalilinux/kali-rolling

# Avoid interactive dialogs during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Override apt sources to use official Kali mirror via HTTP only (avoids SSL CDN issues in Docker)
RUN echo "deb http://http.kali.org/kali kali-rolling main contrib non-free non-free-firmware" > /etc/apt/sources.list
# Disable SSL verification for apt to bypass failing CDN nodes
RUN echo "Acquire::https::Verify-Peer \"false\";" > /etc/apt/apt.conf.d/99verify-peer.conf

# Update and install base dependencies (no golang from apt - we install Go manually below)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    unzip \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    gcc \
    g++ \
    make \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    gnupg \
    libpcap-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.24.0
RUN cd /tmp \
    && wget -q https://go.dev/dl/go1.24.0.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz \
    && rm go1.24.0.linux-amd64.tar.gz

# Set up Go Paths
ENV GOPATH=/root/go
ENV PATH=$PATH:/usr/local/go/bin:$GOPATH/bin
# Prevent Go from auto-downloading newer toolchains
ENV GOTOOLCHAIN=local
ENV CGO_ENABLED=1

# Install Bug Bounty Tools via Go
# Pin katana to v1.0.3 — v1.5+ requires Go 1.25 which is not yet released
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
RUN go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
RUN go install -v github.com/projectdiscovery/katana/cmd/katana@v1.0.3
RUN go install -v github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest
RUN go install -v github.com/lc/gau/v2/cmd/gau@latest
RUN go install -v github.com/tomnomnom/waybackurls@latest

# Install naabu as binary (needs libpcap, avoids cgo issues)
RUN cd /tmp && \
    wget -q https://github.com/projectdiscovery/naabu/releases/download/v2.3.1/naabu_2.3.1_linux_amd64.zip && \
    unzip naabu_2.3.1_linux_amd64.zip naabu && \
    mv naabu /usr/local/bin/naabu && \
    chmod +x /usr/local/bin/naabu && \
    rm naabu_2.3.1_linux_amd64.zip

# Add empty gau config to prevent warnings
RUN touch /root/.gau.toml

# Install Gitleaks
RUN cd /tmp && \
    wget -q https://github.com/zricethezav/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz && \
    tar -zxf gitleaks_8.18.2_linux_x64.tar.gz gitleaks && \
    mv gitleaks /usr/local/bin/gitleaks && \
    chmod +x /usr/local/bin/gitleaks && \
    rm gitleaks_8.18.2_linux_x64.tar.gz

# Set up App Directory
WORKDIR /app

# Pre-install Playwright Chromium browser
RUN npx -y playwright install --with-deps chromium

# Expose ports (Backend API / WebSockets)
EXPOSE 3000

# Start script
CMD ["sh", "-c", "cd /app/backend && rm -rf node_modules package-lock.json && npm install && npm rebuild sqlite3 && node server.js"]
