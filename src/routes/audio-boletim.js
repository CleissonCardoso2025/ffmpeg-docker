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

      console.log(`[montar-boletim] Job ${jobId} iniciado.`);
      console.log(`[montar-boletim] Parâmetros: delay_voz=${delayVoz}s | fade_vinheta=${fadeVinheta}s`);
      console.log(`[montar-boletim] Volumes (ganhos) aplicados: trilha(antes)=${volumeTrilha}, trilha(durante_ducking)=${volumeDucking}, voz=1.0 (inalterada), vinheta_final=1.0 (inalterada)`);

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

      // ── 6. Montar filter_complex parametrizado ───────────
      //
      // Lógica:
      //   [1:a] → voz com adelay (delay_voz * 1000 ms em cada canal)
      //   [0:a] → trilha com volume dinâmico e atrim para cortar no fim da voz
      //   amix trilha + voz → "corpo" (agora usa duration=longest para não cortar a voz)
      //   concat corpo + vinheta → vinheta entra apenas depois que o corpo terminar
      //
      const delayMs = Math.round(delayVoz * 1000);
      const fadeOutDuration = 0.2; // 200 ms fade-out na trilha para evitar corte seco
      const fadeOutStart = Math.max(0, fimVoz - fadeOutDuration);

      const filterComplex = [
        // 1. Voz com delay (não usamos apad aqui para que ela defina o fim natural do mix)
        `[1:a]adelay=${delayMs}|${delayMs}[voz_delay]`,
        
        // 2. Trilha com volume dinâmico, aplica o fade-out no tempo do fim da voz, e apad (torna infinita)
        `[0:a]volume='if(lt(t,${delayVoz}),${volumeTrilha},${volumeDucking})':eval=frame,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDuration},apad[trilha_ducked]`,
        
        // 3. Mixa a trilha infinita e a voz. duration=shortest fará o mix acabar EXATAMENTE quando a voz real terminar na prática.
        // 3. Mixa a trilha infinita e a voz. normalize=0 evita que o amix reduza o ganho das entradas (comum em amix=inputs=2).
        `[trilha_ducked][voz_delay]amix=inputs=2:duration=shortest:dropout_transition=0:normalize=0[corpo]`,
        
        // 4. Vinheta final com fade-in opcional
        fadeVinheta > 0
          ? `[2:a]afade=t=in:st=0:d=${fadeVinheta.toFixed(3)}[vinheta_fade]`
          : `[2:a]anull[vinheta_fade]`,
          
        // 5. Padroniza os formatos antes do concat para evitar erros de canais diferentes
        `[corpo]aformat=sample_rates=44100:channel_layouts=stereo[corpo_fmt]`,
        `[vinheta_fade]aformat=sample_rates=44100:channel_layouts=stereo[vinheta_fmt]`,
        
        // 6. Concatena o corpo com a vinheta sequencialmente
        `[corpo_fmt][vinheta_fmt]concat=n=2:v=0:a=1[out]`
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
