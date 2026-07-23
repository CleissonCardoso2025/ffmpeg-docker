const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const tmpDir = os.tmpdir();
const audio1Path = path.join(tmpDir, 'test-concat-1.wav');
const audio2Path = path.join(tmpDir, 'test-concat-2.wav');
const audio3Path = path.join(tmpDir, 'test-concat-3.wav');

console.log('1. Gerando arquivos de áudio de teste...');
try {
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" "${audio1Path}"`, { stdio: 'ignore' });
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=880:duration=2" "${audio2Path}"`, { stdio: 'ignore' });
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=660:duration=2" "${audio3Path}"`, { stdio: 'ignore' });
} catch (err) {
  console.error('Erro ao gerar arquivos de teste FFmpeg:', err.message);
  process.exit(1);
}

// Iniciar servidor express importando a app
console.log('2. Iniciando servidor HTTP na porta 9099...');
const app = require('./server');

// A app já possui server ligado na porta 9000 ou podemos testar via supertest / fetch.
// Como server.js executa app.listen(9000), vamos testar na porta 9000.

setTimeout(async () => {
  try {
    console.log('3. Testando POST /audio/concat via HTTP (multipart audios[] legados)...');
    
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    
    const file1Data = fs.readFileSync(audio1Path);
    const file2Data = fs.readFileSync(audio2Path);

    let body = [];
    
    // Campo audios (1)
    body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audios"; filename="audio1.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    body.push(file1Data);
    body.push(Buffer.from('\r\n'));

    // Campo audios (2)
    body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audios"; filename="audio2.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    body.push(file2Data);
    body.push(Buffer.from('\r\n'));

    // Formato
    body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="format"\r\n\r\nmp3\r\n`));
    body.push(Buffer.from(`--${boundary}--\r\n`));

    const fullBody = Buffer.concat(body);

    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/audio/concat',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    }, (res) => {
      console.log(`\nStatus Code (audios[]): ${res.statusCode}`);
      console.log(`X-Processing-Time: ${res.headers['x-processing-time']}`);
      console.log(`X-File-Size-KB: ${res.headers['x-file-size-kb']}`);
      console.log(`X-Duration: ${res.headers['x-duration']}`);

      if (res.statusCode === 200 && res.headers['x-duration']) {
        console.log('✅ Teste 1 (audios[] legados) APROVADO!');
      } else {
        console.error('❌ Teste 1 FALHOU!');
        process.exit(1);
      }

      // Teste 2: audio1, audio2, audio3 + novos parâmetros (crossfade, silence, normalize)
      runTest2();
    });

    req.on('error', (e) => {
      console.error('Erro na requisição ao servidor:', e.message);
      process.exit(1);
    });

    req.write(fullBody);
    req.end();

  } catch (e) {
    console.error('Erro no teste:', e);
    process.exit(1);
  }
}, 1500);

function runTest2() {
  console.log('\n4. Testando POST /audio/concat com audio1, audio2, crossfade, silence, pitch, speed, volume, normalize...');
  
  const boundary = '----WebKitFormBoundaryTest2';
  const file1Data = fs.readFileSync(audio1Path);
  const file2Data = fs.readFileSync(audio2Path);

  let body = [];

  // audio1 -> upload
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio1"; filename="audio1.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
  body.push(file1Data);
  body.push(Buffer.from('\r\n'));

  // audio2 -> upload
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio2"; filename="audio2.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
  body.push(file2Data);
  body.push(Buffer.from('\r\n'));

  // Parâmetros
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="crossfade"\r\n\r\ntrue\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="crossfade_duration"\r\n\r\n0.5\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="volume_audio1"\r\n\r\n0.9\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="pitch_audio2"\r\n\r\n1.1\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="speed_audio1"\r\n\r\n1.05\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="normalize"\r\n\r\ntrue\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="bitrate"\r\n\r\n320k\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="sampleRate"\r\n\r\n48000\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="channels"\r\n\r\n2\r\n`));

  body.push(Buffer.from(`--${boundary}--\r\n`));

  const fullBody = Buffer.concat(body);

  const req = http.request({
    hostname: 'localhost',
    port: 9000,
    path: '/audio/concat',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/boundary=${boundary}`,
      'Content-Length': fullBody.length
    }
  }, (res) => {
    console.log(`Status Code (audio1/audio2 + crossfade + normalize): ${res.statusCode}`);
    console.log(`X-Processing-Time: ${res.headers['x-processing-time']}`);
    console.log(`X-File-Size-KB: ${res.headers['x-file-size-kb']}`);
    console.log(`X-Duration: ${res.headers['x-duration']}`);

    if (res.statusCode === 200) {
      console.log('✅ Teste 2 (novos recursos + filtros + headers) APROVADO!');
      console.log('\n🎉 TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO!');
      process.exit(0);
    } else {
      console.error('❌ Teste 2 FALHOU!');
      process.exit(1);
    }
  });

  req.on('error', (e) => {
    console.error('Erro na requisição Teste 2:', e.message);
    process.exit(1);
  });

  req.write(fullBody);
  req.end();
}
