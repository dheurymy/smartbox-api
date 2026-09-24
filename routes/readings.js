import { Router } from 'express';
import { getDB } from '../db/connection.js';

const router = Router();

// Valor que o firmware usa quando o sensor não encontra alvo (ver firmware/)
const SENTINELA_INVALIDO = 9999;

/**
 * Duas matrizes têm a mesma forma (mesmo número de linhas e colunas)?
 * Usado pra saber se um baseline salvo ainda é compatível com a matriz que
 * acabou de chegar (ex: depois de editar sensorRows/sensorCols do box).
 */
function mesmoFormato(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((linha, i) => Array.isArray(linha) && linha.length === b[i]?.length);
}

/**
 * Calcula o volume ocupado a partir da matriz de distâncias.
 *
 * A altura do material em cada célula NÃO é mais "heightM - distância"
 * (que assume o sensor montado exatamente à distância nominal do fundo do
 * box — na prática quase nunca é o caso, por tolerância de montagem).
 * Em vez disso, usa `baseline` — a matriz da PRIMEIRA leitura já recebida
 * pra esse box — como referência de "vazio" (zero): altura = baseline -
 * distância atual. Isso calibra automaticamente qualquer offset de
 * instalação do sensor real (ver POST / abaixo, que captura o baseline).
 *
 * Célula é ignorada (não entra na média) se a leitura atual OU o baseline
 * daquela célula for inválido (sentinela) — ex: sensor que falhou na hora
 * da calibração fica de fora do cálculo até o box ser recalibrado.
 */
function calcularVolume(box, matriz, baseline) {
  const alturasValidasMm = [];
  for (let r = 0; r < matriz.length; r++) {
    for (let c = 0; c < matriz[r].length; c++) {
      const distanciaMm = matriz[r][c];
      const zeroMm = baseline?.[r]?.[c];
      if (distanciaMm === SENTINELA_INVALIDO) continue;
      if (zeroMm === undefined || zeroMm === SENTINELA_INVALIDO) continue;
      alturasValidasMm.push(zeroMm - distanciaMm);
    }
  }

  if (alturasValidasMm.length === 0) return { volumeM3: 0, volumePercent: 0 };

  const alturaMediaMm =
    alturasValidasMm.reduce((soma, h) => soma + h, 0) / alturasValidasMm.length;

  // Limitada entre 0 (vazio) e heightM (não deixa "estourar" acima da
  // capacidade do box por ruído do sensor ou calibração imperfeita).
  const alturaMediaM = Math.min(box.heightM, Math.max(0, alturaMediaMm / 1000));
  const volumeM3 = alturaMediaM * box.widthM * box.lengthM;
  const volumePercent = box.heightM > 0 ? (alturaMediaM / box.heightM) * 100 : 0;

  return { volumeM3, volumePercent };
}

// POST /api/readings - recebe uma leitura nova (chamado pelo serviço de ingestão)
router.post('/', async (req, res) => {
  try {
    const { boxId, matriz, source } = req.body;
    if (!boxId || !matriz) {
      return res.status(400).json({ erro: 'boxId e matriz são obrigatórios' });
    }

    const db = getDB();
    const box = await db.collection('boxes').findOne({ boxId });
    if (!box) return res.status(404).json({ erro: 'Boxe não encontrado' });

    // Primeira leitura desse box (nunca calibrado), OU a forma da matriz
    // mudou desde a última calibração (ex: sensorRows/sensorCols editados)
    // — em qualquer um dos dois casos, ESTA leitura vira o novo "zero".
    let baseline = box.baseline;
    if (!mesmoFormato(baseline, matriz)) {
      baseline = matriz;
      await db.collection('boxes').updateOne({ boxId }, { $set: { baseline } });
    }

    const produto = box.productId
      ? await db.collection('products').findOne({ productId: box.productId })
      : null;

    const { volumeM3, volumePercent } = calcularVolume(box, matriz, baseline);
    const massTon = produto ? (volumeM3 * produto.bulkDensityKgM3) / 1000 : null;

    const leitura = {
      timestamp: new Date(),
      boxId,
      productId: box.productId || null,
      matriz,
      volumeM3,
      volumePercent,
      massTon,
      source: source || 'real',
    };

    await db.collection('readings').insertOne(leitura);

    res.status(201).json(leitura);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/readings/:boxId/latest - última leitura de um boxe
router.get('/:boxId/latest', async (req, res) => {
  try {
    const db = getDB();
    const leitura = await db
      .collection('readings')
      .find({ boxId: req.params.boxId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    if (leitura.length === 0) return res.status(404).json({ erro: 'Nenhuma leitura encontrada' });
    res.json(leitura[0]);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/readings/:boxId?from=&to= - histórico de leituras de um boxe
router.get('/:boxId', async (req, res) => {
  try {
    const { from, to } = req.query;
    const filtro = { boxId: req.params.boxId };
    if (from || to) {
      filtro.timestamp = {};
      if (from) filtro.timestamp.$gte = new Date(from);
      if (to) filtro.timestamp.$lte = new Date(to);
    }
    const db = getDB();
    const leituras = await db.collection('readings').find(filtro).sort({ timestamp: 1 }).toArray();
    res.json(leituras);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
