# 🎬 FFmpeg Media API v3.0.0

API REST profissional para processamento de **áudio**, **vídeo** e **HTML animado → MP4** usando FFmpeg + Puppeteer.

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

| Endpoint                      | Método | Descrição                                                                                                                  | Parâmetros                                                                        |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/audio/normalize`            | POST   | **Normaliza o volume** do áudio para padrão broadcast (EBU R128). Ideal para deixar todos os áudios no mesmo nível         | `file`                                                                            |
| `/audio/normalize-mp3`        | POST   | Normaliza volume com controle total + converte para **MP3 44100Hz**. Para quem precisa de ajuste fino                      | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| `/audio/normalize-ogg`        | POST   | Normaliza volume + converte para **OGG 44100Hz**. Mesmo que acima, mas formato OGG                                         | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| `/audio/reverb`               | POST   | Adiciona efeito de **reverberação** (eco). Simula som em ambientes como igrejas, salas grandes                             | `file`, `decay` (intensidade), `delay` (ms)                                       |
| `/audio/compress`             | POST   | **Compressor dinâmico** — reduz a diferença entre partes altas e baixas do áudio. Essencial para podcasts e vozes          | `file`, `threshold`, `ratio`, `attack`, `release`                                 |
| `/audio/fade`                 | POST   | Adiciona **Fade In** no início e **Fade Out** no final. Para transições suaves                                             | `file`, `duration` (segundos)                                                     |
| `/audio/eq`                   | POST   | **Equalização** — ajusta graves (bass) e agudos (treble) do áudio                                                          | `file`, `bass` (dB), `treble` (dB)                                                |
| `/audio/gate`                 | POST   | **Noise Gate** — remove ruído de fundo silencioso (ar-condicionado, chiado). Só deixa passar som acima de um volume mínimo | `file`, `threshold`                                                               |
| `/audio/reverb-normalize-mp3` | POST   | **Tudo em um**: Reverb + Normalização + Boost de Volume + saída MP3. Para produção profissional                            | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |
| `/audio/reverb-normalize-ogg` | POST   | **Tudo em um**: Reverb + Normalização + Boost de Volume + saída OGG                                                        | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |

### 🎵 ÁUDIO — Combinar Múltiplos Áudios

| Endpoint           | Método | Descrição                                                                                                              | Parâmetros                                                         |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/audio/mix`       | POST   | **Mixa 2 áudios** — toca os dois **ao mesmo tempo** (sobrepostos). A duração será do áudio mais longo                  | `audio1`, `audio2` (form-data)                                     |
| `/audio/concat`    | POST   | **Concatena áudios em sequência** — junta de 2 a 10 áudios **um depois do outro**. Ex: intro + conteúdo + encerramento | `audios[]` (form-data, 2-10 arquivos), `format` (mp3/wav/ogg)      |
| `/audio/crossfade` | POST   | **Crossfade entre 2 áudios** — faz transição suave do primeiro para o segundo. Ideal para DJs e playlists              | `audio1`, `audio2` (form-data), `duration` (segundos da transição) |

### 🎵 ÁUDIO — Informações

| Endpoint | Método | Descrição                                                                                            | Parâmetros         |
| -------- | ------ | ---------------------------------------------------------------------------------------------------- | ------------------ |
| `/probe` | POST   | Retorna **informações técnicas** do arquivo: formato, codec, duração, bitrate, sample rate, channels | `file` (form-data) |

---

### 🎬 VÍDEO — Conversão

| Endpoint                 | Método | Descrição                                                                                 | Parâmetros                          |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| `/convert/video/to/mp4`  | POST   | Converte qualquer vídeo para **MP4 H.264** — o formato mais compatível (funciona em tudo) | `file`, `crf` (qualidade), `preset` |
| `/convert/video/to/webm` | POST   | Converte para **WebM VP9** — formato otimizado para web (YouTube, sites)                  | `file`, `crf`                       |
| `/convert/video/to/gif`  | POST   | Converte vídeo para **GIF animado** com paleta de cores otimizada                         | `file`, `fps`, `width`              |

### 🎬 VÍDEO — Processamento

| Endpoint              | Método | Descrição                                                                                    | Parâmetros                                                        |
| --------------------- | ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/video/resize`       | POST   | **Redimensiona** o vídeo para qualquer resolução (ex: 1920x1080 → 1280x720)                  | `file`, `width`, `height`                                         |
| `/video/trim`         | POST   | **Corta** um trecho do vídeo. Ex: pegar apenas do segundo 5 ao 15                            | `file`, `start` (HH:MM:SS), `duration` (HH:MM:SS)                 |
| `/video/compress`     | POST   | **Comprime** o vídeo reduzindo tamanho do arquivo mantendo qualidade aceitável               | `file`, `crf` (28=bom), `preset` (slow=melhor), `maxWidth`        |
| `/video/speed`        | POST   | **Altera velocidade** — acelera (2.0=2x rápido) ou câmera lenta (0.5=metade)                 | `file`, `speed`                                                   |
| `/video/rotate`       | POST   | **Rotaciona** o vídeo em 90°, 180° ou 270°                                                   | `file`, `angle` (90, 180, 270)                                    |
| `/video/concat`       | POST   | **Junta vários vídeos** em sequência (até 10 vídeos, um após o outro)                        | `videos[]` (form-data)                                            |
| `/video/watermark`    | POST   | Adiciona **marca d'água** (logo/imagem) sobre o vídeo, com posição e opacidade configuráveis | `video`, `watermark` (form-data), `position`, `opacity`, `margin` |
| `/video/remove-audio` | POST   | **Remove a trilha de áudio** do vídeo (vídeo mudo)                                           | `file`                                                            |

### 🎬 VÍDEO — Áudio ↔ Vídeo

| Endpoint               | Método | Descrição                                                                     | Parâmetros                                           |
| ---------------------- | ------ | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/video/extract-audio` | POST   | **Extrai o áudio** de um vídeo e salva como MP3, WAV ou OGG                   | `file`, `format` (mp3/wav/ogg)                       |
| `/video/add-audio`     | POST   | **Adiciona áudio** a um vídeo. Pode substituir ou mixar com o áudio existente | `video`, `audio` (form-data), `replace` (true/false) |

### 🎬 VÍDEO — Informações

| Endpoint           | Método | Descrição                                                                                     | Parâmetros                              |
| ------------------ | ------ | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| `/video/probe`     | POST   | Retorna **informações detalhadas** do vídeo: codec, resolução, fps, bitrate, duração, streams | `file`                                  |
| `/video/thumbnail` | POST   | Captura um **frame** do vídeo em um momento específico e salva como imagem JPG                | `file`, `timestamp` (HH:MM:SS), `width` |

---

### 🔥 GERAÇÃO DE VÍDEO

| Endpoint                 | Método | Descrição                                                                                                                                                     | Parâmetros                                                                                    |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/video/html-to-mp4`     | POST   | 🔥 **HTML animado → MP4** — Renderiza HTML/CSS/JS com animações em vídeo de alta qualidade. Usa Chromium headless para capturar frames e FFmpeg para encoding | `html` (JSON), `width`, `height`, `duration`, `fps`, `crf`, `preset`, `format`, `transparent` |
| `/video/url-to-mp4`      | POST   | 🔥 **Grava uma URL como vídeo** — Abre qualquer site no Chromium e grava a tela como vídeo                                                                    | `url` (JSON), `width`, `height`, `duration`, `fps`, `waitForSelector`, `waitMs`               |
| `/video/images-to-video` | POST   | **Slideshow de imagens** — Transforma múltiplas imagens em um vídeo com duração configurável por imagem                                                       | `images[]` (form-data), `durationPerImage`, `fps`, `width`, `height`                          |
| `/video/text-to-video`   | POST   | **Texto animado → vídeo** — Gera vídeo com texto centralizado e efeitos de animação (fade, scroll, typewriter)                                                | `text` (JSON), `duration`, `fontSize`, `fontColor`, `bgColor`, `animation`                    |

---

## 💡 Exemplos de Uso

### 🔥 HTML animado → MP4

```bash
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

### 🎬 Converter e comprimir vídeo

```bash
# Converter para MP4
curl -X POST http://localhost:9000/convert/video/to/mp4 \
  -F "file=@video.mov" --output converted.mp4

# Comprimir vídeo
curl -X POST http://localhost:9000/video/compress \
  -F "file=@video.mp4" -F "crf=28" -F "preset=slow" --output compressed.mp4
```

### 🌐 Gravar URL como vídeo

```bash
curl -X POST http://localhost:9000/video/url-to-mp4 \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "duration": 10,
    "fps": 30,
    "width": 1920,
    "height": 1080
  }' --output gravacao.mp4
```

### 📸 Slideshow de imagens

```bash
curl -X POST http://localhost:9000/video/images-to-video \
  -F "images=@foto1.jpg" -F "images=@foto2.jpg" -F "images=@foto3.jpg" \
  -F "durationPerImage=3" --output slideshow.mp4
```

### ✂️ Cortar trecho do vídeo

```bash
curl -X POST http://localhost:9000/video/trim \
  -F "file=@video.mp4" \
  -F "start=00:00:05" \
  -F "duration=00:00:10" \
  --output trecho.mp4
```

---

## ⚙️ Parâmetros do HTML → MP4

| Parâmetro           | Tipo    | Padrão | Descrição                                                             |
| ------------------- | ------- | ------ | --------------------------------------------------------------------- |
| `html`              | string  | —      | HTML completo com `<style>` e `<script>` inline **(obrigatório)**     |
| `width`             | number  | 1920   | Largura em pixels                                                     |
| `height`            | number  | 1080   | Altura em pixels                                                      |
| `duration`          | number  | 5      | Duração em segundos                                                   |
| `fps`               | number  | 30     | Frames por segundo (15-60)                                            |
| `crf`               | number  | 18     | Qualidade: 0=perfeito, 18=excelente, 28=bom, 51=péssimo               |
| `preset`            | string  | medium | Velocidade: `ultrafast` → `veryslow` (mais lento = melhor compressão) |
| `format`            | string  | mp4    | `mp4` (H.264) ou `webm` (VP9)                                         |
| `transparent`       | boolean | false  | Fundo transparente (só funciona com `webm`)                           |
| `deviceScaleFactor` | number  | 1      | Escala do dispositivo (2 = Retina/4K)                                 |

---

## 📊 Resumo

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
| Geração de Vídeo      | 4                |
| **Total**             | **36 endpoints** |
