const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: '/tmp/uploads/' });

app.use(cors());
app.use(express.json());

// Função auxiliar para limpar arquivos temporários
function cleanupFiles(files) {
  files.forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
}

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

// Endpoint: Adicionar Reverb
app.post('/audio/reverb', upload.single('file'), (req, res) => {
  const output = `/tmp/reverb-${Date.now()}.wav`;
  const decay = req.body.decay || 0.8;
  const delay = req.body.delay || 1000;
  
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

// Página inicial com lista de endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'FFmpeg Audio API',
    version: '1.0.0',
    endpoints: [
      'POST /convert/audio/to/mp3',
      'POST /convert/audio/to/wav',
      'POST /audio/mix - Mix 2 áudios (audio1, audio2)',
      'POST /audio/reverb - Adiciona reverb (file, decay, delay)',
      'POST /audio/compress - Compressor dinâmico (file, threshold, ratio, attack, release)',
      'POST /audio/normalize - Normalização de loudness',
      'POST /audio/fade - Fade in/out (file, duration)',
      'POST /audio/eq - Equalização (file, bass, treble)',
      'POST /audio/crossfade - Crossfade entre 2 áudios (audio1, audio2, duration)',
      'POST /audio/gate - Remove ruído de fundo (file, threshold)',
      'POST /probe - Informações do arquivo'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg Audio API rodando na porta ${PORT}`);
});
