const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(os.tmpdir(), 'ffmpeg-voice');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.fieldname}${path.extname(file.originalname || '.wav')}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

function cleanupFiles(files) {
  files.forEach(f => {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  });
}

// ─────────────────────────────────────────────────────
// POST /audio/radio-voice
// ─────────────────────────────────────────────────────
router.post('/radio-voice', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.', code: 'MISSING_FILE' });
  }

  const startTime = Date.now();
  const jobId = uuidv4();
  
  // Parâmetros opcionais
  const profile = (req.body.profile || 'radio').toLowerCase();
  let format = (req.body.format || 'mp3').toLowerCase();
  const bitrate = req.body.bitrate || '192k';

  // Forçar formatos válidos
  if (!['mp3', 'wav', 'ogg'].includes(format)) format = 'mp3';

  const output = path.join(uploadDir, `voice-${jobId}.${format}`);
  let responseSent = false;
  
  // Timeout de 2 minutos
  const timeoutId = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      cleanupFiles([req.file.path, output]);
      res.status(504).json({ error: 'Timeout no processamento', code: 'TIMEOUT' });
    }
  }, 120_000);

  const finish = () => {
    clearTimeout(timeoutId);
    cleanupFiles([req.file.path, output]);
  };

  // Configuração dos Profiles
  const profiles = {
    radio: {
      gate: 'agate=threshold=0.005:ratio=2:attack=20:release=1000',
      eq: 'equalizer=f=80:width_type=h:width=50:g=-3,equalizer=f=300:width_type=h:width=100:g=-1,equalizer=f=3000:width_type=h:width=200:g=3,equalizer=f=8000:width_type=h:width=200:g=2',
      comp: 'acompressor=threshold=0.1:ratio=3:attack=50:release=500',
      loudnorm: 'loudnorm=I=-16:TP=-1.0:LRA=6',
      volume: '1.10'
    },
    podcast: {
      gate: 'agate=threshold=0.005:ratio=2:attack=20:release=1000',
      eq: 'equalizer=f=80:width_type=h:width=50:g=-2,equalizer=f=3000:width_type=h:width=200:g=2',
      comp: 'acompressor=threshold=0.1:ratio=2:attack=50:release=500',
      loudnorm: 'loudnorm=I=-18:TP=-1.0:LRA=8',
      volume: '1.0'
    },
    whatsapp: {
      gate: 'agate=threshold=0.01:ratio=2:attack=20:release=1000',
      eq: 'equalizer=f=100:width_type=h:width=50:g=-5,equalizer=f=3000:width_type=h:width=200:g=4',
      comp: 'acompressor=threshold=0.08:ratio=4:attack=50:release=500',
      loudnorm: 'loudnorm=I=-14:TP=-1.0:LRA=5',
      volume: '1.15'
    },
    news: {
      gate: 'agate=threshold=0.005:ratio=2:attack=20:release=1000',
      eq: 'equalizer=f=100:width_type=h:width=50:g=-2,equalizer=f=3000:width_type=h:width=200:g=4,equalizer=f=8000:width_type=h:width=200:g=3',
      comp: 'acompressor=threshold=0.1:ratio=4:attack=10:release=200',
      loudnorm: 'loudnorm=I=-16:TP=-1.0:LRA=5',
      volume: '1.10'
    }
  };

  const selectedProfile = profiles[profile] || profiles['radio'];

  // Construir cadeia de filtros
  const filters = [
    selectedProfile.gate,
    selectedProfile.eq,
    selectedProfile.comp,
    selectedProfile.loudnorm,
    `volume=${selectedProfile.volume}`
  ].join(',');

  console.log(`[radio-voice] Job ${jobId} | Profile: ${profile} | Format: ${format}`);

  let cmd = ffmpeg(req.file.path).audioFilters(filters).audioFrequency(44100).audioChannels(2);

  if (format === 'mp3') {
    cmd = cmd.audioCodec('libmp3lame').audioBitrate(bitrate).outputOptions(['-joint_stereo 1']);
  } else if (format === 'ogg') {
    cmd = cmd.audioCodec('libvorbis').audioBitrate(bitrate);
  } else if (format === 'wav') {
    cmd = cmd.audioCodec('pcm_s16le');
  }

  cmd
    .toFormat(format)
    .on('end', () => {
      if (responseSent) return;
      responseSent = true;

      let sizeKB = '?';
      try {
        const stat = fs.statSync(output);
        sizeKB = (stat.size / 1024).toFixed(0);
      } catch (_) {}

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      let mimeType = 'audio/mpeg';
      if (format === 'wav') mimeType = 'audio/wav';
      if (format === 'ogg') mimeType = 'audio/ogg';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="radio_voice_${jobId}.${format}"`);
      res.setHeader('X-Processing-Time', `${elapsed}s`);
      res.setHeader('X-File-Size-KB', sizeKB);

      res.download(output, `radio_voice_${jobId}.${format}`, () => finish());
    })
    .on('error', (err) => {
      if (responseSent) return;
      responseSent = true;
      finish();
      console.error(`[radio-voice] Erro: ${err.message}`);
      res.status(500).json({ error: 'Erro no processamento FFmpeg', details: err.message });
    })
    .save(output);
});

module.exports = router;
