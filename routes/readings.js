import { Router } from 'express';
import { getDB } from '../db/connection.js';
import { calcularVolume } from '../utils/volume.js';

const router = Router();

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
