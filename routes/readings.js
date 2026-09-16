import { Router } from 'express';
import { getDB } from '../db/connection.js';

const router = Router();

// Valor que o ESP32 usa quando o sensor não encontra alvo (ver firmware)
const SENTINELA_INVALIDO = 9999;

function calcularVolume(box, matriz) {
  const leiturasValidas = matriz.flat().filter((v) => v !== SENTINELA_INVALIDO);
  if (leiturasValidas.length === 0) return { volumeM3: 0, volumePercent: 0 };

  const alturaMediaProdutoMm =
    leiturasValidas.reduce((soma, distanciaMm) => soma + (box.heightM * 1000 - distanciaMm), 0) /
    leiturasValidas.length;

  const alturaMediaProdutoM = alturaMediaProdutoMm / 1000;
  const volumeM3 = Math.max(0, alturaMediaProdutoM) * box.widthM * box.lengthM;
  const volumePercent = Math.min(100, Math.max(0, (alturaMediaProdutoM / box.heightM) * 100));

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

    const produto = box.productId
      ? await db.collection('products').findOne({ productId: box.productId })
      : null;

    const { volumeM3, volumePercent } = calcularVolume(box, matriz);
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
