FROM node:18-bookworm-slim

# FFmpeg + Chromium + dependências
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  chromium \
  ca-certificates \
  fonts-liberation \
  fonts-noto-color-emoji \
  fonts-freefont-ttf \
  fontconfig \
  python3 \
  python3-pip \
  curl \
  unzip \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -f -v

# Instalar Deno nativo
RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y \
    && mv /root/.deno/bin/deno /usr/local/bin/deno \
    && chmod +x /usr/local/bin/deno \
    && deno --version

# Instalar yt-dlp e dependências pro impersonate
RUN pip3 install --no-cache-dir --break-system-packages -U \
    "yt-dlp[default,curl-cffi]" \
    yt-dlp-ejs

# Puppeteer config para Debian
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Criar pasta de cookies e data
RUN mkdir -p /app/cookies /app/data && chmod 700 /app/cookies /app/data

COPY package.json ./
RUN npm install

# Copiar código fonte
COPY server.js ./
COPY src/ ./src/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["npm", "start"]
