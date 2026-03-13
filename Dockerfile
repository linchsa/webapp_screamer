FROM kalilinux/kali-rolling

# Avoid interactive dialogs during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Update and install base dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    unzip \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    golang \
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

# Install Node.js (for Playwright and Backend if running together, though we mount backend)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Set up Go Paths
ENV GOPATH=/root/go
ENV PATH=$PATH:/usr/local/go/bin:$GOPATH/bin

# Install Bug Bounty Tools via Go
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
RUN go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
RUN cd /tmp && \
    wget https://github.com/projectdiscovery/naabu/releases/download/v2.3.1/naabu_2.3.1_linux_amd64.zip && \
    unzip naabu_2.3.1_linux_amd64.zip && \
    mv naabu /usr/local/bin/naabu && \
    chmod +x /usr/local/bin/naabu && \
    rm naabu_2.3.1_linux_amd64.zip
RUN go install -v github.com/projectdiscovery/katana/cmd/katana@latest
RUN go install -v github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest
RUN go install -v github.com/lc/gau/v2/cmd/gau@latest
RUN go install -v github.com/tomnomnom/waybackurls@latest

# Add empty gau config to prevent warnings
RUN touch /root/.gau.toml

# Install Gitleaks
RUN cd /tmp && \
    wget https://github.com/zricethezav/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz && \
    tar -zxvf gitleaks_8.18.2_linux_x64.tar.gz && \
    mv gitleaks /usr/local/bin/gitleaks && \
    chmod +x /usr/local/bin/gitleaks

# Set up App Directory
WORKDIR /app

# The backend will be mounted at /app/backend and will install playwright dependencies
# We pre-install playwright browsers during build to save time
# But since package.json is in backend, we'll do it via global or npx
RUN npx -y playwright install --with-deps chromium

# Expose ports (Backend API / WebSockets)
EXPOSE 3000

# Start script
CMD ["sh", "-c", "cd /app/backend && rm -rf node_modules package-lock.json && npm install && npm rebuild sqlite3 && node server.js"]
