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
# Instalamos las dependencias del sistema y luego el navegador Chromium
RUN apt-get update && \
    npx playwright install-deps chromium && \
    npx playwright install chromium && \
    rm -rf /var/lib/apt/lists/*

# Configuración del directorio de trabajo
WORKDIR /app

# Exponer puertos (Backend API / WebSockets)
EXPOSE 3000

# Script de arranque
# Limpia node_modules y reinstala para asegurar compatibilidad con la arquitectura del contenedor
CMD ["sh", "-c", "cd /app/backend && rm -rf node_modules package-lock.json && npm install && npm rebuild sqlite3 && node server.js"]