const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const JOBS_FILE = path.join(__dirname, '../../data/jobs.json');
const DOWNLOAD_DIR = '/tmp/recordings';
const MAX_CONCURRENT_RECORDINGS = parseInt(process.env.MAX_CONCURRENT_RECORDINGS) || 20;

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

class StreamRecorder {
  constructor() {
    this.jobs = new Map();
    this.activeRecordings = 0;
    this.loadJobs();
    this.startCleanupInterval();
  }

  loadJobs() {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
        // Convert to Map
        Object.entries(data).forEach(([id, job]) => {
          this.jobs.set(id, job);
        });
      }
    } catch (err) {
      console.error('[StreamRecorder] Erro ao carregar jobs.json:', err.message);
    }
  }

  saveJobs() {
    try {
      const dataDir = path.dirname(JOBS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const data = Object.fromEntries(this.jobs);
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[StreamRecorder] Erro ao salvar jobs.json:', err.message);
    }
  }

  startCleanupInterval() {
    // Limpeza a cada 1h
    setInterval(() => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      let changed = false;

      for (const [id, job] of this.jobs.entries()) {
        const jobTime = new Date(job.finished_at || job.started_at).getTime();
        if (now - jobTime > oneDay) {
          console.log(`[StreamRecorder] Limpando job antigo: ${id}`);
          if (job.file_path && fs.existsSync(job.file_path)) {
            fs.unlinkSync(job.file_path);
          }
          this.jobs.delete(id);
          changed = true;
        }
      }

      if (changed) this.saveJobs();
    }, 60 * 60 * 1000);
  }

  async record(params, isAsync = false) {
    if (this.activeRecordings >= MAX_CONCURRENT_RECORDINGS) {
      throw new Error(`Limite de gravações simultâneas atingido (${MAX_CONCURRENT_RECORDINGS}).`);
    }

    const jobId = `rec_${uuidv4().substring(0, 8)}`;
    const { stream_url, duration, format, bitrate, channels, sampleRate, webhook_url, callback_data } = params;
    const fileName = `${jobId}.${format}`;
    const filePath = path.join(DOWNLOAD_DIR, fileName);

    const job = {
      job_id: jobId,
      status: 'recording',
      params: { stream_url, duration, format, bitrate, channels, sampleRate },
      started_at: new Date().toISOString(),
      estimated_end: new Date(Date.now() + duration * 1000).toISOString(),
      file_path: filePath,
      download_url: `/audio/record-stream/${jobId}/download`,
      progress_percent: 0,
      elapsed_seconds: 0,
      total_duration: duration,
      webhook_url,
      callback_data
    };

    this.jobs.set(jobId, job);
    this.saveJobs();

    // Base URL para links absolutos
    const baseUrl = params.baseUrl || '';
    job.download_url = `${baseUrl}/audio/record-stream/${jobId}/download`;
    job.file_url = job.download_url; // Compatibilidade com workflows n8n

    const ffmpegCmd = ffmpeg(stream_url)
      .inputOptions([
        '-reconnect 1',
        '-reconnect_streamed 1',
        '-reconnect_delay_max 5',
        '-user_agent "Mozilla/5.0 (compatible; RadioRecorder/1.0)"'
      ])
      .duration(duration);

    // Audio settings
    if (format === 'mp3') {
      ffmpegCmd.audioCodec('libmp3lame').audioBitrate(bitrate);
    } else if (format === 'ogg' || format === 'opus') {
      ffmpegCmd.audioCodec(format === 'ogg' ? 'libvorbis' : 'libopus').audioBitrate(bitrate);
    } else if (format === 'wav') {
      ffmpegCmd.audioCodec('pcm_s16le');
    }

    ffmpegCmd
      .audioChannels(channels)
      .audioFrequency(sampleRate)
      .toFormat(format);

    const recordingPromise = new Promise((resolve, reject) => {
      let responseSent = false;
      this.activeRecordings++;

      const timeout = setTimeout(() => {
        if (!responseSent) {
          ffmpegCmd.kill('SIGKILL');
          const err = new Error('Timeout de gravação excedido');
          job.status = 'failed';
          job.error = err.message;
          this.activeRecordings--;
          this.saveJobs();
          reject(err);
        }
      }, (duration + 30) * 1000);

      ffmpegCmd
        .on('progress', (progress) => {
          // fluent-ffmpeg progress is sometimes tricky with streams, we estimate by elapsed time
          // but if timemark is available, use it
          if (progress.timemark) {
            const parts = progress.timemark.split(':').map(Number);
            const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            job.elapsed_seconds = Math.floor(seconds);
            job.progress_percent = Math.min(100, Math.floor((seconds / duration) * 100));
          }
        })
        .on('end', () => {
          clearTimeout(timeout);
          if (responseSent) return;
          responseSent = true;
          this.activeRecordings--;

          // Validate file size
          try {
            if (!fs.existsSync(filePath)) {
              throw new Error('Arquivo não foi gerado.');
            }
            const stats = fs.statSync(filePath);
            if (stats.size < 10 * 1024) { // 10KB
              throw new Error(`Gravação muito curta ou vazia (${(stats.size / 1024).toFixed(1)}KB). Verifique se a URL do stream está ativa.`);
            }

            job.status = 'completed';
            job.finished_at = new Date().toISOString();
            job.file_size_bytes = stats.size;
            job.progress_percent = 100;
            job.elapsed_seconds = duration;
            this.saveJobs();

            console.log(`[StreamRecorder] ✅ Gravação concluída: ${jobId} | ${stats.size} bytes`);
            
            if (webhook_url) {
              this.sendWebhook(job);
            }

            resolve(job);
          } catch (err) {
            job.status = 'failed';
            job.error = err.message;
            this.saveJobs();
            reject(err);
          }
        })
        .on('error', (err) => {
          clearTimeout(timeout);
          if (responseSent) return;
          responseSent = true;
          this.activeRecordings--;

          console.error(`[StreamRecorder] ❌ Erro na gravação ${jobId}:`, err.message);
          job.status = 'failed';
          job.error = err.message;
          this.saveJobs();
          reject(err);
        })
        .save(filePath);
    });

    if (isAsync) {
      // For async, we don't wait for the promise to resolve
      // Errors will be captured in the job object
      recordingPromise.catch(err => {
        console.error(`[StreamRecorder] Async error for ${jobId}:`, err.message);
      });
      return job;
    }

    return recordingPromise;
  }

  async sendWebhook(job) {
    if (!job.webhook_url) return;

    const payload = {
      job_id: job.job_id,
      status: job.status,
      duration_seconds: job.elapsed_seconds,
      file_size_bytes: job.file_size_bytes,
      download_url: job.download_url,
      file_url: job.file_url, // Compatibilidade com n8n
      callback_data: job.callback_data
    };

    try {
      console.log(`[StreamRecorder] Enviando webhook para ${job.webhook_url}`);
      await fetch(job.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error(`[StreamRecorder] Falha ao enviar webhook para ${job.job_id}:`, err.message);
    }
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }
}

module.exports = new StreamRecorder();
