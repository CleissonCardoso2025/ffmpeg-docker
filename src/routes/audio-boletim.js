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
 *   - vinheta_inicio → vinheta de abertura (opcional)
 *   - intro          → introdução em áudio (opcional)
 *   - trilha         → música de fundo
 *   - voz            → locução já normalizada
 *   - vinheta_final  → vinheta de encerramento
 *
 * Sequence:
 *   [vinheta_inicio (opcional)] ──> [intro (opcional)] ──> [corpo: trilha + voz com ducking] ──> [vinheta_final]
 */
router.post(
  '/montar-boletim',
  upload.fields([
    { name: 'vinheta_inicio', maxCount: 1 },
    { name: 'vinheta inicio', maxCount: 1 },
    { name: 'intro', maxCount: 1 },
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
      const volumeTrilha = parseFloat(req.body.volume_trilha ?? 1.0);
      const volumeDucking = parseFloat(req.body.volume_trilha_ducking ?? 0.3);
      const fadeVinheta = parseFloat(req.body.fade_vinheta ?? 0.3);

      if (isNaN(delayVoz) || delayVoz < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`delay_voz` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }
      if (isNaN(volumeTrilha) || volumeTrilha < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`volume_trilha` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }
      if (isNaN(volumeDucking) || volumeDucking < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`volume_trilha_ducking` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }
      if (isNaN(fadeVinheta) || fadeVinheta < 0) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: '`fade_vinheta` deve ser um número >= 0', code: 'INVALID_PARAM' });
      }

      // ── 2. Resolver os arquivos (upload ou URL) ──────────
      const resolveInput = async (fieldName, alternateNames = []) => {
        const names = [fieldName, ...alternateNames];
        let uploadedFile = null;

        for (const name of names) {
          if (req.files?.[name]?.[0]) {
            uploadedFile = req.files[name][0];
            break;
          }
        }

        if (uploadedFile) {
          tmpFiles.push(uploadedFile.path);
          return uploadedFile.path;
        }

        // Se não foi upload, tenta como URL no body (JSON ou form-data texto)
        for (const name of names) {
          const urlValue = req.body?.[`${name}_url`] || req.body?.[name];
          if (urlValue && typeof urlValue === 'string' && /^https?:\/\//i.test(urlValue.trim())) {
            const destPath = path.join(uploadDir, `${jobId}-${fieldName}.mp3`);
            tmpFiles.push(destPath);
            await downloadUrl(urlValue.trim(), destPath);
            return destPath;
          }
        }

        return null;
      };

      const [vinheta_inicioPath, introPath, trilhaPath, vozPath, vinheta_finalPath] = await Promise.all([
        resolveInput('vinheta_inicio', ['vinheta inicio']),
        resolveInput('intro'),
        resolveInput('trilha'),
        resolveInput('voz'),
        resolveInput('vinheta_final')
      ]);

      // ── 3. Validar presença dos arquivos obrigatórios ────
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

      console.log(`[montar-boletim] Job ${jobId} iniciado.`);
      console.log(`[montar-boletim] Parâmetros: delay_voz=${delayVoz}s | fade_vinheta=${fadeVinheta}s`);
      console.log(`[montar-boletim] Vinhetas/Intro ativas: inicio=${Boolean(vinheta_inicioPath)}, intro=${Boolean(introPath)}, final=${Boolean(vinheta_finalPath)}`);

      // ── 4. Obter a duração real da voz ──────────────────
      let vozDuration;
      try {
        vozDuration = await getAudioDuration(vozPath);
      } catch (err) {
        clearTimeout(timeoutId);
        cleanupFiles(tmpFiles);
        return res.status(400).json({ error: 'Falha ao obter duração da voz: ' + err.message, code: 'INVALID_AUDIO' });
      }

      const fimVoz = delayVoz + vozDuration;
      console.log(`[montar-boletim] Duração real da voz: ${vozDuration}s | Fim da voz: ${fimVoz}s`);

      // ── 5. Arquivo de saída ──────────────────────────────
      const outputPath = path.join(uploadDir, `boletim-${jobId}.mp3`);
      tmpFiles.push(outputPath);

      // ── 6. Montar filter_complex e inputs dinâmicos ──────
      const inputs = [];
      const filterComplex = [];
      const concatSegments = [];
      let inputIndex = 0;

      // 1. Vinheta Inicio (opcional)
      if (vinheta_inicioPath) {
        inputs.push(vinheta_inicioPath);
        const vinIniIdx = inputIndex++;
        if (fadeVinheta > 0) {
          filterComplex.push(`[${vinIniIdx}:a]afade=t=in:st=0:d=${fadeVinheta.toFixed(3)}[vin_ini_fade]`);
          filterComplex.push(`[vin_ini_fade]aformat=sample_rates=44100:channel_layouts=stereo[vin_ini_fmt]`);
        } else {
          filterComplex.push(`[${vinIniIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo[vin_ini_fmt]`);
        }
        concatSegments.push('[vin_ini_fmt]');
      }

      // 2. Intro (opcional)
      if (introPath) {
        inputs.push(introPath);
        const introIdx = inputIndex++;
        filterComplex.push(`[${introIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo[intro_fmt]`);
        concatSegments.push('[intro_fmt]');
      }

      // 3. Trilha e voz (obrigatórios)
      inputs.push(trilhaPath);
      const trilhaIdx = inputIndex++;

      inputs.push(vozPath);
      const vozIdx = inputIndex++;

      const delayMs = Math.round(delayVoz * 1000);
      const fadeOutDuration = 0.2; // 200 ms fade-out na trilha para evitar corte seco
      const fadeOutStart = Math.max(0, fimVoz - fadeOutDuration);

      filterComplex.push(`[${vozIdx}:a]adelay=${delayMs}|${delayMs}[voz_delay]`);
      filterComplex.push(`[${trilhaIdx}:a]volume='if(lt(t,${delayVoz}),${volumeTrilha},${volumeDucking})':eval=frame,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDuration},apad[trilha_ducked]`);
      filterComplex.push(`[trilha_ducked][voz_delay]amix=inputs=2:duration=shortest:dropout_transition=0:normalize=0[corpo]`);
      filterComplex.push(`[corpo]aformat=sample_rates=44100:channel_layouts=stereo[corpo_fmt]`);
      concatSegments.push('[corpo_fmt]');

      // 4. Vinheta Final
      if (vinheta_finalPath) {
        inputs.push(vinheta_finalPath);
        const vinFinIdx = inputIndex++;
        if (fadeVinheta > 0) {
          filterComplex.push(`[${vinFinIdx}:a]afade=t=in:st=0:d=${fadeVinheta.toFixed(3)}[vin_fin_fade]`);
          filterComplex.push(`[vin_fin_fade]aformat=sample_rates=44100:channel_layouts=stereo[vin_fin_fmt]`);
        } else {
          filterComplex.push(`[${vinFinIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo[vin_fin_fmt]`);
        }
        concatSegments.push('[vin_fin_fmt]');
      }

      // 5. Concatena os segmentos presentes na ordem desejada
      if (concatSegments.length === 1) {
        filterComplex.push(`${concatSegments[0]}anull[out]`);
      } else {
        filterComplex.push(`${concatSegments.join('')}concat=n=${concatSegments.length}:v=0:a=1[out]`);
      }

      const filterComplexStr = filterComplex.join(';');

      // ── 7. Executar FFmpeg ───────────────────────────────
      ffmpegCmd = ffmpeg();

      for (const inputPath of inputs) {
        ffmpegCmd.input(inputPath);
      }

      ffmpegCmd
        .complexFilter(filterComplexStr)
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
          console.log(`[montar-boletim] FilterComplex aplicado:\n${filterComplex.split(';').join(';\n')}`);
          console.log(`[montar-boletim] FFmpeg comando completo: ${cmd}`);
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
