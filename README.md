# 🎬 FFmpeg Media API v3.0.0

API REST profissional para processamento de **áudio**, **vídeo**, **transições** e **HTML animado → MP4** usando FFmpeg + Puppeteer.

Desenvolvida com Node.js, Express, fluent-ffmpeg e puppeteer-core.

---

## 🚀 Instalação e Deploy

```bash
# Build e rodar
docker-compose up -d --build

# Rebuild após mudanças
docker-compose down && docker-compose up -d --build
```

A API ficará disponível em `http://localhost:9000`

---

## 📋 Todos os Endpoints

### 🎵 ÁUDIO — Conversão

| Endpoint                | Método | Descrição                                                                | Parâmetros         |
| ----------------------- | ------ | ------------------------------------------------------------------------ | ------------------ |
| `/convert/audio/to/mp3` | POST   | Converte qualquer arquivo de áudio para formato **MP3**                  | `file` (form-data) |
| `/convert/audio/to/wav` | POST   | Converte qualquer arquivo de áudio para formato **WAV** (sem compressão) | `file` (form-data) |
| `/convert/audio/to/ogg` | POST   | Converte qualquer arquivo de áudio para formato **OGG Vorbis**           | `file` (form-data) |

### 🎵 ÁUDIO — Processamento

| Endpoint                      | Método | Descrição                                                                                                          | Parâmetros                                                                        |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/audio/normalize`            | POST   | **Normaliza o volume** do áudio para padrão broadcast (EBU R128). Ideal para deixar todos os áudios no mesmo nível | `file`                                                                            |
| `/audio/normalize-mp3`        | POST   | Normaliza volume com controle total + converte para **MP3 44100Hz**                                                | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| `/audio/normalize-ogg`        | POST   | Normaliza volume + converte para **OGG 44100Hz**                                                                   | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| `/audio/reverb`               | POST   | Adiciona efeito de **reverberação** (eco). Simula som em ambientes como igrejas                                    | `file`, `decay`, `delay`                                                          |
| `/audio/compress`             | POST   | **Compressor dinâmico** — reduz diferença entre partes altas e baixas. Essencial para podcasts                     | `file`, `threshold`, `ratio`, `attack`, `release`                                 |
| `/audio/fade`                 | POST   | Adiciona **Fade In** no início e **Fade Out** no final                                                             | `file`, `duration` (segundos)                                                     |
| `/audio/eq`                   | POST   | **Equalização** — ajusta graves (bass) e agudos (treble)                                                           | `file`, `bass` (dB), `treble` (dB)                                                |
| `/audio/gate`                 | POST   | **Noise Gate** — remove ruído de fundo (ar-condicionado, chiado)                                                   | `file`, `threshold`                                                               |
| `/audio/reverb-normalize-mp3` | POST   | **Tudo em um**: Reverb + Normalização + Volume + MP3                                                               | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |
| `/audio/reverb-normalize-ogg` | POST   | **Tudo em um**: Reverb + Normalização + Volume + OGG                                                               | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |

### 🎵 ÁUDIO — Combinar Múltiplos

| Endpoint           | Método | Descrição                                                                      | Parâmetros                                     |
| ------------------ | ------ | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| `/audio/mix`       | POST   | **Mixa 2 áudios** — toca os dois **ao mesmo tempo** (sobrepostos)              | `audio1`, `audio2` (form-data)                 |
| `/audio/concat`    | POST   | **Concatena áudios em sequência** — junta 2 a 10 áudios **um depois do outro** | `audios[]` (form-data), `format` (mp3/wav/ogg) |
| `/audio/crossfade` | POST   | **Crossfade entre 2 áudios** — transição suave do primeiro para o segundo      | `audio1`, `audio2` (form-data), `duration`     |

### 🎵 ÁUDIO — Informações

| Endpoint | Método | Descrição                                                                     | Parâmetros         |
| -------- | ------ | ----------------------------------------------------------------------------- | ------------------ |
| `/probe` | POST   | Retorna **informações técnicas** do arquivo: formato, codec, duração, bitrate | `file` (form-data) |

---

### 🎬 VÍDEO — Conversão

| Endpoint                 | Método | Descrição                                                            | Parâmetros              |
| ------------------------ | ------ | -------------------------------------------------------------------- | ----------------------- |
| `/convert/video/to/mp4`  | POST   | Converte qualquer vídeo para **MP4 H.264** — formato mais compatível | `file`, `crf`, `preset` |
| `/convert/video/to/webm` | POST   | Converte para **WebM VP9** — format otimizado para web               | `file`, `crf`           |
| `/convert/video/to/gif`  | POST   | Converte vídeo para **GIF animado** com paleta otimizada             | `file`, `fps`, `width`  |

### 🎬 VÍDEO — Processamento

| Endpoint              | Método | Descrição                                            | Parâmetros                                                        |
| --------------------- | ------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `/video/resize`       | POST   | **Redimensiona** o vídeo para qualquer resolução     | `file`, `width`, `height`                                         |
| `/video/trim`         | POST   | **Corta** um trecho do vídeo por timestamp           | `file`, `start` (HH:MM:SS), `duration` (HH:MM:SS)                 |
| `/video/compress`     | POST   | **Comprime** o vídeo reduzindo tamanho do arquivo    | `file`, `crf`, `preset`, `maxWidth`                               |
| `/video/speed`        | POST   | **Altera velocidade** — acelera ou câmera lenta      | `file`, `speed` (2.0=2x, 0.5=metade)                              |
| `/video/rotate`       | POST   | **Rotaciona** o vídeo                                | `file`, `angle` (90, 180, 270)                                    |
| `/video/concat`       | POST   | **Junta vários vídeos** em sequência (sem transição) | `videos[]` (form-data, até 10)                                    |
| `/video/watermark`    | POST   | Adiciona **marca d'água** (logo) sobre o vídeo       | `video`, `watermark` (form-data), `position`, `opacity`, `margin` |
| `/video/remove-audio` | POST   | **Remove a trilha de áudio** do vídeo (vídeo mudo)   | `file`                                                            |

### 🎬 VÍDEO — Áudio ↔ Vídeo

| Endpoint               | Método | Descrição                                                   | Parâmetros                                           |
| ---------------------- | ------ | ----------------------------------------------------------- | ---------------------------------------------------- |
| `/video/extract-audio` | POST   | **Extrai o áudio** de um vídeo e salva como MP3, WAV ou OGG | `file`, `format`                                     |
| `/video/add-audio`     | POST   | **Adiciona áudio** a um vídeo. Pode substituir ou mixar     | `video`, `audio` (form-data), `replace` (true/false) |

### 🎬 VÍDEO — Informações

| Endpoint           | Método | Descrição                                                           | Parâmetros                   |
| ------------------ | ------ | ------------------------------------------------------------------- | ---------------------------- |
| `/video/probe`     | POST   | **Informações detalhadas** do vídeo: codec, resolução, fps, bitrate | `file`                       |
| `/video/thumbnail` | POST   | Captura um **frame** do vídeo como imagem JPG                       | `file`, `timestamp`, `width` |

---

### ✨ TRANSIÇÕES DE VÍDEO (55+ efeitos)

| Endpoint                   | Método | Descrição                                                                                                       | Parâmetros                                                                                    |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/video/transitions`       | GET    | **Lista todas as 55+ transições** disponíveis organizadas por categoria                                         | —                                                                                             |
| `/video/transition`        | POST   | Aplica uma **transição entre 2 vídeos** (ex: fade, wipe, slide, dissolve). Inclui crossfade de áudio automático | `video1`, `video2` (form-data), `transition`, `transitionDuration`, `crf`                     |
| `/video/concat-transition` | POST   | **Concatena múltiplos vídeos COM transições**. Pode usar transição diferente entre cada par                     | `videos[]` (form-data), `transition`, `transitions` (JSON array), `transitionDuration`, `crf` |

#### 🎭 Transições disponíveis (por categoria):

| Categoria      | Transições                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| **Fade**       | `fade`, `fadeblack`, `fadewhite`, `fadegrays`, `dissolve`                             |
| **Wipe**       | `wipeleft`, `wiperight`, `wipeup`, `wipedown`, `wipetl`, `wipetr`, `wipebl`, `wipebr` |
| **Slide**      | `slideleft`, `slideright`, `slideup`, `slidedown`                                     |
| **Smooth**     | `smoothleft`, `smoothright`, `smoothup`, `smoothdown`                                 |
| **Cover**      | `coverleft`, `coverright`, `coverup`, `coverdown`                                     |
| **Reveal**     | `revealleft`, `revealright`, `revealup`, `revealdown`                                 |
| **Circle**     | `circlecrop`, `circleclose`, `circleopen`, `rectcrop`                                 |
| **Diagonal**   | `diagbl`, `diagbr`, `diagtl`, `diagtr`                                                |
| **Slice**      | `hlslice`, `hrslice`, `vuslice`, `vdslice`                                            |
| **Wind**       | `hlwind`, `hrwind`, `vuwind`, `vdwind`                                                |
| **Open/Close** | `horzclose`, `horzopen`, `vertclose`, `vertopen`                                      |
| **Squeeze**    | `squeezev`, `squeezeh`                                                                |
| **Especiais**  | `pixelize`, `radial`, `hblur`, `distance`, `zoomin`                                   |

---

### 🔥 GERAÇÃO DE VÍDEO

| Endpoint                 | Método | Descrição                                                                | Parâmetros                                                                                    |
| ------------------------ | ------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `/video/html-to-mp4`     | POST   | 🔥 **HTML animado → MP4** — Renderiza HTML/CSS/JS com animações em vídeo | `html` (JSON), `width`, `height`, `duration`, `fps`, `crf`, `preset`, `format`, `transparent` |
| `/video/url-to-mp4`      | POST   | 🔥 **Grava uma URL como vídeo** — Abre qualquer site e grava a tela      | `url` (JSON), `width`, `height`, `duration`, `fps`, `waitForSelector`, `waitMs`               |
| `/video/images-to-video` | POST   | **Slideshow de imagens** — Imagens viram vídeo com duração configurável  | `images[]` (form-data), `durationPerImage`, `fps`, `width`, `height`                          |
| `/video/text-to-video`   | POST   | **Texto animado → vídeo** — Texto com efeitos (fade, scroll, typewriter) | `text` (JSON), `duration`, `fontSize`, `fontColor`, `bgColor`, `animation`                    |

---

## 💡 Exemplos de Uso

### ✨ Transição entre 2 vídeos

```bash
# Transição fade entre 2 vídeos
curl -X POST http://localhost:9000/video/transition \
  -F "video1=@intro.mp4" \
  -F "video2=@conteudo.mp4" \
  -F "transition=fade" \
  -F "transitionDuration=1.5" \
  --output resultado.mp4

# Transição slideright
curl -X POST http://localhost:9000/video/transition \
  -F "video1=@parte1.mp4" \
  -F "video2=@parte2.mp4" \
  -F "transition=slideright" \
  -F "transitionDuration=1" \
  --output slide.mp4
```

### ✨ Concatenar múltiplos vídeos com transições

```bash
# Mesma transição entre todos
curl -X POST http://localhost:9000/video/concat-transition \
  -F "videos=@intro.mp4" \
  -F "videos=@parte1.mp4" \
  -F "videos=@parte2.mp4" \
  -F "videos=@encerramento.mp4" \
  -F "transition=fadeblack" \
  -F "transitionDuration=1" \
  --output video-completo.mp4

# Transições diferentes entre cada par
curl -X POST http://localhost:9000/video/concat-transition \
  -F "videos=@intro.mp4" \
  -F "videos=@parte1.mp4" \
  -F "videos=@parte2.mp4" \
  -F 'transitions=["wipeleft","dissolve"]' \
  -F "transitionDuration=1.5" \
  --output video-customizado.mp4
```

### ✨ Ver todas as transições

```bash
curl http://localhost:9000/video/transitions
```

### 🔥 HTML animado → MP4

```bash
curl -X POST http://localhost:9000/video/html-to-mp4 \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><head><style>body{margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}.text{font-size:120px;font-weight:900;color:transparent;background:linear-gradient(45deg,#e94560,#0f3460,#16213e,#e94560);background-size:300% 300%;-webkit-background-clip:text;background-clip:text;animation:gradient 3s ease infinite}@keyframes gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}</style></head><body><div class=\"text\">HELLO WORLD</div></body></html>",
    "width": 1920,
    "height": 1080,
    "duration": 5,
    "fps": 30,
    "crf": 18
  }' --output video.mp4
```

### 🎵 Concatenar áudios em sequência

```bash
curl -X POST http://localhost:9000/audio/concat \
  -F "audios=@intro.mp3" \
  -F "audios=@conteudo.mp3" \
  -F "audios=@encerramento.mp3" \
  -F "format=mp3" \
  --output podcast-completo.mp3
```

### 🎬 Vídeo — Outros exemplos

```bash
# Converter para MP4
curl -X POST http://localhost:9000/convert/video/to/mp4 \
  -F "file=@video.mov" --output converted.mp4

# Comprimir vídeo
curl -X POST http://localhost:9000/video/compress \
  -F "file=@video.mp4" -F "crf=28" -F "preset=slow" --output compressed.mp4

# Cortar trecho
curl -X POST http://localhost:9000/video/trim \
  -F "file=@video.mp4" -F "start=00:00:05" -F "duration=00:00:10" --output trecho.mp4

# Marca d'água
curl -X POST http://localhost:9000/video/watermark \
  -F "video=@video.mp4" -F "watermark=@logo.png" \
  -F "position=bottomright" -F "opacity=0.7" --output watermarked.mp4

# Gravar URL como vídeo
curl -X POST http://localhost:9000/video/url-to-mp4 \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","duration":10,"fps":30}' --output gravacao.mp4
```

---

## ⚙️ Parâmetros do HTML → MP4

| Parâmetro           | Tipo    | Padrão | Descrição                                   |
| ------------------- | ------- | ------ | ------------------------------------------- |
| `html`              | string  | —      | HTML completo **(obrigatório)**             |
| `width`             | number  | 1920   | Largura em pixels                           |
| `height`            | number  | 1080   | Altura em pixels                            |
| `duration`          | number  | 5      | Duração em segundos                         |
| `fps`               | number  | 30     | Frames por segundo (15-60)                  |
| `crf`               | number  | 18     | Qualidade: 0=perfeito, 18=excelente, 28=bom |
| `preset`            | string  | medium | Velocidade: `ultrafast` → `veryslow`        |
| `format`            | string  | mp4    | `mp4` (H.264) ou `webm` (VP9)               |
| `transparent`       | boolean | false  | Fundo transparente (só `webm`)              |
| `deviceScaleFactor` | number  | 1      | Escala (2 = Retina/4K)                      |

---

## 📊 Resumo Total de Endpoints

| Categoria             | Quantidade       |
| --------------------- | ---------------- |
| Áudio — Conversão     | 3                |
| Áudio — Processamento | 10               |
| Áudio — Combinar      | 3                |
| Áudio — Info          | 1                |
| Vídeo — Conversão     | 3                |
| Vídeo — Processamento | 8                |
| Vídeo — Áudio↔Vídeo   | 2                |
| Vídeo — Info          | 2                |
| ✨ Transições         | 3 (55+ efeitos)  |
| 🔥 Geração de Vídeo   | 4                |
| **Total**             | **39 endpoints** |
