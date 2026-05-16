const express = require('express');
const router = express.Router();
const streamRecorder = require('../services/stream-recorder');
const { validateStreamParams } = require('../utils/stream-validator');
const fs = require('fs');

/**
 * 🎙️ ÁUDIO — Captura de Stream
 */

// 1. POST /audio/record-stream (Síncrono)
router.post('/record-stream', async (req, res) => {
  try {
    const params = validateStreamParams(req.body);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    params.baseUrl = `${protocol}://${host}`;
    
    console.log(`[POST /audio/record-stream] Iniciando gravação síncrona: ${params.stream_url} (${params.duration}s)`);
    
    const job = await streamRecorder.record(params, false);
    
    if (fs.existsSync(job.file_path)) {
      res.download(job.file_path, `recording_${job.job_id}.${params.format}`, () => {
        // Clean up file after download if it's synchronous? 
        // The requirements say async jobs are kept for 24h. 
        // For sync, usually we cleanup immediately, but let's keep it consistent if the user wants to download it later too.
        // Actually, the requirements don't specify cleanup for sync, but I'll follow the pattern of other endpoints.
        // Wait, other endpoints cleanup immediately.
        try { fs.unlinkSync(job.file_path); } catch (e) {}
      });
    } else {
      res.status(500).json({ error: 'Arquivo gravado não encontrado.' });
    }
  } catch (err) {
    console.error('[POST /audio/record-stream] Erro:', err.message);
    const status = err.message.includes('URL unreachable') ? 502 : 500;
    res.status(status).json({ error: err.message });
  }
});

// 2. POST /audio/record-stream-async (Assíncrono)
router.post('/record-stream-async', async (req, res) => {
  try {
    const params = validateStreamParams(req.body);
    params.webhook_url = req.body.webhook_url;
    params.callback_data = req.body.callback_data;
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    params.baseUrl = `${protocol}://${host}`;
    
    console.log(`[POST /audio/record-stream-async] Iniciando gravação assíncrona: ${params.stream_url}`);
    
    const job = await streamRecorder.record(params, true);
    
    res.json({
      job_id: job.job_id,
      status: job.status,
      started_at: job.started_at,
      estimated_end: job.estimated_end,
      download_url: job.download_url
    });
  } catch (err) {
    console.error('[POST /audio/record-stream-async] Erro:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 3. GET /audio/record-stream/:job_id/status
router.get('/record-stream/:job_id/status', (req, res) => {
  const { job_id } = req.params;
  const job = streamRecorder.getJob(job_id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado.' });
  }
  
  res.json({
    job_id: job.job_id,
    status: job.status,
    progress_percent: job.progress_percent,
    elapsed_seconds: job.elapsed_seconds,
    total_duration: job.total_duration,
    error: job.error || null
  });
});

// 4. GET /audio/record-stream/:job_id/download
router.get('/record-stream/:job_id/download', (req, res) => {
  const { job_id } = req.params;
  const job = streamRecorder.getJob(job_id);
  
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado.' });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({ error: `Gravação não concluída. Status atual: ${job.status}` });
  }
  
  if (!fs.existsSync(job.file_path)) {
    return res.status(410).json({ error: 'Arquivo não disponível (pode ter sido removido pela limpeza automática).' });
  }
  
  res.download(job.file_path, `recording_${job_id}.${job.params.format}`);
});

module.exports = router;
