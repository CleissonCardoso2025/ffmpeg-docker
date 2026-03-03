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

// Endpoint: Converter para OGG
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
  
  // Reverb
  filters.push(`aecho=0.8:0.9:${delay}:${decay}`);
  
  // Compressor
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  // Normalização
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  // Volume boost
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
  
  // Reverb
  filters.push(`aecho=0.8:0.9:${delay}:${decay}`);
  
  // Compressor
  if (volumeBoost > 1.2) {
    filters.push('acompressor=threshold=0.05:ratio=10:attack=100:release=500');
  }
  
  // Normalização
  filters.push(`loudnorm=I=${loudness}:TP=${truePeak}:LRA=${lra}`);
  
  // Volume boost
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

  // Criar arquivo de lista para concat
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
// 🎬 VÍDEO — Novos Endpoints
// ─────────────────────────────────────────────────────

// Endpoint: Converter vídeo para MP4
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

// Endpoint: Converter vídeo para WebM
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

// Endpoint: Converter vídeo para GIF
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

// Endpoint: Extrair áudio de vídeo
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

// Endpoint: Redimensionar vídeo
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

// Endpoint: Cortar vídeo (trim)
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

// Endpoint: Gerar thumbnail do vídeo
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

// Endpoint: Adicionar marca d'água em vídeo
app.post('/video/watermark', upload.fields([{name:'video'},{name:'watermark'}]), (req, res) => {
  const output = `/tmp/watermarked-${Date.now()}.mp4`;
  const position = req.body.position || 'bottomright'; // topleft, topright, bottomleft, bottomright, center
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

// Endpoint: Comprimir vídeo
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

// Endpoint: Velocidade do vídeo
app.post('/video/speed', upload.single('file'), (req, res) => {
  const speed = parseFloat(req.body.speed) || 2.0; // 2.0 = 2x mais rápido, 0.5 = metade velocidade
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

// Endpoint: Rotacionar vídeo
app.post('/video/rotate', upload.single('file'), (req, res) => {
  const angle = parseInt(req.body.angle) || 90; // 90, 180, 270
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

// Endpoint: Concatenar múltiplos vídeos
app.post('/video/concat', upload.array('videos', 10), (req, res) => {
  const output = `/tmp/concat-${Date.now()}.mp4`;
  const listFile = `/tmp/concat-list-${Date.now()}.txt`;

  // Criar arquivo de lista para concat
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

// Endpoint: Adicionar áudio a vídeo
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

// Endpoint: Remover áudio do vídeo
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
// 🔥 HTML ANIMADO → MP4 (PROFISSIONAL)
// ─────────────────────────────────────────────────────

/**
 * 🔥 Endpoint principal: HTML animado → MP4
 * 
 * Renderiza HTML/CSS/JS animado em vídeo MP4 de alta qualidade
 * usando Puppeteer (headless Chromium) para captura de frames
 * e FFmpeg para encoding do vídeo.
 * 
 * Body (JSON):
 * - html: string (HTML completo com <style> e <script> inline)
 * - width: number (padrão: 1920)
 * - height: number (padrão: 1080)
 * - duration: number (duração em segundos, padrão: 5)
 * - fps: number (frames por segundo, padrão: 30)
 * - crf: number (qualidade 0-51, menor=melhor, padrão: 18)
 * - preset: string (ultrafast,superfast,veryfast,faster,fast,medium,slow,slower,veryslow)
 * - format: string ('mp4' ou 'webm', padrão: 'mp4')
 * - transparent: boolean (fundo transparente com WebM/VP9, padrão: false)
 * - deviceScaleFactor: number (resolução do dispositivo, padrão: 1)
 */
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
    // Lançar browser headless
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

    // Carregar o HTML
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Aguardar animações CSS iniciais carregar
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));

    const totalFrames = Math.ceil(duration * fps);
    const frameDuration = 1000 / fps;

    console.log(`🎬 [${jobId}] Capturando ${totalFrames} frames (${width}x${height} @ ${fps}fps, ${duration}s)...`);

    // Capturar frames
    for (let i = 0; i < totalFrames; i++) {
      const framePath = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`);

      await page.screenshot({
        path: framePath,
        type: 'png',
        omitBackground: transparent
      });

      // Avançar o tempo das animações CSS/JS
      await page.evaluate((ms) => {
        // Disparar requestAnimationFrame callbacks
        if (window.__htmlToVideoTick) {
          window.__htmlToVideoTick(ms);
        }
      }, frameDuration);

      // Esperar o tempo real do frame para animações CSS nativas
      await page.evaluate((ms) => new Promise(resolve => setTimeout(resolve, ms)), frameDuration);
    }

    await browser.close();
    browser = null;

    console.log(`🎞️  [${jobId}] Frames capturados. Gerando vídeo com FFmpeg...`);

    // Construir comando FFmpeg
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

      cmd
        .on('end', resolve)
        .on('error', reject)
        .save(output);
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

/**
 * 🔥 HTML animado → MP4 via URL
 * 
 * Carrega uma URL, espera as animações, e grava como vídeo.
 * 
 * Body (JSON):
 * - url: string (URL da página)
 * - width, height, duration, fps, crf, preset, format (mesmos do html-to-mp4)
 * - waitForSelector: string (CSS selector para esperar antes de gravar)
 * - waitMs: number (milissegundos adicionais para esperar, padrão: 1000)
 */
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

/**
 * 🔥 Imagens para vídeo slideshow
 * 
 * Cria um vídeo slideshow a partir de imagens com transições
 * 
 * Body (form-data):
 * - images: array de files
 * - durationPerImage: number (segundos por imagem, padrão: 3)
 * - transitionDuration: number (segundos de transição, padrão: 1)
 * - fps: number (padrão: 30)
 * - width: number (padrão: 1920)
 * - height: number (padrão: 1080)
 */
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

  // Adicionar cada imagem como input com loop e duração
  req.files.forEach(file => {
    cmd
      .input(file.path)
      .inputOptions(['-loop 1', `-t ${durationPerImage}`]);
  });

  // Construir filtro complexo para concat
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

/**
 * 🔥 Texto para vídeo
 * 
 * Gera um vídeo com texto animado sobre fundo colorido
 * 
 * Body (JSON):
 * - text: string (texto a renderizar)
 * - duration: number (padrão: 5)
 * - fontSize: number (padrão: 72)
 * - fontColor: string (padrão: 'white')
 * - bgColor: string (padrão: '0x1a1a2e')
 * - width: number (padrão: 1920)
 * - height: number (padrão: 1080)
 * - animation: string ('fade', 'scroll', 'typewriter', padrão: 'fade')
 */
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

// Endpoint: Probe de vídeo (informações detalhadas)
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
    version: '3.0.0',
    description: 'API profissional para processamento de áudio, vídeo e HTML→MP4',
    endpoints: {
      audio: {
        conversion: [
          'POST /convert/audio/to/mp3 - Converter áudio para MP3 (file)',
          'POST /convert/audio/to/wav - Converter áudio para WAV (file)',
          'POST /convert/audio/to/ogg - Converter áudio para OGG (file)',
        ],
        processing: [
          'POST /audio/normalize-mp3 - Normaliza + MP3 44100Hz (loudness, truePeak, lra, volumeBoost, bitrate)',
          'POST /audio/normalize-ogg - Normaliza + OGG 44100Hz (loudness, truePeak, lra, volumeBoost, bitrate)',
          'POST /audio/reverb-normalize-mp3 - Reverb+Normaliza+Volume+MP3 (decay, delay, volumeBoost, bitrate)',
          'POST /audio/reverb-normalize-ogg - Reverb+Normaliza+Volume+OGG (decay, delay, volumeBoost, bitrate)',
          'POST /audio/mix - Mix 2 áudios sobrepostos (audio1, audio2)',
          'POST /audio/concat - Concatenar áudios em sequência (audios[], format: mp3|wav|ogg)',
          'POST /audio/reverb - Adiciona reverb (file, decay, delay)',
          'POST /audio/compress - Compressor dinâmico (file, threshold, ratio, attack, release)',
          'POST /audio/normalize - Normalização de loudness (file)',
          'POST /audio/fade - Fade in/out (file, duration)',
          'POST /audio/eq - Equalização (file, bass, treble)',
          'POST /audio/crossfade - Crossfade entre 2 áudios (audio1, audio2, duration)',
          'POST /audio/gate - Remove ruído de fundo (file, threshold)',
        ],
        info: [
          'POST /probe - Informações do arquivo de áudio (file)',
        ]
      },
      video: {
        conversion: [
          'POST /convert/video/to/mp4 - Converter vídeo para MP4 (file, crf, preset)',
          'POST /convert/video/to/webm - Converter vídeo para WebM VP9 (file, crf)',
          'POST /convert/video/to/gif - Converter vídeo para GIF animado (file, fps, width)',
        ],
        processing: [
          'POST /video/resize - Redimensionar vídeo (file, width, height)',
          'POST /video/trim - Cortar vídeo (file, start, duration)',
          'POST /video/compress - Comprimir vídeo (file, crf, preset, maxWidth)',
          'POST /video/speed - Alterar velocidade (file, speed)',
          'POST /video/rotate - Rotacionar vídeo (file, angle: 90|180|270)',
          'POST /video/concat - Concatenar vídeos (videos[])',
          'POST /video/watermark - Marca d\'água (video, watermark, position, opacity)',
          'POST /video/remove-audio - Remover áudio (file)',
        ],
        audioVideo: [
          'POST /video/extract-audio - Extrair áudio de vídeo (file, format)',
          'POST /video/add-audio - Adicionar áudio a vídeo (video, audio, replace)',
        ],
        generation: [
          '🔥 POST /video/html-to-mp4 - HTML animado → MP4 (html, width, height, duration, fps, crf, preset, format, transparent)',
          '🔥 POST /video/url-to-mp4 - Gravar URL como vídeo (url, width, height, duration, fps, waitForSelector)',
          'POST /video/images-to-video - Slideshow de imagens (images[], durationPerImage, fps, width, height)',
          'POST /video/text-to-video - Texto animado → vídeo (text, duration, fontSize, fontColor, bgColor, animation)',
        ],
        info: [
          'POST /video/probe - Informações detalhadas do vídeo (file)',
          'POST /video/thumbnail - Gerar thumbnail do vídeo (file, timestamp, width)',
        ]
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 FFmpeg Media API v3.0.0 rodando na porta ${PORT}`);
  console.log(`📡 Endpoints: áudio, vídeo, HTML→MP4`);
  console.log(`🌐 http://localhost:${PORT}`);
});
