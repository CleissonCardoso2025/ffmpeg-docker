# 🎬 FFmpeg Media API v3.2.0

API REST profissional para processamento de **áudio**, **vídeo**, **transições**, **HTML animado → MP4**, **conversão para WhatsApp PTT** e **montagem de boletins de rádio** usando FFmpeg + Puppeteer.

Desenvolvida com Node.js, Express, fluent-ffmpeg e puppeteer-core.

---

## 🆕 Novidades v3.2.0

- 📻 **`/audio/montar-boletim`** — Monta um **boletim de rádio completo** combinando trilha, voz e vinheta final com ducking automático de trilha
- 🎙️ **`/audio/radio-voice`** — Masterização automática de locução para rádio (Gate, EQ, Compressão, Loudness)
- 🎵 **`/audio/pitch`** — Altera o tom (pitch) do áudio sem alterar a velocidade (ex: voz mais aguda ou grave)

## Novidades v3.1.0

- 🎙️ **`/convert/audio/to/whatsapp`** — Converte qualquer áudio em **OGG/Opus** otimizado pra mensagem de voz do WhatsApp (PTT)
- 🎙️ **`/audio/normalize-whatsapp`** — Versão pro com normalização de loudness + Opus, ideal pra áudios de TTS

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

| Endpoint                       | Método | Descrição                                                                                          | Parâmetros                                                       |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/convert/audio/to/mp3`        | POST   | Converte qualquer arquivo de áudio para formato **MP3**                                            | `file` (form-data)                                               |
| `/convert/audio/to/wav`        | POST   | Converte qualquer arquivo de áudio para formato **WAV** (sem compressão)                           | `file` (form-data)                                               |
| `/convert/audio/to/ogg`        | POST   | Converte qualquer arquivo de áudio para formato **OGG Vorbis**                                     | `file` (form-data)                                               |
| 🆕 `/convert/audio/to/whatsapp` | POST   | 🎙️ Converte qualquer áudio em **OGG/Opus 48kHz mono** — formato exigido pelo **WhatsApp PTT** (voice note) | `file`, `bitrate` (padrão `64k`), `sampleRate` (48000), `channels` (1) |

### 🎵 ÁUDIO — Processamento

| Endpoint                         | Método | Descrição                                                                                                          | Parâmetros                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/audio/normalize`               | POST   | **Normaliza o volume** do áudio para padrão broadcast (EBU R128). Ideal para deixar todos os áudios no mesmo nível | `file`                                                                            |
| `/audio/normalize-mp3`           | POST   | Normaliza volume com controle total + converte para **MP3 44100Hz**                                                | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| `/audio/normalize-ogg`           | POST   | Normaliza volume + converte para **OGG 44100Hz**                                                                   | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate`                   |
| 🆕 `/audio/radio-voice`           | POST   | **Masterização p/ Rádio**: Noise Gate + EQ + Compressor + Loudnorm. Transforma vozes cruas em locução pronta p/ rádio | `file`, `profile` (radio/podcast/whatsapp/news), `format`, `bitrate`              |
| 🆕 `/audio/normalize-whatsapp`    | POST   | 🎙️ Normaliza loudness + converte para **OGG/Opus pro WhatsApp PTT**. Ideal pra áudios de TTS com volume baixo       | `file`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` (padrão `64k`)    |
| 🆕 `/audio/pitch`                 | POST   | **Altera o tom (pitch)** do áudio sem alterar a velocidade. Deixa a voz mais grave ou aguda                        | `file`, `pitch` (padrão `1.0`), `format` (padrão `mp3`)                           |
| `/audio/reverb`                  | POST   | Adiciona efeito de **reverberação** (eco). Simula som em ambientes como igrejas                                    | `file`, `decay`, `delay`                                                          |
| `/audio/compress`                | POST   | **Compressor dinâmico** — reduz diferença entre partes altas e baixas. Essencial para podcasts                     | `file`, `threshold`, `ratio`, `attack`, `release`                                 |
| `/audio/fade`                    | POST   | Adiciona **Fade In** no início e **Fade Out** no final                                                             | `file`, `duration` (segundos)                                                     |
| `/audio/eq`                      | POST   | **Equalização** — ajusta graves (bass) e agudos (treble)                                                           | `file`, `bass` (dB), `treble` (dB)                                                |
| `/audio/gate`                    | POST   | **Noise Gate** — remove ruído de fundo (ar-condicionado, chiado)                                                   | `file`, `threshold`                                                               |
| `/audio/reverb-normalize-mp3`    | POST   | **Tudo em um**: Reverb + Normalização + Volume + MP3                                                               | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |
| `/audio/reverb-normalize-ogg`    | POST   | **Tudo em um**: Reverb + Normalização + Volume + OGG                                                               | `file`, `decay`, `delay`, `loudness`, `truePeak`, `lra`, `volumeBoost`, `bitrate` |

### 🎵 ÁUDIO — Combinar Múltiplos

| Endpoint           | Método | Descrição                                                                      | Parâmetros                                     |
| ------------------ | ------ | ------------------------------------------------------------------------------ | ---------------------------------------------- |
| `/audio/mix`       | POST   | **Mixa 2 áudios** — toca os dois **ao mesmo tempo** (sobrepostos)              | `audio1`, `audio2` (form-data)                 |
| `/audio/concat`    | POST   | **Concatena áudios em sequência** — junta 2 a 10 áudios **um depois do outro** | `audios[]` (form-data), `format` (mp3/wav/ogg) |
| `/audio/crossfade` | POST   | **Crossfade entre 2 áudios** — transição suave do primeiro para o segundo      | `audio1`, `audio2` (form-data), `duration`     |

| `/probe` | POST   | Retorna **informações técnicas** do arquivo: formato, codec, duração, bitrate | `file` (form-data) |

### 📻 ÁUDIO — Boletim de Rádio (NOVO)

| Endpoint                  | Método | Descrição                                                                                             | Parâmetros                                                                                   |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 🆕 `/audio/montar-boletim` | POST   | **Monta um boletim de rádio completo** — combina vinheta inicio + intro + trilha + voz + vinheta final + spot patrocinador com ducking da trilha | `vinheta_inicio` (opc), `intro` (opc), `trilha`, `voz`, `vinheta_final`, `spot_patrocinador` (opc), `delay_voz`, `crossfade_*` |

### ⚙️ Detalhes: /audio/montar-boletim

O endpoint cria um áudio mixado em que a trilha toca de fundo e a voz entra após um delay.
- **`volume_trilha`** (padrão `1.0`): Define o volume inicial da música de fundo (trilha).
- **`volume_trilha_ducking`** (padrão `0.3`): Define o volume da trilha no momento em que a voz entra. 
  > 💡 **Dica:** Você pode usar isso tanto para diminuir quanto para aumentar o volume! Para *abaixar* a trilha (ducking), envie um valor menor que `volume_trilha` (ex: `0.3`). Para dar um *ganho* na trilha quando a voz entrar, basta enviar um valor maior (ex: se `volume_trilha` for `0.5`, envie o ducking como `1.5`).

### 🎙️ ÁUDIO — Captura de Stream (Live Radio)

| Endpoint                         | Método | Descrição                                                                                             | Parâmetros                                                                 |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 🆕 `/audio/record-stream`        | POST   | **Grava um stream ao vivo** (HTTP/HLS/RTMP) por tempo definido e retorna o arquivo                    | `stream_url`, `duration`, `format` (mp3), `bitrate`, `sampleRate`, `channels` |
| 🆕 `/audio/record-stream-async`  | POST   | **Versão assíncrona** — Grava em background, retorna `job_id`. Suporta webhook.                        | Mesmos acima + `webhook_url`, `callback_data`                              |
| 🆕 `/audio/record-stream/:job_id/status` | GET    | Consulta o **progresso e status** da gravação em tempo real                                           | `job_id` (URL)                                                             |
| 🆕 `/audio/record-stream/:job_id/download` | GET    | **Download** do arquivo gravado após conclusão                                                        | `job_id` (URL)                                                             |

### ⚙️ Detalhes: /audio/compress

O endpoint usa o filtro `acompressor` do FFmpeg e sempre retorna no formato **WAV**. 
Se os parâmetros não forem informados, a API utiliza os seguintes valores padrão:

| Parâmetro   | Range (Limites) | Unidade / Tipo | Valor Padrão |
|-------------|-----------------|----------------|--------------|
| `threshold` | 0.00097 a 1.0   | Linear         | `0.089` (~ -21dB) |
| `ratio`     | 1 a 20          | Proporção      | `9`          |
| `attack`    | 0.01 a 2000     | Milissegundos  | `200`        |
| `release`   | 0.01 a 9000     | Milissegundos  | `1000`       |

---

---

### 🎬 VÍDEO — Conversão

| Endpoint                 | Método | Descrição                                                            | Parâmetros              |
| ------------------------ | ------ | -------------------------------------------------------------------- | ----------------------- |
| `/convert/video/to/mp4`  | POST   | Converte qualquer vídeo para **MP4 H.264** — formato mais compatível | `file`, `crf`, `preset` |
| `/convert/video/to/webm` | POST   | Converte para **WebM VP9** — formato otimizado para web              | `file`, `crf`           |
| `/convert/video/to/gif`  | POST   | Converte vídeo para **GIF animado** com paleta otimizada             | `file`, `fps`, `width`  |

### 🎬 VÍDEO — Processamento

| Endpoint              | Método | Descrição                                            | Parâmetros                                                        |
| --------------------- | ------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `/video/resize`       | POST   | **Redimensiona** o vídeo para qualquer resolução     | `file`, `width`, `height`                                         |
| `/video/trim`         | POST   | **Corta** um trecho do vídeo por timestamp           | `file`, `start` (HH:MM:SS), `duration` (HH:MM:SS)                 |
| `/video/trim-from-url`| POST   | 🆕 **Corta trecho de URL remota** — recebe URL (ex: googlevideo) e corta via streaming HTTP, sem baixar arquivo inteiro. Suporta merge de vídeo+áudio | `url_video`, `url_audio` (opc), `start`, `end`, `format` |
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

### 📻 Montar Boletim de Rádio (NOVO)

```bash
# Boletim padrão: delay 9s, ducking 30%, fade 300ms
curl -X POST https://ffmpeg.cleissoncardoso.com/audio/montar-boletim \
  -F "trilha=@trilha.mp3" \
  -F "voz=@locucao.mp3" \
  -F "vinheta_final=@vinheta.mp3" \
  --output boletim.mp3

# Boletim com parâmetros customizados
curl -X POST https://ffmpeg.cleissoncardoso.com/audio/montar-boletim \
  -F "trilha=@trilha.mp3" \
  -F "voz=@locucao.mp3" \
  -F "vinheta_final=@vinheta.mp3" \
  -F "delay_voz=5" \
  -F "volume_trilha_ducking=0.2" \
  -F "fade_vinheta=0.5" \
  --output boletim_customizado.mp3

# Boletim via URLs (sem upload de arquivo)
curl -X POST https://ffmpeg.cleissoncardoso.com/audio/montar-boletim \
  -F "trilha=https://cdn.example.com/trilha.mp3" \
  -F "voz=https://cdn.example.com/locucao.mp3" \
  -F "vinheta_final=https://cdn.example.com/vinheta.mp3" \
  --output boletim_url.mp3
```

**Timeline exata do áudio gerado:**

A trilha corta exatamente junto com a voz, com um fade-out rápido de 200ms para evitar cliques, e só então a vinheta inicia sequencialmente.

```text
0s ────── 9s (delay_voz) ──────── (9s + dur_voz)s ──────── FIM
│  TRILHA  │  TRILHA 30% + VOZ    │                        │
│  100%    │  (ducking automático) │  VINHETA FINAL         │
│          │  (terminam juntas!)  │  (fade-in inicial)     │
```

#### Integração n8n — Workflow de boletim automático

```
[Webhook ou Schedule]
    ↓
[HTTP Request: GET trilha/voz/vinheta dos assets]
    ↓ binários
[HTTP POST /audio/montar-boletim]
    ↓ binary MP3
[Supabase Storage / S3 Upload]
    ↓ url pública
[Publicar no site / WhatsApp / Telegram]
```

**Configuração no node HTTP Request do n8n:**

```
Method:           POST
URL:              https://ffmpeg.cleissoncardoso.com/audio/montar-boletim
Body Content Type: Form-Data
Body Parameters:
  ├─ trilha        → Binary File (campo do binary com a trilha)
  ├─ voz           → Binary File (campo do binary com a locução)
  ├─ vinheta_final → Binary File (campo do binary com a vinheta)
  ├─ delay_voz     → 9
  └─ volume_trilha_ducking → 0.3
Response:
  Response Format:    File
  Put Output in Field: data
```

---

### 🎙️ Processamento de Voz para Rádio (NOVO)

Transforma qualquer locução (humana ou gerada via IA, como Gemini, ElevenLabs, Fish Audio) em uma locução com qualidade masterizada de Rádio FM, executando Noise Gate, EQ focado em voz, Compressão e Normalização de Loudness em uma única chamada!

```bash
# Processar com o perfil padrão (radio)
curl -X POST http://localhost:9000/audio/radio-voice \
  -F "file=@locucao_crua.wav" \
  --output locucao_pronta_radio.mp3

# Processar para perfil podcast com maior dinâmica (em WAV)
curl -X POST http://localhost:9000/audio/radio-voice \
  -F "file=@locucao_crua.wav" \
  -F "profile=podcast" \
  -F "format=wav" \
  --output locucao_podcast.wav
```

#### Perfis disponíveis:
- **`radio` (padrão):** Otimizado para FM. EQ para rádio (cortes de graves em 80/300Hz, ganho alto de presença entre 3-8kHz), compressão média, Loudness fixo em -16 LUFS.
- **`podcast`:** EQ mais quente e plano, compressão leve, dinâmica maior, Loudness de -18 LUFS.
- **`whatsapp`:** Reduz graves pesados (para não estourar alto falante de celular) e reforça agudos; compressão forte, Loudness otimizado em -14 LUFS.
- **`news`:** Máxima inteligibilidade. Reforço severo nas frequências vocais de clareza (3-8kHz), compressão dura e Loudness fixo de -16 LUFS.

#### Parâmetros Opcionais:
- `profile`: `radio` (padrão), `podcast`, `whatsapp` ou `news`.
- `format`: `mp3` (padrão), `wav` ou `ogg`.
- `bitrate`: Padrão é `192k`.

**Integração n8n:**
```
Method:           POST
URL:              https://ffmpeg.cleissoncardoso.com/audio/radio-voice
Body Content Type: Form-Data
Body Parameters:
  ├─ file         → Binary File
  └─ profile      → "podcast" (opcional)
Response:
  Response Format:    File
```

---

### 🎙️ WhatsApp PTT — Mensagem de Voz (NOVO)

```bash
# Conversão simples para WhatsApp (qualquer áudio → OGG/Opus PTT)
curl -X POST http://localhost:9000/convert/audio/to/whatsapp \
  -F "file=@audio.wav" \
  --output voice.ogg

# Validar se ficou em Opus
ffprobe voice.ogg
# Esperado: Audio: opus, 48000 Hz, mono

# Bitrate customizado (mais qualidade ou mais leve)
curl -X POST http://localhost:9000/convert/audio/to/whatsapp \
  -F "file=@audio.wav" \
  -F "bitrate=96k" \
  --output voice.ogg

# Versão com normalização (ideal pra TTS com volume baixo)
curl -X POST http://localhost:9000/audio/normalize-whatsapp \
  -F "file=@tts-gemini.wav" \
  -F "loudness=-14" \
  -F "volumeBoost=1.5" \
  --output voice.ogg
```

#### 🚀 Fluxo completo no n8n + Evolution API

```
[Gemini TTS / ElevenLabs] 
    ↓ binary: data (.wav)
[HTTP Request: /convert/audio/to/whatsapp] 
    ↓ binary: data (.ogg/opus)
[Upload Litterbox / S3] 
    ↓ url
[Evolution API: sendWhatsAppAudio { ptt: true }] ✅
```

**Configuração no node HTTP Request do n8n:**

```
Method:           POST
URL:              http://ffmpeg-api:3000/convert/audio/to/whatsapp
Body Content Type: Form-Data
Body Parameters:
  └─ file (n8n Binary File)
      Input Data Field Name: data
Response:
  Response Format:    File
  Put Output in Field: data
```

---

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

### 🎙️ Gravação de Rádio Online / Streams Live

```bash
# Gravação síncrona (espera terminar e baixa) - 30 segundos
curl -X POST http://localhost:9000/audio/record-stream \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "http://stream.radiocidade.com/live",
    "duration": 30,
    "format": "mp3",
    "bitrate": "128k"
  }' --output radio_corte.mp3

# Gravação assíncrona (retorna job_id imediato) - 1 hora (3600s)
curl -X POST http://localhost:9000/audio/record-stream-async \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://shoutcast.stream.com/live",
    "duration": 3600,
    "webhook_url": "https://seu-n8n.webhook.com/abc-123"
  }'

# Consultar status do job
curl http://localhost:9000/audio/record-stream/rec_abc123/status

# Download após concluir
curl http://localhost:9000/audio/record-stream/rec_abc123/download --output gravacao_longa.mp3
```

#### 🚀 Exemplo de Integração com n8n

```
[Schedule Trigger 06:00] 
       ↓ 
[HTTP POST /audio/record-stream-async] 
       ↓ (recebe job_id)
[Webhook listener (n8n)] 
       ↓ (recebe notificação 'completed')
[HTTP GET /download] 
       ↓ binary
[Whisper Transcription / Store S3]
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

### 🆕 Cortar vídeo de URL remota (sem baixar arquivo inteiro)

```bash
# Cortar trecho de vídeo do YouTube (URL googlevideo) com merge de áudio
curl -X POST http://localhost:9000/video/trim-from-url \
  -H "Content-Type: application/json" \
  -d '{
    "url_video": "https://rr12.googlevideo.com/videoplayback?...itag=299...",
    "url_audio": "https://rr12.googlevideo.com/videoplayback?...itag=140...",
    "start": "00:04:00",
    "end": "00:06:50",
    "format": "mp4"
  }' --output corte.mp4

# Cortar só áudio (mp3)
curl -X POST http://localhost:9000/video/trim-from-url \
  -H "Content-Type: application/json" \
  -d '{
    "url_audio": "https://rr12.googlevideo.com/videoplayback?...itag=140...",
    "start": "00:04:00",
    "end": "00:06:50",
    "format": "mp3"
  }' --output audio.mp3
```

---

## ⚙️ Parâmetros do WhatsApp PTT

| Parâmetro    | Tipo    | Padrão  | Descrição                                                            |
| ------------ | ------- | ------- | -------------------------------------------------------------------- |
| `file`       | file    | —       | Arquivo de áudio de entrada **(obrigatório)** — qualquer formato     |
| `bitrate`    | string  | `64k`   | Taxa de bits do Opus (`32k`, `48k`, `64k`, `96k`, `128k`)            |
| `sampleRate` | number  | `48000` | Taxa de amostragem em Hz (recomendado manter em 48000)               |
| `channels`   | number  | `1`     | Canais (1 = mono, recomendado pra voz; 2 = stereo)                   |

**🎯 Specs técnicas do output:**
- Codec: `libopus`
- Container: `ogg`
- Application: `voip` (otimizado pra fala)
- VBR: ativado
- Compression level: 10 (qualidade máxima)

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

## ⚙️ Parâmetros do Boletim de Rádio

| Parâmetro                        | Tipo           | Padrão  | Obrigatório | Descrição                                                              |
| -------------------------------- | -------------- | ------- | ----------- | ---------------------------------------------------------------------- |
| `vinheta_inicio`                 | file ou URL    | —       | ❌           | Vinheta de abertura do boletim (MP3, tocada no início de tudo)         |
| `intro`                          | file ou URL    | —       | ❌           | Introdução do boletim (MP3, tocada após vinheta_inicio e antes do corpo)|
| `trilha`                         | file ou URL    | —       | ✅           | Música de fundo (MP3). Upload via `multipart` ou URL no campo `trilha` |
| `voz`                            | file ou URL    | —       | ✅           | Locução já normalizada (MP3)                                           |
| `vinheta_final`                  | file ou URL    | —       | ✅           | Vinheta de encerramento (MP3)                                          |
| `spot_patrocinador` / `spot_1`   | file ou URL    | —       | ❌           | Áudio comercial do patrocinador (MP3, tocado após `vinheta_final` por padrão) |
| `spot_patrocinador_2`            | file ou URL    | —       | ❌           | Segundo áudio comercial (pode ser posicionado em qualquer lugar via `ordem`) |
| `spot_patrocinador_inicio`       | file ou URL    | —       | ❌           | Spot comercial posicionado no início do boletim                              |
| `delay_voz`                      | número (s)     | `9`     | ❌           | Segundos de silêncio antes da voz entrar (a trilha toca 100% nesse período) |
| `volume_trilha_ducking`          | número (0–1)   | `0.3`   | ❌           | Volume da trilha quando a voz está tocando (0.3 = 30%)                 |
| `fade_vinheta`                   | número (s)     | `0.3`   | ❌           | Duração do fade-in aplicado no início das vinhetas (sem crossfade)    |
| `crossfade_vinheta_intro`        | número (s)     | `0`     | ❌           | Duração do crossfade em segundos entre `vinheta_inicio` e `intro`      |
| `crossfade_intro_corpo`          | número (s)     | `0`     | ❌           | Duração do crossfade em segundos entre `intro` e o `corpo` (trilha+voz)|
| `crossfade_vinheta_corpo`        | número (s)     | `0`     | ❌           | Duração do crossfade em segundos entre `vinheta_inicio` e `corpo` (sem intro) |
| `crossfade_vinheta_final`        | número (s)     | `0`     | ❌           | Duração do crossfade em segundos entre o `corpo` e a `vinheta_final`  |
| `crossfade_vinheta_final_spot`   | número (s)     | `0`     | ❌           | Duração do crossfade em segundos entre `vinheta_final` e `spot_patrocinador` |
| `ordem`                          | string/array   | —       | ❌           | Ordem personalizada das peças ex: `["spot_patrocinador_1", "vinheta_inicio", "intro", "corpo", "vinheta_final", "spot_patrocinador_2"]` |

**📤 Resposta:** `audio/mpeg` — arquivo MP3 pronto para veiculação, com headers `X-Processing-Time` e `X-File-Size-KB`.

---

## 📊 Resumo Total de Endpoints

| Categoria                | Quantidade       |
| ------------------------ | ---------------- |
| Áudio — Conversão        | 4                |
| Áudio — Processamento    | 11               |
| Áudio — Combinar         | 3                |
| Áudio — Info             | 1                |
| 📻 ÁUDIO — Boletim Rádio | 1 (🆕 NOVO)      |
| 🎙️ ÁUDIO — Captura Live  | 4                |
| Vídeo — Conversão        | 3                |
| Vídeo — Processamento    | 9                |
| Vídeo — Áudio↔Vídeo      | 2                |
| Vídeo — Info             | 2                |
| ✨ Transições            | 3 (55+ efeitos)  |
| 🔥 Geração de Vídeo      | 4                |
| **Total**                | **47 endpoints** |

---

## 🐳 Stack Técnica

- **Node.js 18 (Alpine)**
- **FFmpeg** (com libopus, libvorbis, libmp3lame, libx264, libvpx)
- **Chromium** + Puppeteer-core (pra HTML → MP4)
- **Express** + Multer + fluent-ffmpeg

---

## 📝 Licença

MIT

---

## 🍪 Configurando Cookies do YouTube

O YouTube detecta downloads de servidores (Datacenters/VPS) e bloqueia com erro "Sign in to confirm you're not a bot". Para corrigir isso, o `yt-dlp` agora exige cookies e runtime JavaScript (Deno instalado nativamente nesta imagem).

**Como obter seus cookies:**
1. Use uma conta SECUNDÁRIA do YouTube (risco de ban/suspensão).
2. Instale a extensão "Get cookies.txt LOCALLY" no navegador Chrome/Firefox.
3. Acesse o YouTube logado, clique na extensão e exporte em formato Netscape.

**Como enviar para o servidor:**

Opção A: Salvar direto via SCP/volume
Renomeie o arquivo para `youtube.txt` e coloque na pasta `cookies/` raiz do projeto.

Opção B: Via API (fácil)
Envie o arquivo encodado em base64:
```bash
curl -X POST http://localhost:9000/youtube/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "seu-secret-definido-no-.env",
    "cookies_b64": "'$(base64 -w 0 youtube_cookies.txt)'"
  }'
```

⚠️ **Atenção**: Os cookies expiram em média a cada 30 dias. Cheque o endpoint `/youtube/health` para ver o status dos cookies!
