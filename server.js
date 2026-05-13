const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { execSync, exec } = require('child_process');

// Puppeteer (carregado sob demanda para não bloquear se Chromium não estiver presente)
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.warn('⚠️  puppeteer-core não disponível. Endpoints de HTML→MP4 desabilitados.');
}

const app = express();
const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 🎙️ NOVOS ENDPOINTS — ÁUDIO CAPTURA
const audioStreamRoutes = require('./src/routes/audio-stream');
app.use('/audio', audioStreamRoutes);

// ─────────────────────────────────────────────────────
// 🔧 UTILIDADES
// ─────────────────────────────────────────────────────

function cleanupFiles(files) {
  files.forEach(file => {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) {}
  });
}

function cleanupDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (e) {}
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;
  if (!ts) throw new Error('Timestamp inválido');
  const parts = String(ts).split(':').map(Number);
  if (parts.some(isNaN)) throw new Error('Formato de timestamp inválido');
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────
// 🎵 ÁUDIO — Endpoints existentes
// ─────────────────────────────────────────────────────

// Endpoint: Converter para MP3
app.post('/convert/audio/to/mp3', upload.single('file'), (req, res) => {
  const output = `/tmp/output-${Date.now()}.mp3`;
  ffmpeg(req.file.path)
    .toFormat('mp3')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Converter para WAV
app.post('/convert/audio/to/wav', upload.single('file'), (req, res) => {
  const output = `/tmp/output-${Date.now()}.wav`;
  ffmpeg(req.file.path)
    .toFormat('wav')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Converter para OGG (Vorbis)
app.post('/convert/audio/to/ogg', upload.single('file'), (req, res) => {
  const output = `/tmp/output-${Date.now()}.ogg`;
  ffmpeg(req.file.path)
    .toFormat('ogg')
    .audioCodec('libvorbis')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// 🆕 Endpoint: Converter áudio para OGG/Opus (WhatsApp PTT - Mensagem de Voz)
// Codec: libopus | Bitrate: 64k | Mono | 48kHz | Application: voip
// Formato exigido pelo WhatsApp para áudios de voz (ptt:true)
app.post('/convert/audio/to/whatsapp', upload.single('file'), (req, res) => {
  const output = `/tmp/whatsapp-${Date.now()}.ogg`;
  
  // Permite override via body (opcional)
  const bitrate = req.body.bitrate || '64k';
  const sampleRate = parseInt(req.body.sampleRate) || 48000;
  const channels = parseInt(req.body.channels) || 1;
  
  ffmpeg(req.file.path)
    .audioCodec('libopus')
    .audioBitrate(bitrate)
    .audioChannels(channels)
    .audioFrequency(sampleRate)
    .outputOptions(['-application voip', '-vbr on', '-compression_level 10'])
    .toFormat('ogg')
    .on('end', () => {
      res.download(output, 'voice.ogg', () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Normalizar e converter para MP3 44100Hz com volume personalizável
app.post('/audio/normalize-mp3', upload.single('file'), (req, res) => {
  const output = `/tmp/normalized-mp3-${Date.now()}.mp3`;
  
  const loudness = req.body.loudness || -16;
  const truePeak = req.body.truePeak || -1.5;
  const lra = req.body.lra || 11;
  const volumeBoost = req.body.volumeBoost || 1.0;
  const bitrate = req.body.bitrate || '192k';
  
  const filters = [];
  
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  if (volumeBoost != 1.0) {
    filters.push(`volume=${volumeBoost}`);
  }
  
  ffmpeg(req.file.path)
    .audioFilters(filters)
    .audioFrequency(44100)
    .audioBitrate(bitrate)
    .audioCodec('libmp3lame')
    .toFormat('mp3')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Normalizar e converter para OGG 44100Hz
app.post('/audio/normalize-ogg', upload.single('file'), (req, res) => {
  const output = `/tmp/normalized-ogg-${Date.now()}.ogg`;
  
  const loudness = req.body.loudness || -16;
  const truePeak = req.body.truePeak || -1.5;
  const lra = req.body.lra || 11;
  const volumeBoost = req.body.volumeBoost || 1.0;
  const bitrate = req.body.bitrate || '192k';
  
  const filters = [];
  
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  if (volumeBoost != 1.0) {
    filters.push(`volume=${volumeBoost}`);
  }
  
  ffmpeg(req.file.path)
    .audioFilters(filters)
    .audioFrequency(44100)
    .audioCodec('libvorbis')
    .audioBitrate(bitrate)
    .toFormat('ogg')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// 🆕 Endpoint: Normalizar + Converter para WhatsApp PTT (com loudness)
// Versão pro do /convert/audio/to/whatsapp com normalização de volume
app.post('/audio/normalize-whatsapp', upload.single('file'), (req, res) => {
  const output = `/tmp/normalized-whatsapp-${Date.now()}.ogg`;
  
  const loudness = req.body.loudness || -16;
  const truePeak = req.body.truePeak || -1.5;
  const lra = req.body.lra || 11;
  const volumeBoost = req.body.volumeBoost || 1.0;
  const bitrate = req.body.bitrate || '64k';
  
  const filters = [];
  
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  if (volumeBoost != 1.0) {
    filters.push(`volume=${volumeBoost}`);
  }
  
  ffmpeg(req.file.path)
    .audioFilters(filters)
    .audioCodec('libopus')
    .audioBitrate(bitrate)
    .audioChannels(1)
    .audioFrequency(48000)
    .outputOptions(['-application voip', '-vbr on', '-compression_level 10'])
    .toFormat('ogg')
    .on('end', () => {
      res.download(output, 'voice.ogg', () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Reverb + Normalizar + Volume + MP3 (TUDO EM UM)
app.post('/audio/reverb-normalize-mp3', upload.single('file'), (req, res) => {
  const output = `/tmp/reverb-normalized-mp3-${Date.now()}.mp3`;
  
  const decay = req.body.decay || 0.5;
  const delay = req.body.delay || 50;
  const loudness = req.body.loudness || -13;
  const truePeak = req.body.truePeak || -0.5;
  const lra = req.body.lra || 5;
  const volumeBoost = req.body.volumeBoost || 3.0;
  const bitrate = req.body.bitrate || '256k';
  
  const filters = [];
  
  filters.push(`aecho=0.8:0.9:${delay}:${decay}`);
  
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  if (volumeBoost != 1.0) {
    filters.push(`volume=${volumeBoost}`);
  }
  
  ffmpeg(req.file.path)
    .audioFilters(filters)
    .audioFrequency(44100)
    .audioBitrate(bitrate)
    .audioCodec('libmp3lame')
    .toFormat('mp3')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Reverb + Normalizar + Volume + OGG (TUDO EM UM)
app.post('/audio/reverb-normalize-ogg', upload.single('file'), (req, res) => {
  const output = `/tmp/reverb-normalized-ogg-${Date.now()}.ogg`;
  
  const decay = req.body.decay || 0.5;
  const delay = req.body.delay || 50;
  const loudness = req.body.loudness || -13;
  const truePeak = req.body.truePeak || -0.5;
  const lra = req.body.lra || 5;
  const volumeBoost = req.body.volumeBoost || 3.0;
  const bitrate = req.body.bitrate || '256k';
  
  const filters = [];
  
  filters.push(`aecho=0.8:0.9:${delay}:${decay}`);
  
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  if (volumeBoost != 1.0) {
    filters.push(`volume=${volumeBoost}`);
  }
  
  ffmpeg(req.file.path)
    .audioFilters(filters)
    .audioFrequency(44100)
    .audioBitrate(bitrate)
    .audioCodec('libvorbis')
    .toFormat('ogg')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Mix de 2 áudios
app.post('/audio/mix', upload.fields([{name:'audio1'},{name:'audio2'}]), (req, res) => {
  const output = `/tmp/mix-${Date.now()}.wav`;
  const file1 = req.files.audio1[0].path;
  const file2 = req.files.audio2[0].path;
  
  ffmpeg()
    .input(file1)
    .input(file2)
    .complexFilter(['amix=inputs=2:duration=longest'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([file1, file2, output]));
    })
    .on('error', (err) => {
      cleanupFiles([file1, file2]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Concatenar áudios (um depois do outro em sequência)
app.post('/audio/concat', upload.array('audios', 10), (req, res) => {
  const format = req.body.format || 'mp3';
  const output = `/tmp/concat-audio-${Date.now()}.${format}`;
  const listFile = `/tmp/concat-audio-list-${Date.now()}.txt`;

  if (!req.files || req.files.length < 2) {
    return res.status(400).json({ error: 'Envie pelo menos 2 arquivos de áudio (campo: audios).' });
  }

  const fileList = req.files.map(f => `file '${f.path}'`).join('\n');
  fs.writeFileSync(listFile, fileList);

  const cmd = ffmpeg()
    .input(listFile)
    .inputOptions(['-f concat', '-safe 0']);

  if (format === 'mp3') {
    cmd.audioCodec('libmp3lame').audioBitrate('192k').toFormat('mp3');
  } else if (format === 'ogg') {
    cmd.audioCodec('libvorbis').toFormat('ogg');
  } else {
    cmd.toFormat('wav');
  }

  cmd
    .on('end', () => {
      const filePaths = req.files.map(f => f.path);
      res.download(output, () => cleanupFiles([...filePaths, listFile, output]));
    })
    .on('error', (err) => {
      const filePaths = req.files.map(f => f.path);
      cleanupFiles([...filePaths, listFile]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Adicionar Reverb
app.post('/audio/reverb', upload.single('file'), (req, res) => {
  const output = `/tmp/reverb-${Date.now()}.wav`;
  const decay = req.body.decay || 0.5;
  const delay = req.body.delay || 50;
  
  ffmpeg(req.file.path)
    .audioFilters(`aecho=0.8:0.9:${delay}:${decay}`)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Compressor Dinâmico
app.post('/audio/compress', upload.single('file'), (req, res) => {
  const output = `/tmp/compressed-${Date.now()}.wav`;
  const threshold = req.body.threshold || 0.089;
  const ratio = req.body.ratio || 9;
  const attack = req.body.attack || 200;
  const release = req.body.release || 1000;
  
  ffmpeg(req.file.path)
    .audioFilters(`acompressor=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}`)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Normalização
app.post('/audio/normalize', upload.single('file'), (req, res) => {
  const output = `/tmp/normalized-${Date.now()}.wav`;
  
  ffmpeg(req.file.path)
    .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Fade In/Out
app.post('/audio/fade', upload.single('file'), (req, res) => {
  const output = `/tmp/fade-${Date.now()}.wav`;
  const duration = req.body.duration || 3;
  
  ffmpeg(req.file.path)
    .audioFilters(`afade=t=in:d=${duration},afade=t=out:d=${duration}`)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Equalização
app.post('/audio/eq', upload.single('file'), (req, res) => {
  const output = `/tmp/eq-${Date.now()}.wav`;
  const bass = req.body.bass || 0;
  const treble = req.body.treble || 0;
  
  ffmpeg(req.file.path)
    .audioFilters(`bass=g=${bass},treble=g=${treble}`)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Crossfade entre 2 áudios
app.post('/audio/crossfade', upload.fields([{name:'audio1'},{name:'audio2'}]), (req, res) => {
  const output = `/tmp/crossfade-${Date.now()}.wav`;
  const duration = req.body.duration || 3;
  const file1 = req.files.audio1[0].path;
  const file2 = req.files.audio2[0].path;
  
  ffmpeg()
    .input(file1)
    .input(file2)
    .complexFilter([`[0][1]acrossfade=d=${duration}`])
    .on('end', () => {
      res.download(output, () => cleanupFiles([file1, file2, output]));
    })
    .on('error', (err) => {
      cleanupFiles([file1, file2]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Gate (elimina ruído de fundo)
app.post('/audio/gate', upload.single('file'), (req, res) => {
  const output = `/tmp/gate-${Date.now()}.wav`;
  const threshold = req.body.threshold || 0.001;
  
  ffmpeg(req.file.path)
    .audioFilters(`agate=threshold=${threshold}:ratio=2:attack=20:release=1000`)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// Endpoint: Informações do arquivo
app.post('/probe', upload.single('file'), (req, res) => {
  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    cleanupFiles([req.file.path]);
    if (err) return res.status(500).json({ error: err.message });
    res.json(metadata);
  });
});

// ─────────────────────────────────────────────────────
// 🎬 VÍDEO — Endpoints
// ─────────────────────────────────────────────────────

app.post('/convert/video/to/mp4', upload.single('file'), (req, res) => {
  const output = `/tmp/video-mp4-${Date.now()}.mp4`;
  const crf = req.body.crf || 23;
  const preset = req.body.preset || 'medium';

  ffmpeg(req.file.path)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions([`-crf ${crf}`, `-preset ${preset}`, '-movflags +faststart'])
    .toFormat('mp4')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/convert/video/to/webm', upload.single('file'), (req, res) => {
  const output = `/tmp/video-webm-${Date.now()}.webm`;
  const crf = req.body.crf || 30;

  ffmpeg(req.file.path)
    .videoCodec('libvpx-vp9')
    .audioCodec('libopus')
    .outputOptions([`-crf ${crf}`, '-b:v 0'])
    .toFormat('webm')
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/convert/video/to/gif', upload.single('file'), (req, res) => {
  const output = `/tmp/video-gif-${Date.now()}.gif`;
  const fps = req.body.fps || 15;
  const width = req.body.width || 480;

  ffmpeg(req.file.path)
    .outputOptions([
      `-vf fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
    ])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/extract-audio', upload.single('file'), (req, res) => {
  const format = req.body.format || 'mp3';
  const output = `/tmp/extracted-audio-${Date.now()}.${format}`;

  const cmd = ffmpeg(req.file.path).noVideo();

  if (format === 'mp3') {
    cmd.audioCodec('libmp3lame').audioBitrate('192k');
  } else if (format === 'ogg') {
    cmd.audioCodec('libvorbis');
  } else if (format === 'wav') {
    cmd.audioCodec('pcm_s16le');
  }

  cmd
    .toFormat(format)
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/resize', upload.single('file'), (req, res) => {
  const width = req.body.width || 1280;
  const height = req.body.height || 720;
  const output = `/tmp/resized-${Date.now()}.mp4`;

  ffmpeg(req.file.path)
    .videoCodec('libx264')
    .audioCodec('aac')
    .size(`${width}x${height}`)
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/trim', upload.single('file'), (req, res) => {
  const start = req.body.start || '00:00:00';
  const duration = req.body.duration || '00:00:10';
  const output = `/tmp/trimmed-${Date.now()}.mp4`;

  ffmpeg(req.file.path)
    .setStartTime(start)
    .setDuration(duration)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/trim-from-url', (req, res) => {
  const { url_video, url_audio, start, end, format = 'mp4' } = req.body;

  if (!url_video && format !== 'mp3') {
    return res.status(400).json({ error: 'url_video é obrigatório', code: 'INVALID_URL' });
  }
  if (!url_video && !url_audio) {
    return res.status(400).json({ error: 'Forneça url_video ou url_audio', code: 'INVALID_URL' });
  }
  if (url_video && !/^https?:\/\//.test(url_video)) {
    return res.status(400).json({ error: 'url_video deve começar com http:// ou https://', code: 'INVALID_URL' });
  }
  if (url_audio && !/^https?:\/\//.test(url_audio)) {
    return res.status(400).json({ error: 'url_audio deve começar com http:// ou https://', code: 'INVALID_URL' });
  }

  let startSec, endSec;
  try {
    startSec = parseTimestamp(start);
    endSec = parseTimestamp(end);
    if (endSec <= startSec) throw new Error('end deve ser maior que start');
  } catch (err) {
    return res.status(400).json({ error: err.message, code: 'INVALID_TIMESTAMP' });
  }

  const outputId = uuidv4();
  const tmpDir = '/tmp/ffmpeg-trim';
  ensureDir(tmpDir);
  const outputPath = `${tmpDir}/${outputId}.${format}`;
  const startFmt = formatTimestamp(startSec);
  const endFmt = formatTimestamp(endSec);

  console.log(`[trim-from-url] Iniciando corte`);
  console.log(`  URL: ${url_video ? url_video.substring(0, 100) : url_audio.substring(0, 100)}...`);
  console.log(`  Trecho: ${startFmt} → ${endFmt}`);
  console.log(`  Format: ${format}`);
  console.log(`  Merge audio: ${!!url_audio}`);

  const startTimeObj = Date.now();
  let cmd = ffmpeg();
  let responseSent = false;

  const timeoutId = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      cmd.kill('SIGKILL');
      cleanupFiles([outputPath]);
      res.status(504).json({ error: 'Timeout de processamento (5 minutos)', code: 'TIMEOUT' });
    }
  }, 5 * 60 * 1000);

  const finalize = () => {
    clearTimeout(timeoutId);
    if (!responseSent) {
      cleanupFiles([outputPath]);
    }
  };

  res.on('finish', () => finalize());
  res.on('close', () => finalize());

  if (format === 'mp3') {
    const inputUrl = url_audio || url_video;
    cmd.input(inputUrl)
       .inputOptions([`-ss ${startSec}`, `-to ${endSec}`])
       .outputOptions(['-vn', '-c:a libmp3lame', '-b:a 192k']);
  } else if (url_video && url_audio) {
    cmd.input(url_video)
       .inputOptions([`-ss ${startSec}`, `-to ${endSec}`])
       .input(url_audio)
       .inputOptions([`-ss ${startSec}`, `-to ${endSec}`])
       .outputOptions([
         '-map 0:v',
         '-map 1:a',
         '-c:v copy',
         '-c:a aac',
         '-b:a 192k',
         '-movflags +faststart'
       ]);
  } else {
    cmd.input(url_video)
       .inputOptions([`-ss ${startSec}`, `-to ${endSec}`])
       .outputOptions(['-c copy', '-movflags +faststart']);
  }

  cmd.output(outputPath)
     .on('end', () => {
       if (responseSent) return;
       responseSent = true;
       clearTimeout(timeoutId);
       
       const elapsed = ((Date.now() - startTimeObj) / 1000).toFixed(1);
       let sizeMB = '0.00';
       try {
         if (fs.existsSync(outputPath)) {
           const stat = fs.statSync(outputPath);
           sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
         }
       } catch (e) {}
       
       console.log(`[trim-from-url] ✅ Concluído em ${elapsed}s | Tamanho: ${sizeMB}MB`);
       res.download(outputPath, `trim_${startSec}.${format}`, () => {
         cleanupFiles([outputPath]);
       });
     })
     .on('error', (err, stdout, stderr) => {
       if (responseSent) return;
       responseSent = true;
       clearTimeout(timeoutId);
       cleanupFiles([outputPath]);
       
       const errStr = err.message || '';
       if (errStr.includes('SIGKILL')) return;
       
       res.status(500).json({
         error: 'Erro no processamento do FFmpeg',
         code: 'FFMPEG_ERROR',
         details: stderr || err.message
       });
     })
     .run();
});

app.post('/video/thumbnail', upload.single('file'), (req, res) => {
  const timestamp = req.body.timestamp || '00:00:01';
  const width = req.body.width || 640;
  const output = `/tmp/thumb-${Date.now()}.jpg`;

  ffmpeg(req.file.path)
    .seekInput(timestamp)
    .frames(1)
    .outputOptions([`-vf scale=${width}:-1`])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/watermark', upload.fields([{name:'video'},{name:'watermark'}]), (req, res) => {
  const output = `/tmp/watermarked-${Date.now()}.mp4`;
  const position = req.body.position || 'bottomright';
  const opacity = req.body.opacity || 0.7;
  const margin = req.body.margin || 10;
  const videoPath = req.files.video[0].path;
  const watermarkPath = req.files.watermark[0].path;

  const positionMap = {
    topleft: `${margin}:${margin}`,
    topright: `main_w-overlay_w-${margin}:${margin}`,
    bottomleft: `${margin}:main_h-overlay_h-${margin}`,
    bottomright: `main_w-overlay_w-${margin}:main_h-overlay_h-${margin}`,
    center: `(main_w-overlay_w)/2:(main_h-overlay_h)/2`
  };
  const overlayPos = positionMap[position] || positionMap.bottomright;

  ffmpeg()
    .input(videoPath)
    .input(watermarkPath)
    .complexFilter([
      `[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm]`,
      `[0:v][wm]overlay=${overlayPos}`
    ])
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([videoPath, watermarkPath, output]));
    })
    .on('error', (err) => {
      cleanupFiles([videoPath, watermarkPath]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/compress', upload.single('file'), (req, res) => {
  const output = `/tmp/compressed-video-${Date.now()}.mp4`;
  const crf = req.body.crf || 28;
  const preset = req.body.preset || 'slow';
  const maxWidth = req.body.maxWidth || 1920;

  ffmpeg(req.file.path)
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioBitrate('128k')
    .outputOptions([
      `-crf ${crf}`,
      `-preset ${preset}`,
      `-vf scale='min(${maxWidth},iw)':-2`,
      '-movflags +faststart'
    ])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/speed', upload.single('file'), (req, res) => {
  const speed = parseFloat(req.body.speed) || 2.0;
  const output = `/tmp/speed-${Date.now()}.mp4`;
  const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;
  const audioFilter = `atempo=${speed}`;

  ffmpeg(req.file.path)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions([
      `-filter:v ${videoFilter}`,
      `-filter:a ${audioFilter}`,
      '-movflags +faststart'
    ])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/rotate', upload.single('file'), (req, res) => {
  const angle = parseInt(req.body.angle) || 90;
  const output = `/tmp/rotated-${Date.now()}.mp4`;

  const transposeMap = {
    90: 'transpose=1',
    180: 'transpose=1,transpose=1',
    270: 'transpose=2'
  };
  const filter = transposeMap[angle] || transposeMap[90];

  ffmpeg(req.file.path)
    .videoFilters(filter)
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/concat', upload.array('videos', 10), (req, res) => {
  const output = `/tmp/concat-${Date.now()}.mp4`;
  const listFile = `/tmp/concat-list-${Date.now()}.txt`;

  const fileList = req.files.map(f => `file '${f.path}'`).join('\n');
  fs.writeFileSync(listFile, fileList);

  ffmpeg()
    .input(listFile)
    .inputOptions(['-f concat', '-safe 0'])
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      const filePaths = req.files.map(f => f.path);
      res.download(output, () => cleanupFiles([...filePaths, listFile, output]));
    })
    .on('error', (err) => {
      const filePaths = req.files.map(f => f.path);
      cleanupFiles([...filePaths, listFile]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/add-audio', upload.fields([{name:'video'},{name:'audio'}]), (req, res) => {
  const output = `/tmp/video-with-audio-${Date.now()}.mp4`;
  const replaceAudio = req.body.replace === 'true';
  const videoPath = req.files.video[0].path;
  const audioPath = req.files.audio[0].path;

  const cmd = ffmpeg()
    .input(videoPath)
    .input(audioPath);

  if (replaceAudio) {
    cmd.outputOptions(['-map 0:v', '-map 1:a', '-shortest']);
  } else {
    cmd.complexFilter([
      '[0:a][1:a]amix=inputs=2:duration=first[aout]'
    ]).outputOptions(['-map 0:v', '-map [aout]']);
  }

  cmd
    .videoCodec('libx264')
    .audioCodec('aac')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([videoPath, audioPath, output]));
    })
    .on('error', (err) => {
      cleanupFiles([videoPath, audioPath]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/remove-audio', upload.single('file'), (req, res) => {
  const output = `/tmp/noaudio-${Date.now()}.mp4`;

  ffmpeg(req.file.path)
    .noAudio()
    .videoCodec('libx264')
    .outputOptions(['-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([req.file.path, output]));
    })
    .on('error', (err) => {
      cleanupFiles([req.file.path]);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// ─────────────────────────────────────────────────────
// ✨ TRANSIÇÕES DE VÍDEO (FFmpeg xfade)
// ─────────────────────────────────────────────────────

const XFADE_TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'fadegrays', 'dissolve',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'wipetl', 'wipetr', 'wipebl', 'wipebr',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'coverleft', 'coverright', 'coverup', 'coverdown',
  'revealleft', 'revealright', 'revealup', 'revealdown',
  'circlecrop', 'circleclose', 'circleopen', 'rectcrop',
  'diagbl', 'diagbr', 'diagtl', 'diagtr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice',
  'hlwind', 'hrwind', 'vuwind', 'vdwind',
  'horzclose', 'horzopen', 'vertclose', 'vertopen',
  'squeezev', 'squeezeh',
  'pixelize', 'radial', 'hblur', 'distance', 'zoomin'
];

function getVideoDuration(filePath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
      { encoding: 'utf8' }
    );
    const data = JSON.parse(result);
    return parseFloat(data.format.duration);
  } catch (e) {
    return 0;
  }
}

app.get('/video/transitions', (req, res) => {
  res.json({
    total: XFADE_TRANSITIONS.length,
    transitions: XFADE_TRANSITIONS,
    categories: {
      fade: ['fade', 'fadeblack', 'fadewhite', 'fadegrays', 'dissolve'],
      wipe: ['wipeleft', 'wiperight', 'wipeup', 'wipedown', 'wipetl', 'wipetr', 'wipebl', 'wipebr'],
      slide: ['slideleft', 'slideright', 'slideup', 'slidedown'],
      smooth: ['smoothleft', 'smoothright', 'smoothup', 'smoothdown'],
      cover: ['coverleft', 'coverright', 'coverup', 'coverdown'],
      reveal: ['revealleft', 'revealright', 'revealup', 'revealdown'],
      circle: ['circlecrop', 'circleclose', 'circleopen', 'rectcrop'],
      diagonal: ['diagbl', 'diagbr', 'diagtl', 'diagtr'],
      slice: ['hlslice', 'hrslice', 'vuslice', 'vdslice'],
      wind: ['hlwind', 'hrwind', 'vuwind', 'vdwind'],
      openClose: ['horzclose', 'horzopen', 'vertclose', 'vertopen'],
      squeeze: ['squeezev', 'squeezeh'],
      special: ['pixelize', 'radial', 'hblur', 'distance', 'zoomin']
    }
  });
});

app.post('/video/transition', upload.fields([{name:'video1'},{name:'video2'}]), (req, res) => {
  const output = `/tmp/transition-${Date.now()}.mp4`;
  const transition = req.body.transition || 'fade';
  const transitionDuration = parseFloat(req.body.transitionDuration) || 1;
  const crf = parseInt(req.body.crf) || 20;
  const video1Path = req.files.video1[0].path;
  const video2Path = req.files.video2[0].path;

  if (!XFADE_TRANSITIONS.includes(transition)) {
    cleanupFiles([video1Path, video2Path]);
    return res.status(400).json({
      error: `Transição "${transition}" não encontrada.`,
      available: XFADE_TRANSITIONS
    });
  }

  const duration1 = getVideoDuration(video1Path);
  if (duration1 <= transitionDuration) {
    cleanupFiles([video1Path, video2Path]);
    return res.status(400).json({
      error: `O vídeo 1 (${duration1.toFixed(2)}s) precisa ser mais longo que a duração da transição (${transitionDuration}s).`
    });
  }

  const offset = duration1 - transitionDuration;

  ffmpeg()
    .input(video1Path)
    .input(video2Path)
    .complexFilter([
      `[0:v][1:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset.toFixed(3)}[vout]`,
      `[0:a][1:a]acrossfade=d=${transitionDuration}[aout]`
    ])
    .outputOptions([
      '-map [vout]',
      '-map [aout]',
      '-c:v libx264',
      `-crf ${crf}`,
      '-preset medium',
      '-pix_fmt yuv420p',
      '-movflags +faststart'
    ])
    .on('end', () => {
      res.download(output, () => cleanupFiles([video1Path, video2Path, output]));
    })
    .on('error', (err) => {
      ffmpeg()
        .input(video1Path)
        .input(video2Path)
        .complexFilter([
          `[0:v][1:v]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset.toFixed(3)}[vout]`
        ])
        .outputOptions([
          '-map [vout]',
          '-c:v libx264',
          `-crf ${crf}`,
          '-preset medium',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-an'
        ])
        .on('end', () => {
          res.download(output, () => cleanupFiles([video1Path, video2Path, output]));
        })
        .on('error', (err2) => {
          cleanupFiles([video1Path, video2Path]);
          res.status(500).json({ error: err2.message });
        })
        .save(output);
    })
    .save(output);
});

app.post('/video/concat-transition', upload.array('videos', 10), async (req, res) => {
  const output = `/tmp/concat-trans-${Date.now()}.mp4`;
  const defaultTransition = req.body.transition || 'fade';
  const transitionDuration = parseFloat(req.body.transitionDuration) || 1;
  const crf = parseInt(req.body.crf) || 20;

  if (!req.files || req.files.length < 2) {
    return res.status(400).json({ error: 'Envie pelo menos 2 vídeos (campo: videos).' });
  }

  let transitions;
  if (req.body.transitions) {
    try {
      transitions = JSON.parse(req.body.transitions);
    } catch (e) {
      transitions = null;
    }
  }

  const filePaths = req.files.map(f => f.path);
  const numTransitions = filePaths.length - 1;
  const durations = filePaths.map(f => getVideoDuration(f));

  for (let i = 0; i < durations.length; i++) {
    if (durations[i] <= transitionDuration) {
      cleanupFiles(filePaths);
      return res.status(400).json({
        error: `O vídeo ${i + 1} (${durations[i].toFixed(2)}s) precisa ser mais longo que a transição (${transitionDuration}s).`
      });
    }
  }

  const filterParts = [];
  let cumulativeOffset = 0;

  for (let i = 0; i < numTransitions; i++) {
    const trans = (transitions && transitions[i]) ? transitions[i] : defaultTransition;

    if (!XFADE_TRANSITIONS.includes(trans)) {
      cleanupFiles(filePaths);
      return res.status(400).json({
        error: `Transição "${trans}" não encontrada.`,
        available: XFADE_TRANSITIONS
      });
    }

    cumulativeOffset += durations[i] - transitionDuration;

    const inputA = i === 0 ? `[0:v]` : `[vtemp${i}]`;
    const outputLabel = i === numTransitions - 1 ? `[vout]` : `[vtemp${i + 1}]`;

    filterParts.push(
      `${inputA}[${i + 1}:v]xfade=transition=${trans}:duration=${transitionDuration}:offset=${cumulativeOffset.toFixed(3)}${outputLabel}`
    );
  }

  const cmd = ffmpeg();
  filePaths.forEach(f => cmd.input(f));

  cmd
    .complexFilter(filterParts)
    .outputOptions([
      '-map [vout]',
      '-c:v libx264',
      `-crf ${crf}`,
      '-preset medium',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-an'
    ])
    .on('end', () => {
      res.download(output, () => cleanupFiles([...filePaths, output]));
    })
    .on('error', (err) => {
      cleanupFiles(filePaths);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

// ─────────────────────────────────────────────────────
// 🔥 HTML ANIMADO → MP4 (PROFISSIONAL)
// ─────────────────────────────────────────────────────

app.post('/video/html-to-mp4', async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'Puppeteer não disponível. Instale chromium no container.' });
  }

  const {
    html,
    width = 1920,
    height = 1080,
    duration = 5,
    fps = 30,
    crf = 18,
    preset = 'medium',
    format = 'mp4',
    transparent = false,
    deviceScaleFactor = 1
  } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Campo "html" é obrigatório.' });
  }

  const jobId = uuidv4();
  const framesDir = `/tmp/frames-${jobId}`;
  const output = `/tmp/html-video-${jobId}.${format === 'webm' ? 'webm' : 'mp4'}`;

  ensureDir(framesDir);

  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--font-render-hinting=none'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: parseInt(width),
      height: parseInt(height),
      deviceScaleFactor: parseFloat(deviceScaleFactor)
    });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));

    const totalFrames = Math.ceil(duration * fps);
    const frameDuration = 1000 / fps;

    console.log(`🎬 [${jobId}] Capturando ${totalFrames} frames (${width}x${height} @ ${fps}fps, ${duration}s)...`);

    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`);

      await page.screenshot({
        path: framePath,
        type: 'png',
        omitBackground: transparent
      });

      await page.evaluate((ms) => {
        if (window.__htmlToVideoTick) {
          window.__htmlToVideoTick(ms);
        }
      }, frameDuration);

      await page.evaluate((ms) => new Promise(resolve => setTimeout(resolve, ms)), frameDuration);
    }

    await browser.close();
    browser = null;

    console.log(`🎞️  [${jobId}] Frames capturados. Gerando vídeo com FFmpeg...`);

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(path.join(framesDir, 'frame-%06d.png'))
        .inputFPS(fps);

      if (format === 'webm' && transparent) {
        cmd
          .videoCodec('libvpx-vp9')
          .outputOptions([
            `-crf ${crf}`,
            '-b:v 0',
            '-pix_fmt yuva420p',
            '-auto-alt-ref 0'
          ])
          .toFormat('webm');
      } else if (format === 'webm') {
        cmd
          .videoCodec('libvpx-vp9')
          .outputOptions([`-crf ${crf}`, '-b:v 0'])
          .toFormat('webm');
      } else {
        cmd
          .videoCodec('libx264')
          .outputOptions([
            `-crf ${crf}`,
            `-preset ${preset}`,
            '-pix_fmt yuv420p',
            '-movflags +faststart'
          ])
          .toFormat('mp4');
      }

      cmd.on('end', resolve).on('error', reject).save(output);
    });

    console.log(`✅ [${jobId}] Vídeo gerado com sucesso!`);

    res.download(output, `video.${format === 'webm' ? 'webm' : 'mp4'}`, () => {
      cleanupFiles([output]);
      cleanupDir(framesDir);
    });

  } catch (err) {
    console.error(`❌ [${jobId}] Erro:`, err.message);
    if (browser) await browser.close().catch(() => {});
    cleanupDir(framesDir);
    cleanupFiles([output]);
    res.status(500).json({ error: err.message, jobId });
  }
});

app.post('/video/url-to-mp4', async (req, res) => {
  if (!puppeteer) {
    return res.status(503).json({ error: 'Puppeteer não disponível.' });
  }

  const {
    url,
    width = 1920,
    height = 1080,
    duration = 5,
    fps = 30,
    crf = 18,
    preset = 'medium',
    format = 'mp4',
    waitForSelector,
    waitMs = 1000,
    deviceScaleFactor = 1
  } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Campo "url" é obrigatório.' });
  }

  const jobId = uuidv4();
  const framesDir = `/tmp/frames-${jobId}`;
  const output = `/tmp/url-video-${jobId}.${format === 'webm' ? 'webm' : 'mp4'}`;

  ensureDir(framesDir);

  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: parseInt(width),
      height: parseInt(height),
      deviceScaleFactor: parseFloat(deviceScaleFactor)
    });

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    await page.evaluate((ms) => new Promise(resolve => setTimeout(resolve, ms)), waitMs);

    const totalFrames = Math.ceil(duration * fps);
    const frameDuration = 1000 / fps;

    console.log(`🌐 [${jobId}] Capturando ${totalFrames} frames da URL: ${url}`);

    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`);
      await page.screenshot({ path: framePath, type: 'png' });
      await page.evaluate((ms) => new Promise(resolve => setTimeout(resolve, ms)), frameDuration);
    }

    await browser.close();
    browser = null;

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(path.join(framesDir, 'frame-%06d.png'))
        .inputFPS(fps);

      if (format === 'webm') {
        cmd
          .videoCodec('libvpx-vp9')
          .outputOptions([`-crf ${crf}`, '-b:v 0'])
          .toFormat('webm');
      } else {
        cmd
          .videoCodec('libx264')
          .outputOptions([`-crf ${crf}`, `-preset ${preset}`, '-pix_fmt yuv420p', '-movflags +faststart'])
          .toFormat('mp4');
      }

      cmd.on('end', resolve).on('error', reject).save(output);
    });

    console.log(`✅ [${jobId}] Vídeo da URL gerado!`);

    res.download(output, `recording.${format === 'webm' ? 'webm' : 'mp4'}`, () => {
      cleanupFiles([output]);
      cleanupDir(framesDir);
    });

  } catch (err) {
    console.error(`❌ [${jobId}] Erro:`, err.message);
    if (browser) await browser.close().catch(() => {});
    cleanupDir(framesDir);
    cleanupFiles([output]);
    res.status(500).json({ error: err.message, jobId });
  }
});

app.post('/video/images-to-video', upload.array('images', 50), (req, res) => {
  const output = `/tmp/slideshow-${Date.now()}.mp4`;
  const durationPerImage = parseFloat(req.body.durationPerImage) || 3;
  const fps = parseInt(req.body.fps) || 30;
  const width = parseInt(req.body.width) || 1920;
  const height = parseInt(req.body.height) || 1080;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Envie pelo menos uma imagem.' });
  }

  const cmd = ffmpeg();

  req.files.forEach(file => {
    cmd
      .input(file.path)
      .inputOptions(['-loop 1', `-t ${durationPerImage}`]);
  });

  const filterParts = [];
  const concatInputs = [];

  req.files.forEach((file, i) => {
    filterParts.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`);
    concatInputs.push(`[v${i}]`);
  });

  filterParts.push(`${concatInputs.join('')}concat=n=${req.files.length}:v=1:a=0[outv]`);

  cmd
    .complexFilter(filterParts, 'outv')
    .videoCodec('libx264')
    .outputOptions(['-crf 20', '-preset medium', '-pix_fmt yuv420p', '-movflags +faststart'])
    .on('end', () => {
      const filePaths = req.files.map(f => f.path);
      res.download(output, () => cleanupFiles([...filePaths, output]));
    })
    .on('error', (err) => {
      const filePaths = req.files.map(f => f.path);
      cleanupFiles(filePaths);
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/text-to-video', (req, res) => {
  const {
    text = 'Hello World',
    duration = 5,
    fontSize = 72,
    fontColor = 'white',
    bgColor = '0x1a1a2e',
    width = 1920,
    height = 1080,
    animation = 'fade'
  } = req.body;

  const output = `/tmp/text-video-${Date.now()}.mp4`;
  const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');

  let drawTextFilter;

  switch (animation) {
    case 'scroll':
      drawTextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=h-t*100:shadowcolor=black:shadowx=2:shadowy=2`;
      break;
    case 'typewriter':
      drawTextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,0)':shadowcolor=black:shadowx=2:shadowy=2`;
      break;
    case 'fade':
    default:
      drawTextFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}@%{eif\\:min(1,t/1)\\:d}:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`;
      break;
  }

  ffmpeg()
    .input(`color=c=${bgColor}:s=${width}x${height}:d=${duration}:r=30`)
    .inputOptions(['-f lavfi'])
    .videoFilters(drawTextFilter)
    .videoCodec('libx264')
    .outputOptions(['-crf 18', '-preset medium', '-pix_fmt yuv420p', '-movflags +faststart'])
    .on('end', () => {
      res.download(output, () => cleanupFiles([output]));
    })
    .on('error', (err) => {
      res.status(500).json({ error: err.message });
    })
    .save(output);
});

app.post('/video/probe', upload.single('file'), (req, res) => {
  ffmpeg.ffprobe(req.file.path, (err, metadata) => {
    cleanupFiles([req.file.path]);
    if (err) return res.status(500).json({ error: err.message });

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    res.json({
      format: metadata.format,
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: eval(videoStream.r_frame_rate),
        bitrate: videoStream.bit_rate,
        duration: videoStream.duration
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels,
        bitrate: audioStream.bit_rate
      } : null,
      streams: metadata.streams
    });
  });
});

// ─────────────────────────────────────────────────────
// 📋 Página inicial com lista de endpoints
// ─────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    name: 'FFmpeg Media API',
    version: '3.1.0',
    description: 'API profissional para processamento de áudio, vídeo e HTML→MP4',
    endpoints: {
      audio: {
        conversion: [
          'POST /convert/audio/to/mp3 - Converter áudio para MP3 (file)',
          'POST /convert/audio/to/wav - Converter áudio para WAV (file)',
          'POST /convert/audio/to/ogg - Converter áudio para OGG/Vorbis (file)',
          '🆕 POST /convert/audio/to/whatsapp - OGG/Opus pra WhatsApp PTT (file, bitrate, sampleRate, channels)',
        ],
        processing: [
          'POST /audio/normalize-mp3 - Normaliza + MP3 44100Hz',
          'POST /audio/normalize-ogg - Normaliza + OGG/Vorbis 44100Hz',
          '🆕 POST /audio/normalize-whatsapp - Normaliza + OGG/Opus pra WhatsApp PTT',
          'POST /audio/reverb-normalize-mp3 - Reverb+Normaliza+Volume+MP3',
          'POST /audio/reverb-normalize-ogg - Reverb+Normaliza+Volume+OGG',
          'POST /audio/mix - Mix 2 áudios sobrepostos',
          'POST /audio/concat - Concatenar áudios em sequência',
          'POST /audio/reverb - Adiciona reverb',
          'POST /audio/compress - Compressor dinâmico',
          'POST /audio/normalize - Normalização de loudness',
          'POST /audio/fade - Fade in/out',
          'POST /audio/eq - Equalização',
          'POST /audio/crossfade - Crossfade entre 2 áudios',
          'POST /audio/gate - Remove ruído de fundo',
        ],
        info: [
          'POST /probe - Informações do arquivo de áudio',
        ]
      },
      video: {
        conversion: [
          'POST /convert/video/to/mp4',
          'POST /convert/video/to/webm',
          'POST /convert/video/to/gif',
        ],
        processing: [
          'POST /video/resize',
          'POST /video/trim',
          'POST /video/compress',
          'POST /video/speed',
          'POST /video/rotate',
          'POST /video/concat',
          'POST /video/watermark',
          'POST /video/remove-audio',
        ],
        audioVideo: [
          'POST /video/extract-audio',
          'POST /video/add-audio',
        ],
        generation: [
          '🔥 POST /video/html-to-mp4',
          '🔥 POST /video/url-to-mp4',
          'POST /video/images-to-video',
          'POST /video/text-to-video',
        ],
        info: [
          'POST /video/probe',
          'POST /video/thumbnail',
        ],
        transitions: [
          '✨ GET /video/transitions',
          '✨ POST /video/transition',
          '✨ POST /video/concat-transition',
        ]
      }
    }
  });
});

function resolveCookiesPath(req) {
  if (req.body.cookies_b64) {
    const tmpCookiePath = `/tmp/cookies_${Date.now()}_${uuidv4()}.txt`;
    const decoded = Buffer.from(req.body.cookies_b64, 'base64').toString('utf8');
    fs.writeFileSync(tmpCookiePath, decoded, { mode: 0o600 });
    return { path: tmpCookiePath, isTemp: true };
  }
  
  if (process.env.YOUTUBE_COOKIES_PATH && fs.existsSync(process.env.YOUTUBE_COOKIES_PATH)) {
    return { path: process.env.YOUTUBE_COOKIES_PATH, isTemp: false };
  }
  
  if (fs.existsSync('/app/cookies/youtube.txt')) {
    return { path: '/app/cookies/youtube.txt', isTemp: false };
  }
  
  return { path: null, isTemp: false };
}

app.post('/youtube/cookies', express.json({ limit: '5mb' }), (req, res) => {
  const { cookies_b64, secret } = req.body;
  
  if (!process.env.COOKIES_UPLOAD_SECRET) {
    return res.status(503).json({ error: 'Upload desabilitado — defina COOKIES_UPLOAD_SECRET' });
  }
  
  if (secret !== process.env.COOKIES_UPLOAD_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!cookies_b64) {
    return res.status(400).json({ error: 'cookies_b64 obrigatório' });
  }
  
  try {
    const decoded = Buffer.from(cookies_b64, 'base64').toString('utf8');
    
    if (!decoded.includes('# Netscape HTTP Cookie File') && !decoded.includes('.youtube.com')) {
      return res.status(400).json({ error: 'Formato inválido — esperado cookies.txt Netscape' });
    }
    
    ensureDir('/app/cookies');
    fs.writeFileSync('/app/cookies/youtube.txt', decoded, { mode: 0o600 });
    
    res.json({ 
      ok: true, 
      message: 'Cookies atualizados',
      size_bytes: decoded.length,
      lines: decoded.split('\n').length
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao salvar cookies', details: err.message });
  }
});

async function getCommandVersion(cmd, arg) {
  try {
    const { execSync } = require('child_process');
    return execSync(`${cmd} ${arg}`, { encoding: 'utf-8' }).split('\n')[0].trim();
  } catch (e) {
    return null;
  }
}

app.get('/youtube/health', async (req, res) => {
  const ytdlpVersion = await getCommandVersion('yt-dlp', '--version');
  const ffmpegVersion = await getCommandVersion('ffmpeg', '-version');
  const denoVersion = await getCommandVersion('deno', '--version');
  let impersonateTargets = "";
  try {
    const { execSync } = require('child_process');
    impersonateTargets = execSync('yt-dlp --list-impersonate-targets', { encoding: 'utf-8' }).trim();
  } catch (e) {
    impersonateTargets = "Erro: " + e.message;
  }
  
  const cookiesPath = '/app/cookies/youtube.txt';
  const cookiesExist = fs.existsSync(cookiesPath);
  const cookiesAge = cookiesExist 
    ? Math.floor((Date.now() - fs.statSync(cookiesPath).mtimeMs) / 1000 / 86400)
    : null;
  
  res.json({
    ok: true,
    ytdlp_version: ytdlpVersion,
    ffmpeg_version: ffmpegVersion,
    deno_version: denoVersion,
    deno_available: !!denoVersion,
    impersonate_targets: impersonateTargets,
    cookies_loaded: cookiesExist,
    cookies_age_days: cookiesAge,
    cookies_warning: cookiesAge > 25 ? 'Cookies podem estar expirados (>25 dias)' : null,
    cookies_upload_enabled: !!process.env.COOKIES_UPLOAD_SECRET
  });
});

app.post('/youtube/trim', (req, res) => {
  const { youtube_url, start, end, format = 'mp4', quality = '1080' } = req.body;

  if (!youtube_url || !start || !end) {
    return res.status(400).json({ error: 'Faltam campos: youtube_url, start, end' });
  }

  let startSec, endSec;
  try {
    startSec = parseTimestamp(start);
    endSec = parseTimestamp(end);
    if (endSec <= startSec) throw new Error('end deve ser maior que start');
  } catch (err) {
    return res.status(400).json({ error: 'Timestamps inválidos: ' + err.message });
  }

  const outputId = uuidv4();
  const tmpDir = '/tmp/youtube-trim';
  ensureDir(tmpDir);
  const outputPath = `${tmpDir}/${outputId}.${format}`;
  
  const startStr = formatTimestamp(startSec);
  const endStr = formatTimestamp(endSec);
  const formatStr = `bestvideo[height<=${quality}]+bestaudio/best`;
  
  const cookieInfo = resolveCookiesPath(req);
  const cookiesPath = cookieInfo.path;
  const isTempCookie = cookieInfo.isTemp;

  const ytdlpArgs = [
    '--no-playlist',
    '--no-warnings',
    '--download-sections', `*${startStr}-${endStr}`,
    '--force-keyframes-at-cuts',
    '--js-runtimes', 'deno',
    '--extractor-args', 'youtube:player_client=default,web_safari,mweb'
  ];

  if (cookiesPath) {
    ytdlpArgs.push('--cookies', cookiesPath);
    console.log(`[youtube-trim] 🍪 cookies loaded from ${cookiesPath}`);
  } else {
    ytdlpArgs.push('--impersonate', 'safari');
    console.log(`[youtube-trim] 🍪 no cookies, falling back to impersonate`);
  }

  ytdlpArgs.push('-f', formatStr, '-o', outputPath, youtube_url);

  let responseSent = false;
  console.log(`[youtube-trim] 🎬 ytdlp Baixando: ${youtube_url} | ${startStr} -> ${endStr} | res: ${quality}p`);
  
  const { spawn } = require('child_process');
  const ytProcess = spawn('yt-dlp', ytdlpArgs);
  
  let stderrData = '';
  ytProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });
  
  const timeoutId = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      ytProcess.kill('SIGKILL');
      cleanupFiles(isTempCookie ? [outputPath, cookiesPath] : [outputPath]);
      res.status(504).json({ error: 'Timeout de processamento (10 minutos)' });
    }
  }, 10 * 60 * 1000);

  ytProcess.on('close', (code) => {
    clearTimeout(timeoutId);
    if (responseSent) return;
    responseSent = true;
    
    if (code !== 0) {
      cleanupFiles(isTempCookie ? [outputPath, cookiesPath] : [outputPath]);
      console.log(`[youtube-trim] ❌ erro yt-dlp: exit code ${code}`);
      return res.status(500).json({ 
        error: 'Erro no yt-dlp', 
        details: stderrData 
      });
    }

    if (!fs.existsSync(outputPath)) {
      cleanupFiles(isTempCookie ? [cookiesPath] : []);
      return res.status(500).json({ error: 'Arquivo final não gerado pelo yt-dlp', details: stderrData });
    }

    const refinedPath = `${tmpDir}/refined-${outputId}.${format}`;
    console.log(`[youtube-trim] ✂️ ffmpeg refinando video`);
    
    ffmpeg(outputPath)
      .outputOptions(['-c copy', '-movflags +faststart'])
      .on('end', () => {
        console.log(`[youtube-trim] ✅ Refinado e enviando`);
        res.download(refinedPath, `youtube_trim_${outputId}.${format}`, () => {
          cleanupFiles(isTempCookie ? [outputPath, refinedPath, cookiesPath] : [outputPath, refinedPath]);
        });
      })
      .on('error', (ffmpegErr) => {
        cleanupFiles(isTempCookie ? [outputPath, refinedPath, cookiesPath] : [outputPath, refinedPath]);
        console.log(`[youtube-trim] ❌ erro ffmpeg refine: ${ffmpegErr.message}`);
        res.status(500).json({ error: 'Erro no ffmpeg refine', details: ffmpegErr.message });
      })
      .save(refinedPath);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 FFmpeg Media API v3.1.0 rodando na porta ${PORT}`);
  console.log(`📡 Endpoints: áudio (captura live!), vídeo, HTML→MP4`);
  console.log(`🎙️  Total de Endpoints: 46`);
  console.log(`🌐 http://localhost:${PORT}`);
});
