# FFmpeg Audio API

API REST para processamento avançado de áudio usando FFmpeg.

## Endpoints Disponíveis

- `POST /convert/audio/to/mp3` - Converte para MP3
- `POST /convert/audio/to/wav` - Converte para WAV
- `POST /audio/mix` - Mix de 2 áudios
- `POST /audio/reverb` - Adiciona reverb
- `POST /audio/compress` - Compressor dinâmico
- `POST /audio/normalize` - Normalização
- `POST /audio/fade` - Fade in/out
- `POST /audio/eq` - Equalização
- `POST /audio/crossfade` - Crossfade entre áudios
- `POST /audio/gate` - Remove ruído de fundo
- `POST /probe` - Informações do arquivo

## Deploy no Dokploy

1. Conecte seu repositório GitHub no Dokploy
2. Selecione Docker Compose como tipo
3. Deploy automático
