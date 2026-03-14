FROM kalilinux/kali-rolling

# Evitar diálogos interactivos
ENV DEBIAN_FRONTEND=noninteractive

# Configuración de mirrors y robustez de red para APT
# Usamos http.kali.org para evitar problemas de certificados SSL en los nodos CDN regionales
RUN echo "deb http://http.kali.org/kali kali-rolling main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "Acquire::https::Verify-Peer \"false\";" > /etc/apt/apt.conf.d/99verify-peer.conf && \
    echo "Acquire::Retries \"3\";" > /etc/apt/apt.conf.d/80-retries

# Actualización e instalación de dependencias base
RUN apt-get update --fix-missing && apt-get install -y --no-install-recommends \
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
    postgresql \
    postgresql-contrib \
    libpq-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Instalación de Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Instalación de Go 1.25.7 (Versión requerida por las últimas herramientas de ProjectDiscovery)
RUN cd /tmp \
    && wget -q https://go.dev/dl/go1.25.7.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.25.7.linux-amd64.tar.gz \
    && rm go1.25.7.linux-amd64.tar.gz

# Configuración de variables de entorno para Go
ENV GOPATH=/root/go
ENV PATH=$PATH:/usr/local/go/bin:$GOPATH/bin
ENV GOTOOLCHAIN=local
ENV CGO_ENABLED=1

# --- INSTALACIÓN DE HERRAMIENTAS CON VERSIONES FIJAS ---
# Usamos versiones específicas para garantizar que el build no se rompa en el futuro
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.13.0
RUN go install -v github.com/projectdiscovery/httpx/cmd/httpx@v1.9.0
RUN go install -v github.com/projectdiscovery/katana/cmd/katana@v1.0.3
RUN go install -v github.com/projectdiscovery/cdncheck/cmd/cdncheck@v1.1.0
RUN go install -v github.com/lc/gau/v2/cmd/gau@v2.2.3
RUN go install -v github.com/tomnomnom/waybackurls@latest
RUN go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@v3.3.0
RUN go install -v github.com/tomnomnom/gf@latest

# Configuración de patrones para GF (Interesting Params)
RUN git clone https://github.com/tomnomnom/gf /tmp/gf-src && \
    mkdir -p /root/.gf && \
    cp /tmp/gf-src/examples/*.json /root/.gf/ && \
    rm -rf /tmp/gf-src
RUN git clone https://github.com/1ndianl33t/Gf-Patterns /tmp/gf-patterns && \
    cp /tmp/gf-patterns/*.json /root/.gf/ && \
    rm -rf /tmp/gf-patterns

# Instalación de Naabu v2.3.1 (via binario)
RUN cd /tmp && \
    wget -q https://github.com/projectdiscovery/naabu/releases/download/v2.3.1/naabu_2.3.1_linux_amd64.zip && \
    unzip naabu_2.3.1_linux_amd64.zip naabu && \
    mv naabu /usr/local/bin/naabu && \
    chmod +x /usr/local/bin/naabu && \
    rm naabu_2.3.1_linux_amd64.zip

RUN touch /root/.gau.toml

# Instalación de Gitleaks v8.18.2
RUN cd /tmp && \
    wget -q https://github.com/zricethezav/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz && \
    tar -zxf gitleaks_8.18.2_linux_x64.tar.gz gitleaks && \
    mv gitleaks /usr/local/bin/gitleaks && \
    chmod +x /usr/local/bin/gitleaks && \
    rm gitleaks_8.18.2_linux_x64.tar.gz

# --- SECCIÓN PLAYWRIGHT ---
# Instalamos manualmente las dependencias de sistema de Chromium para evitar
# que playwright install-deps use mirrors CDN con SSL roto.
# Luego solo descargamos el binario del navegador (sin tocar apt).
RUN apt-get update --fix-missing && \
    apt-get install -y --no-install-recommends --fix-missing \
        libfreetype6 \
        fonts-wqy-zenhei \
        libpixman-1-0 \
        libxcb-shm0 \
        libdatrie1 \
        libsm6 \
        libunwind8 \
        x11-xkb-utils \
        xfonts-utils \
        xvfb \
        libglib2.0-0 \
        libnss3 \
        libnspr4 \
        libdbus-1-3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libxkbcommon0 \
        libasound2t64 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Descarga solo el binario de Chromium (no toca apt)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright@1.47.0 install chromium

# Configuración del directorio de trabajo
WORKDIR /app

# Exponer puertos (Backend API / WebSockets)
EXPOSE 3000

# Script de arranque robusto (Inicia Postgres, Crea DB y ejecuta Backend)
CMD ["sh", "-c", "service postgresql start && \
    sleep 3 && \
    su - postgres -c \"psql -c 'CREATE DATABASE screamer;'\" || true && \
    su - postgres -c \"psql -c \\\"ALTER USER postgres WITH PASSWORD 'postgres';\\\"\" && \
    cd /app/backend && \
    rm -rf node_modules package-lock.json && \
    npm install && \
    node server.js"]