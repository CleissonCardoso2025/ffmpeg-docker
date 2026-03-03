FROM node:18-alpine

# FFmpeg + Chromium + dependências para Puppeteer
RUN apk add --no-cache \
  ffmpeg \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  font-noto \
  font-noto-emoji \
  ttf-freefont \
  ttf-liberation \
  fontconfig \
  && fc-cache -f -v

# Puppeteer config para Alpine
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.js ./

EXPOSE 3000

CMD ["npm", "start"]
