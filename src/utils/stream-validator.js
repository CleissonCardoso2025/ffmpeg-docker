/**
 * Utilitários de validação para streams de áudio
 */

const VALID_BITRATES = ['32k', '48k', '64k', '96k', '128k', '192k', '256k', '320k'];
const VALID_FORMATS = ['mp3', 'ogg', 'wav', 'opus'];

function validateStreamParams(params) {
  const { stream_url, duration, bitrate, format, channels, sampleRate } = params;

  // URL validation
  if (!stream_url) {
    throw new Error('URL do stream é obrigatória.');
  }
  if (!/^https?:\/\/|^rtmp:\/\//.test(stream_url)) {
    throw new Error('URL deve começar com http://, https://, ou rtmp://');
  }

  // Duration validation
  const dur = parseInt(duration);
  if (isNaN(dur) || dur < 5 || dur > 14400) {
    throw new Error('Duração deve ser um número entre 5 e 14400 segundos (4 horas).');
  }

  // Bitrate validation
  if (bitrate && !VALID_BITRATES.includes(bitrate)) {
    throw new Error(`Bitrate inválido. Valores permitidos: ${VALID_BITRATES.join(', ')}`);
  }

  // Format validation
  if (format && !VALID_FORMATS.includes(format)) {
    throw new Error(`Formato inválido. Valores permitidos: ${VALID_FORMATS.join(', ')}`);
  }

  // Channels validation
  const chans = parseInt(channels);
  if (channels && (isNaN(chans) || ![1, 2].includes(chans))) {
    throw new Error('Canais deve ser 1 (mono) ou 2 (stereo).');
  }

  // Sample Rate validation
  const sRate = parseInt(sampleRate);
  if (sampleRate && (isNaN(sRate) || sRate < 8000 || sRate > 48000)) {
    throw new Error('Taxa de amostragem (sampleRate) inválida.');
  }

  return {
    stream_url,
    duration: dur,
    bitrate: bitrate || '64k',
    format: format || 'mp3',
    channels: chans || 1,
    sampleRate: sRate || 22050
  };
}

module.exports = {
  validateStreamParams
};
