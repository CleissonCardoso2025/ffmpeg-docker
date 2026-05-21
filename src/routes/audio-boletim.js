const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────
// Configuração de upload para o boletim (3 campos)
// ─────────────────────────────────────────────────────
const uploadDir = path.join(os.tmpdir(), 'ffmpeg-boletim');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.fieldname}.mp3`)
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB por arquivo
});

// ─────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────

/**
 * Remove arquivos temporários com segurança
 */
function cleanupFiles(files) {
  files.forEach(f => {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  });
}

/**
 * Baixa uma URL para um arquivo temporário local.
 * Retorna o caminho do arquivo baixado.
 */
function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Redireciona
        file.close();
        fs.unlinkSync(destPath);
        downloadUrl(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Falha ao baixar ${url}: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });

    request.on('error', err => {
      file.close();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(new Error(`Erro de rede ao baixar ${url}: ${err.message}`));
    });

    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error(`Timeout ao baixar ${url}`));
    });
  });
}

/**
 * Retorna a duração (em segundos) de um arquivo de áudio via ffprobe.
 */
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe falhou em ${path.basename(filePath)}: ${err.message}`));
      const duration = metadata?.format?.duration;
      if (!duration || isNaN(duration)) {
        return reject(new Error(`Não foi possível determinar a duração de ${path.basename(filePath)}`));
      }
      resolve(parseFloat(duration));
    });
  });
}

// ─────────────────────────────────────────────────────
// POST /audio/montar-boletim
// ─────────────────────────────────────────────────────

/**
 * Monta um boletim de rádio combinando:
 *   - trilha    → música de fundo
 *   - voz       → locução já normalizada
 *   - vinheta_final → vinheta de encerramento
 *
 * Timeline:
 *   0s ──── delay_voz ──── (delay_voz + dur_voz)s ──── FIM
 *   │  TRILHA 100%  │  TRILHA 30% + VOZ  │  VINHETA FINAL  │
 */
router.post(
  '/montar-boletim',
  upload.fields([
    { name: 'trilha', maxCount: 1 },
    { name: 'voz', maxCount: 1 },
    { name: 'vinheta_final', maxCount: 1 }
  ]),
  async (req, res) => {
    const startTime = Date.now();
    const jobId = uuidv4();
    const tmpFiles = [];

    // Timeout de 120s
    const TIMEOUT_MS = 120_000;
    let responseSent = false;
    let ffmpegCmd = null;

    const timeoutId = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        if (ffmpegCmd) try { ffmpegCmd.kill('SIGKILL'); } catch (_) {}
        cleanupFiles(tmpFiles);
        res.status(504).json({
          error: 'Timeout: o processamento excedeu 120 segundos.',
          code: 'TIMEOUT'
        });
      }
    }, TIMEOUT_MS);

    const finish = () => {
      clearTimeout(timeoutId);
      cleanupFiles(tmpFiles);
    };

    try {
      // ── 1. Parâmetros opcionais ──────────────────────────
      const delayVoz = parseFloat(req.body.delay_voz ?? 9);
      const volumeDucking = parseFloat(req.body.volume_trilha_ducking ?? 0.3);
      const fadeVinheta = parseFloat(req.body.fade_vinheta ?? 0.3);

      if (isNaN(delayVoz) || delayVoz < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`delay_voz` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }
      if (isNaN(volumeDucking) || volumeDucking < 0 || volumeDucking > 1) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`volume_trilha_ducking` deve estar entre 0.0 e 1.0', code: 'INVALID_PARAM' });
      }
      if (isNaN(fadeVinheta) || fadeVinheta < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`fade_vinheta` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }

      // ── 2. Resolver os 3 arquivos (upload ou URL) ────────
      const resolveInput = async (fieldName) => {
        const uploadedFile = req.files?.[fieldName]?.[0];
        const urlValue = req.body?.[`${fieldName}_url`] || req.body?.[fieldName];

        if (uploadedFile) {
          tmpFiles.push(uploadedFile.path);
          return uploadedFile.path;
        }

        // Se não foi upload, tenta como URL no body (JSON ou form-data texto)
        if (urlValue && /^https?:\/\//.test(urlValue)) {
          const destPath = path.join(uploadDir, `${jobId}-${fieldName}.mp3`);
          tmpFiles.push(destPath);
          await downloadUrl(urlValue, destPath);
          return destPath;
        }

        return null;
      };

      const [trilhaPath, vozPath, vinheta_finalPath] = await Promise.all([
        resolveInput('trilha'),
        resolveInput('voz'),
        resolveInput('vinheta_final')
      ]);

      // ── 3. Validar presença dos 3 arquivos ──────────────
      const missing = [];
      if (!trilhaPath) missing.push('trilha');
      if (!vozPath) missing.push('voz');
      if (!vinheta_finalPath) missing.push('vinheta_final');

      if (missing.length > 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({
          error: `Parâmetro(s) obrigatório(s) faltando: ${missing.join(', ')}. Envie como arquivo (multipart) ou como URL no campo correspondente.`,
          code: 'MISSING_FILES',
          missing
        });
      }

      console.log(`[montar-boletim] Job ${jobId} | delay=${delayVoz}s | ducking=${volumeDucking} | fade=${fadeVinheta}s`);

      // ── 4. Checar duração da voz (para log) ─────────────
      let vozDuration = '?';
      try { vozDuration = (await getAudioDuration(vozPath)).toFixed(1); } catch (_) {}
      console.log(`[montar-boletim] Duração da voz: ${vozDuration}s`);

      // ── 5. Arquivo de saída ──────────────────────────────
      const outputPath = path.join(uploadDir, `boletim-${jobId}.mp3`);
      tmpFiles.push(outputPath);

      // ── 6. Montar filter_complex parametrizado ───────────
      //
      // Lógica:
      //   [1:a] → voz com adelay (delay_voz * 1000 ms em cada canal)
      //   [0:a] → trilha com volume dinâmico: 100% antes de delay_voz, ducking% depois
      //   amix dos dois → "corpo" (trilha some quando a voz termina, via duration=shortest + apad mínimo)
      //   acrossfade "corpo" → vinheta_final com fade suave
      //
      const delayMs = Math.round(delayVoz * 1000);
      const filterComplex = [
        // Voz com delay
        `[1:a]adelay=${delayMs}|${delayMs}[voz_delay]`,
        // Trilha com volume dinâmico (eval=frame necessário para atualizar a cada frame)
        `[0:a]volume='if(lt(t,${delayVoz}),1.0,${volumeDucking})':eval=frame[trilha_dinamica]`,
        // Mix trilha + voz — usa shortest para parar quando a voz terminar
        `[trilha_dinamica][voz_delay]amix=inputs=2:duration=shortest:dropout_transition=0[corpo]`,
        // Crossfade do corpo com a vinheta final
        `[corpo][2:a]acrossfade=d=${fadeVinheta}:c1=tri:c2=tri[out]`
      ].join(';');

      // ── 7. Executar FFmpeg ───────────────────────────────
      ffmpegCmd = ffmpeg()
        .input(trilhaPath)
        .input(vozPath)
        .input(vinheta_finalPath)
        .complexFilter(filterComplex)
        .outputOptions([
          '-map [out]',
          '-ac 2',
          '-ar 44100',
          '-b:a 192k',
          '-id3v2_version 3'
        ])
        .audioCodec('libmp3lame')
        .toFormat('mp3');

      ffmpegCmd
        .on('start', (cmd) => {
          console.log(`[montar-boletim] FFmpeg iniciado: ${cmd.substring(0, 200)}...`);
        })
        .on('end', () => {
          if (responseSent) return;
          responseSent = true;

          let sizeKB = '?';
          try {
            const stat = fs.statSync(outputPath);
            sizeKB = (stat.size / 1024).toFixed(0);
          } catch (_) {}

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[montar-boletim] ✅ Concluído em ${elapsed}s | Arquivo: ${sizeKB}KB`);

          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="boletim_${jobId}.mp3"`);
          res.setHeader('X-Processing-Time', `${elapsed}s`);
          res.setHeader('X-File-Size-KB', sizeKB);

          res.download(outputPath, `boletim_${jobId}.mp3`, () => finish());
        })
        .on('error', (err, stdout, stderr) => {
          if (responseSent) return;
          responseSent = true;
          clearTimeout(timeoutId);

          console.error(`[montar-boletim] ❌ Erro FFmpeg: ${err.message}`);
          if (stderr) console.error(`[montar-boletim] stderr:\n${stderr}`);

          cleanupFiles(tmpFiles);

          const isSigkill = (err.message || '').includes('SIGKILL');
          if (isSigkill) return; // Já respondeu via timeout

          res.status(500).json({
            error: 'Erro no processamento FFmpeg',
            code: 'FFMPEG_ERROR',
            details: err.message,
            stderr: stderr ? stderr.substring(0, 2000) : undefined
          });
        })
        .save(outputPath);

    } catch (err) {
      if (responseSent) return;
      responseSent = true;
      clearTimeout(timeoutId);
      cleanupFiles(tmpFiles);

      console.error(`[montar-boletim] ❌ Erro inesperado: ${err.message}`);
      res.status(err.message.includes('HTTP ') ? 400 : 500).json({
        error: err.message,
        code: 'PROCESSING_ERROR'
      });
    }
  }
);

module.exports = router;
