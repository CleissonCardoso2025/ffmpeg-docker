# 🎬 FFmpeg Media API v3.0.0

API REST profissional para processamento de **áudio**, **vídeo** e **HTML animado → MP4** usando FFmpeg + Puppeteer. Desenvolvida com Node.js, Express, fluent-ffmpeg e puppeteer-core.

## 🎵 Áudio

- **Conversão de formatos**: MP3, WAV, OGG
- **Normalização de volume**: Ajuste automático de loudness com EBU R128
- **Reverb personalizável**: Efeito de reverberação
- **Compressor dinâmico**: Controle de dinâmica
- **Mix de áudios**: Combine múltiplos arquivos
- **Equalização**: Ajuste de graves e agudos
- **Fade in/out**: Transições suaves
- **Gate**: Remoção de ruído de fundo
- **Crossfade**: Transição entre áudios
- **Processamento combinado**: Reverb + Normalização + Conversão

## 🎬 Vídeo

- **Conversão**: MP4 (H.264), WebM (VP9), GIF animado
- **Redimensionar**: Qualquer resolução
- **Cortar (Trim)**: Por timestamp
- **Comprimir**: CRF + presets avançados
- **Velocidade**: Acelerar/desacelerar
- **Rotacionar**: 90°, 180°, 270°
- **Concatenar**: Juntar múltiplos vídeos
- **Marca d'água**: Com posição e opacidade
- **Extrair áudio**: MP3, WAV, OGG
- **Adicionar áudio**: Mixar ou substituir
- **Remover áudio**: Vídeo mudo
- **Thumbnail**: Captura de frame

## 🔥 HTML Animado → MP4

O recurso mais poderoso! Renderiza **qualquer HTML/CSS/JS animado** em vídeo MP4 de alta qualidade:

- **Animações CSS**: `@keyframes`, transições, transforms
- **JavaScript**: Canvas, Three.js, animações dinâmicas
- **Resolução**: Até 4K
- **Transparência**: WebM com alpha channel
- **URL → MP4**: Grave qualquer site como vídeo
- **Slideshow**: Imagens → vídeo
- **Texto animado**: Texto → vídeo com efeitos

## 🚀 Instalação

### Deploy com Docker

```bash
docker-compose up -d --build
```

### Rebuild após mudanças

```bash
docker-compose down && docker-compose up -d --build
```

## 📡 Endpoints

### 🔥 HTML → MP4 (Estrela da API)

```bash
# HTML animado inline → MP4
curl -X POST http://localhost:9000/video/html-to-mp4 \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><head><style>body{margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}.text{font-size:120px;font-weight:900;color:transparent;background:linear-gradient(45deg,#e94560,#0f3460,#16213e,#e94560);background-size:300% 300%;-webkit-background-clip:text;background-clip:text;animation:gradient 3s ease infinite,float 2s ease-in-out infinite}@keyframes gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}</style></head><body><div class=\"text\">HELLO WORLD</div></body></html>",
    "width": 1920,
    "height": 1080,
    "duration": 5,
    "fps": 30,
    "crf": 18
  }' --output video.mp4

# Gravar URL como vídeo
curl -X POST http://localhost:9000/video/url-to-mp4 \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "duration": 10,
    "fps": 30
  }' --output recording.mp4
```

### 🎬 Vídeo

```bash
# Converter para MP4
curl -X POST http://localhost:9000/convert/video/to/mp4 \
  -F "file=@video.mov" --output converted.mp4

# Converter para GIF
curl -X POST http://localhost:9000/convert/video/to/gif \
  -F "file=@video.mp4" -F "fps=15" -F "width=480" --output anim.gif

# Redimensionar
curl -X POST http://localhost:9000/video/resize \
  -F "file=@video.mp4" -F "width=1280" -F "height=720" --output resized.mp4

# Cortar
curl -X POST http://localhost:9000/video/trim \
  -F "file=@video.mp4" -F "start=00:00:05" -F "duration=00:00:10" --output trimmed.mp4

# Comprimir
curl -X POST http://localhost:9000/video/compress \
  -F "file=@video.mp4" -F "crf=28" -F "preset=slow" --output compressed.mp4

# Velocidade 2x
curl -X POST http://localhost:9000/video/speed \
  -F "file=@video.mp4" -F "speed=2.0" --output fast.mp4

# Rotacionar 90°
curl -X POST http://localhost:9000/video/rotate \
  -F "file=@video.mp4" -F "angle=90" --output rotated.mp4

# Marca d'água
curl -X POST http://localhost:9000/video/watermark \
  -F "video=@video.mp4" -F "watermark=@logo.png" \
  -F "position=bottomright" -F "opacity=0.7" --output watermarked.mp4

# Extrair áudio
curl -X POST http://localhost:9000/video/extract-audio \
  -F "file=@video.mp4" -F "format=mp3" --output audio.mp3

# Thumbnail
curl -X POST http://localhost:9000/video/thumbnail \
  -F "file=@video.mp4" -F "timestamp=00:00:05" --output thumb.jpg

# Texto → Vídeo
curl -X POST http://localhost:9000/video/text-to-video \
  -H "Content-Type: application/json" \
  -d '{"text": "Olá Mundo!", "duration": 5, "animation": "fade"}' --output text.mp4

# Slideshow de imagens
curl -X POST http://localhost:9000/video/images-to-video \
  -F "images=@photo1.jpg" -F "images=@photo2.jpg" -F "images=@photo3.jpg" \
  -F "durationPerImage=3" --output slideshow.mp4
```

### 🎵 Áudio

```bash
# Converter para MP3
curl -X POST http://localhost:9000/convert/audio/to/mp3 \
  -F "file=@audio.wav" --output result.mp3

# Normalizar + MP3
curl -X POST http://localhost:9000/audio/normalize-mp3 \
  -F "file=@audio.wav" -F "volumeBoost=1.5" --output normalized.mp3

# Probe
curl -X POST http://localhost:9000/probe -F "file=@audio.mp3"
```

## 📋 Lista completa de endpoints

| Categoria      | Endpoint                           | Descrição             |
| -------------- | ---------------------------------- | --------------------- |
| **Áudio**      | `POST /convert/audio/to/mp3`       | Converter para MP3    |
|                | `POST /convert/audio/to/wav`       | Converter para WAV    |
|                | `POST /convert/audio/to/ogg`       | Converter para OGG    |
|                | `POST /audio/normalize-mp3`        | Normalizar + MP3      |
|                | `POST /audio/normalize-ogg`        | Normalizar + OGG      |
|                | `POST /audio/reverb-normalize-mp3` | Reverb+Normal+MP3     |
|                | `POST /audio/reverb-normalize-ogg` | Reverb+Normal+OGG     |
|                | `POST /audio/mix`                  | Mix 2 áudios          |
|                | `POST /audio/reverb`               | Adicionar reverb      |
|                | `POST /audio/compress`             | Compressor dinâmico   |
|                | `POST /audio/normalize`            | Normalização loudness |
|                | `POST /audio/fade`                 | Fade in/out           |
|                | `POST /audio/eq`                   | Equalização           |
|                | `POST /audio/crossfade`            | Crossfade             |
|                | `POST /audio/gate`                 | Noise gate            |
|                | `POST /probe`                      | Info do arquivo       |
| **Vídeo**      | `POST /convert/video/to/mp4`       | Converter para MP4    |
|                | `POST /convert/video/to/webm`      | Converter para WebM   |
|                | `POST /convert/video/to/gif`       | Converter para GIF    |
|                | `POST /video/resize`               | Redimensionar         |
|                | `POST /video/trim`                 | Cortar                |
|                | `POST /video/compress`             | Comprimir             |
|                | `POST /video/speed`                | Velocidade            |
|                | `POST /video/rotate`               | Rotacionar            |
|                | `POST /video/concat`               | Concatenar            |
|                | `POST /video/watermark`            | Marca d'água          |
|                | `POST /video/extract-audio`        | Extrair áudio         |
|                | `POST /video/add-audio`            | Adicionar áudio       |
|                | `POST /video/remove-audio`         | Remover áudio         |
|                | `POST /video/thumbnail`            | Thumbnail             |
|                | `POST /video/probe`                | Info do vídeo         |
| **🔥 Geração** | `POST /video/html-to-mp4`          | HTML animado → MP4    |
|                | `POST /video/url-to-mp4`           | URL → MP4             |
|                | `POST /video/images-to-video`      | Slideshow             |
|                | `POST /video/text-to-video`        | Texto → vídeo         |

## ⚙️ Configurações do HTML→MP4

| Parâmetro           | Tipo    | Padrão | Descrição                      |
| ------------------- | ------- | ------ | ------------------------------ |
| `html`              | string  | -      | HTML completo (obrigatório)    |
| `width`             | number  | 1920   | Largura em pixels              |
| `height`            | number  | 1080   | Altura em pixels               |
| `duration`          | number  | 5      | Duração em segundos            |
| `fps`               | number  | 30     | Frames por segundo             |
| `crf`               | number  | 18     | Qualidade (0-51, menor=melhor) |
| `preset`            | string  | medium | Velocidade de encoding         |
| `format`            | string  | mp4    | Formato (mp4/webm)             |
| `transparent`       | boolean | false  | Fundo transparente (WebM)      |
| `deviceScaleFactor` | number  | 1      | Escala do dispositivo          |
