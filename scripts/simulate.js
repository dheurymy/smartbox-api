import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';
const INTERVALO_MS = 10_000;

const BOX_IDS = Array.from({ length: 10 }, (_, i) => `box-${String(i + 1).padStart(2, '0')}`);

async function buscarBox(boxId) {
  const resp = await fetch(`${API_URL}/api/boxes/${boxId}`);
  if (!resp.ok) return null;
  return resp.json();
}

// Igual ao `backend/app.py` (protótipo Flask): cada célula é um valor
// independente, sorteado do zero a cada ciclo (sem relação com a leitura
// anterior nem com as células vizinhas) — não simula um "monte" de material.
function gerarMatriz(box) {
  const matriz = [];
  for (let linha = 0; linha < box.sensorRows; linha++) {
    const valoresLinha = [];
    for (let coluna = 0; coluna < box.sensorCols; coluna++) {
      const distanciaMm = Math.round(Math.random() * box.heightM * 1000);
      valoresLinha.push(distanciaMm);
    }
    matriz.push(valoresLinha);
  }
  return matriz;
}

async function enviarLeitura(boxId, matriz) {
  const resp = await fetch(`${API_URL}/api/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxId, matriz, source: 'simulated' }),
  });
  if (!resp.ok) {
    const erro = await resp.json().catch(() => ({}));
    console.error(`Erro ao enviar leitura de ${boxId}:`, erro);
  }
}

async function cicloDeSimulacao() {
  for (const boxId of BOX_IDS) {
    const box = await buscarBox(boxId);
    if (!box) {
      console.warn(`Boxe ${boxId} não encontrado — rode "npm run seed-boxes" primeiro.`);
      continue;
    }
    const matriz = gerarMatriz(box);
    await enviarLeitura(boxId, matriz);
  }
  console.log(`Leituras simuladas enviadas às ${new Date().toLocaleTimeString('pt-BR')}`);
}

console.log(`Simulador iniciado — enviando leituras a cada ${INTERVALO_MS / 1000}s para ${API_URL}`);
cicloDeSimulacao();
setInterval(cicloDeSimulacao, INTERVALO_MS);
