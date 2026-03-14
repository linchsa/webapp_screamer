FROM kalilinux/kali-rolling

# Evitar diálogos interactivos
ENV DEBIAN_FRONTEND=noninteractive

# --- 1. REPARACIÓN DE RED Y CERTIFICADOS ---
# Usamos HTTP para el update inicial y asegurar que los certificados se actualicen sin errores SSL
RUN echo "deb http://http.kali.org/kali kali-rolling main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    update-ca-certificates

# Configuración de robustez para APT (reintentos y saltar verificación SSL temporalmente)
RUN echo "Acquire::https::Verify-Peer \"false\";" > /etc/apt/apt.conf.d/99verify-peer.conf && \
    echo "Acquire::Retries \"5\";" > /etc/apt/apt.conf.d/80-retries

# --- 2. DEPENDENCIAS BASE ---
RUN apt-get update --fix-missing && apt-get install -y --no-install-recommends \
    curl wget git unzip jq python3 python3-pip gcc g++ make \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2t64 gnupg libpcap-dev \
    postgresql postgresql-contrib libpq-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- 3. GO (Versión 1.24.0 para asegurar compatibilidad con PD Tools) ---
# Se descarga directamente de la fuente oficial para evitar versiones obsoletas de repositorios
RUN cd /tmp && \
    wget -q https://go.dev/dl/go1.24.0.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz && \
    rm go1.24.0.linux-amd64.tar.gz

# Configuración crítica de variables de entorno para Go
ENV GOPATH=/root/go
ENV PATH=$PATH:/usr/local/go/bin:$GOPATH/bin
ENV GOTOOLCHAIN=local
ENV CGO_ENABLED=1

# --- 4. INSTALACIÓN DE HERRAMIENTAS DE PROJECT DISCOVERY ---
# Al usar Go 1.24, estas compilaciones no darán problemas de versiones
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest && \
    go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest && \
    go install -v github.com/projectdiscovery/katana/cmd/katana@latest && \
    go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest && \
    go install -v github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest

# Otras herramientas esenciales
RUN go install -v github.com/lc/gau/v2/cmd/gau@latest && \
    go install -v github.com/tomnomnom/waybackurls@latest && \
    go install -v github.com/tomnomnom/gf@latest

# --- 5. PLAYWRIGHT Y NODE ---
RUN curl -fsSL http://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Instalamos librerías necesarias para que Chromium rinda bien en Kali
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfreetype6 fonts-wqy-zenhei libpixman-1-0 libxcb-shm0 \
    xvfb libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libgbm1 libasound2t64 libcairo2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium

WORKDIR /app
EXPOSE 3000

# Script de arranque
CMD ["sh", "-c", "service postgresql start && \
    sleep 3 && \
    su - postgres -c \"psql -c 'CREATE DATABASE screamer;'\" || true && \
    su - postgres -c \"psql -c \\\"ALTER USER postgres WITH PASSWORD 'postgres';\\\"\" && \
    cd /app/backend && \
    npm install && \
    node server.js"]