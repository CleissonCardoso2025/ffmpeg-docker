const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const workDir = os.tmpdir();
const jinglePath = path.join(workDir, 'test-jingle.wav');
const voicePath = path.join(workDir, 'test-voice.wav');
const outputPath = path.join(workDir, 'test-output.wav'); // wav para análise mais precisa

console.log('1. Gerando arquivos de teste (Tom de -10dBFS)...');
try {
  // Tom de 440Hz para Vinheta (5 segundos)
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" -filter:a "volume=-10dB" "${jinglePath}"`, { stdio: 'ignore' });
  // Tom de 1000Hz para Voz (5 segundos)
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=5" -filter:a "volume=-10dB" "${voicePath}"`, { stdio: 'ignore' });
} catch (err) {
  console.error('Erro ao gerar arquivos de teste. Verifique se o FFmpeg está no PATH.');
  process.exit(1);
}

const delayVoz = 2; // Voz começa aos 2s
const volumeTrilha = 1.0;
const volumeDucking = 0.3;

const delayMs = delayVoz * 1000;
const vozDuration = 5;
const fadeOutDuration = 0.2;
const fadeOutStart = (delayVoz + vozDuration) - fadeOutDuration;

// Reprodução exata da cadeia do endpoint (com normalize=0 e sem afade na vinheta para medir o volume bruto)
const filterComplex = [
  `[1:a]adelay=${delayMs}|${delayMs}[voz_delay]`,
  `[0:a]volume='if(lt(t,${delayVoz}),${volumeTrilha},${volumeDucking})':eval=frame,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDuration},apad[trilha_ducked]`,
  `[trilha_ducked][voz_delay]amix=inputs=2:duration=shortest:dropout_transition=0:normalize=0[corpo]`,
  `[2:a]anull[vinheta_fade]`,
  `[corpo]aformat=sample_rates=44100:channel_layouts=stereo[corpo_fmt]`,
  `[vinheta_fade]aformat=sample_rates=44100:channel_layouts=stereo[vinheta_fmt]`,
  `[corpo_fmt][vinheta_fmt]concat=n=2:v=0:a=1[out]`
].join(';');

console.log('\n2. Processando boletim simulado com amix normalize=0...');
try {
  execSync(`ffmpeg -y -i "${jinglePath}" -i "${voicePath}" -i "${jinglePath}" -filter_complex "${filterComplex}" -map "[out]" -ac 2 -ar 44100 "${outputPath}"`, { stdio: 'ignore' });
} catch (err) {
  console.error('Erro no processamento da cadeia de filtros FFmpeg.');
  console.error(err.message);
  process.exit(1);
}

console.log('\n3. Analisando Loudness (LUFS)...');

function analyzeLoudness(file, start, duration) {
  try {
    const out = execSync(`ffmpeg -i "${file}" -ss ${start} -t ${duration} -af ebur128 -f null - 2>&1`).toString();
    
    // Procura por `I:         -XX.X LUFS`
    const lufsMatch = out.match(/I:\s+([-0-9.]+)\s+LUFS/);
    
    // Procura por `True peak: -XX.X dBTP`
    const peakMatch = out.match(/True peak:\s+([-0-9.]+)\s+dBTP/);

    return {
      lufs: lufsMatch ? parseFloat(lufsMatch[1]) : null,
      peak: peakMatch ? parseFloat(peakMatch[1]) : null
    };
  } catch (e) {
    return null;
  }
}

// Analisa a vinheta inicial (primeiro segundo)
// Vinheta inicial (trilha) vai de 0s a 2s
const initStats = analyzeLoudness(outputPath, 0.5, 1);

// Analisa a vinheta final (do segundo 8 ao 9)
// Corpo termina em 7s. Vinheta final entra aos 7s e tem duração de 5s.
const finalStats = analyzeLoudness(outputPath, 8.5, 1);

console.log(`\nVinheta Inicial (0.5s - 1.5s): LUFS = ${initStats.lufs}, True Peak = ${initStats.peak}`);
console.log(`Vinheta Final (8.5s - 9.5s): LUFS = ${finalStats.lufs}, True Peak = ${finalStats.peak}`);

if (initStats.lufs !== null && finalStats.lufs !== null) {
  const diffLufs = Math.abs(initStats.lufs - finalStats.lufs);
  const diffPeak = Math.abs(initStats.peak - finalStats.peak);
  
  console.log(`\nDiferença de LUFS: ${diffLufs.toFixed(2)} LU`);
  console.log(`Diferença de True Peak: ${diffPeak.toFixed(2)} dB`);
  
  // Consideramos aprovado se a diferença for < 0.5 (alguma margem de erro decimal do FFmpeg/decoding)
  if (diffLufs < 0.5 && diffPeak < 0.5) {
    console.log('\n✅ SUCESSO: A vinheta inicial e final possuem níveis equivalentes de volume!');
    process.exit(0);
  } else {
    console.log('\n❌ FALHA: Houve uma discrepância de volume significativa entre início e fim.');
    process.exit(1);
  }
} else {
  console.log('\n❌ Erro ao tentar extrair resultados do ebur128.');
  process.exit(1);
}
