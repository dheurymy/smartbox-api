import { Router } from 'express';
import { getDB } from '../db/connection.js';

const router = Router();

// GET /api/boxes - lista boxes já com os dados do produto atual (join)
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const boxes = await db
      .collection('boxes')
      .aggregate([
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: 'productId',
            as: 'produto',
          },
        },
        { $unwind: { path: '$produto', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();
    res.json(boxes);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/boxes/:boxId
router.get('/:boxId', async (req, res) => {
  try {
    const db = getDB();
    const box = await db.collection('boxes').findOne({ boxId: req.params.boxId });
    if (!box) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json(box);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/boxes - cria um boxe novo (útil para gerar os boxes simulados de uma vez)
router.post('/', async (req, res) => {
  try {
    const { boxId, widthM, lengthM, heightM, sensorRows, sensorCols, productId } = req.body;
    if (!boxId || !widthM || !lengthM || !heightM) {
      return res.status(400).json({ erro: 'boxId, widthM, lengthM e heightM são obrigatórios' });
    }
    const db = getDB();
    await db.collection('boxes').insertOne({
      boxId,
      widthM,
      lengthM,
      heightM,
      sensorRows: sensorRows || 3,
      sensorCols: sensorCols || 2,
      productId: productId || null,
      status: 'ativo',
    });
    res.status(201).json({ mensagem: 'Boxe criado' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ erro: 'boxId já existe' });
    res.status(500).json({ erro: err.message });
  }
});

// PATCH /api/boxes/:boxId/produto - troca (ou remove, com productId:null) o
// produto atual do boxe (ex: reabastecimento, ou trocar o que está armazenado)
router.patch('/:boxId/produto', async (req, res) => {
  try {
    const { productId } = req.body;
    if (productId === undefined) return res.status(400).json({ erro: 'productId é obrigatório (use null pra desvincular)' });
    const db = getDB();
    const resultado = await db
      .collection('boxes')
      .updateOne({ boxId: req.params.boxId }, { $set: { productId } });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Produto do boxe atualizado' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/boxes/:boxId - atualiza dimensões/config de um boxe existente
// (troca de produto continua em PATCH /:boxId/produto, acima)
router.put('/:boxId', async (req, res) => {
  try {
    const { widthM, lengthM, heightM, sensorRows, sensorCols, status } = req.body;
    const camposParaAtualizar = {};
    if (widthM !== undefined) camposParaAtualizar.widthM = widthM;
    if (lengthM !== undefined) camposParaAtualizar.lengthM = lengthM;
    if (heightM !== undefined) camposParaAtualizar.heightM = heightM;
    if (sensorRows !== undefined) camposParaAtualizar.sensorRows = sensorRows;
    if (sensorCols !== undefined) camposParaAtualizar.sensorCols = sensorCols;
    if (status !== undefined) camposParaAtualizar.status = status;

    if (Object.keys(camposParaAtualizar).length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um campo para atualizar' });
    }

    const db = getDB();
    const resultado = await db
      .collection('boxes')
      .updateOne({ boxId: req.params.boxId }, { $set: camposParaAtualizar });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Boxe atualizado' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/boxes/:boxId/baseline - "zera" o boxe de novo: apaga a
// calibração atual, então a PRÓXIMA leitura recebida vira o novo zero de
// referência. Útil se a primeira leitura não foi feita com o box vazio de
// verdade, ou depois de remontar/trocar um sensor fisicamente.
router.delete('/:boxId/baseline', async (req, res) => {
  try {
    const db = getDB();
    const resultado = await db
      .collection('boxes')
      .updateOne({ boxId: req.params.boxId }, { $unset: { baseline: '' } });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Calibração removida — a próxima leitura recebida vira o novo zero.' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PATCH /api/boxes/:boxId/meta-descarga - define uma meta de descarga: quanto
// (em kg) se espera retirar do boxe a partir de agora. Guarda a massa da
// ÚLTIMA leitura como "massa inicial" de referência — o quanto já foi
// descarregado é sempre `dischargeStartMassKg - massa atual`, calculado no
// frontend a cada poll (ver buildAlerts em utils.ts), não persistido aqui.
// Cancelar/redefinir a meta é só chamar de novo (ou usar o DELETE abaixo).
router.patch('/:boxId/meta-descarga', async (req, res) => {
  try {
    const { targetKg } = req.body;
    if (typeof targetKg !== 'number' || targetKg <= 0) {
      return res.status(400).json({ erro: 'targetKg é obrigatório e deve ser um número maior que zero' });
    }
    const db = getDB();

    const ultimaLeitura = await db
      .collection('readings')
      .find({ boxId: req.params.boxId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    const massaAtualKg = ultimaLeitura[0]?.massTon ? ultimaLeitura[0].massTon * 1000 : 0;

    const resultado = await db.collection('boxes').updateOne(
      { boxId: req.params.boxId },
      { $set: { dischargeTargetKg: targetKg, dischargeStartMassKg: massaAtualKg } }
    );
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Meta de descarga definida', dischargeStartMassKg: massaAtualKg });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/boxes/:boxId/meta-descarga - cancela a meta de descarga ativa (se houver)
router.delete('/:boxId/meta-descarga', async (req, res) => {
  try {
    const db = getDB();
    const resultado = await db
      .collection('boxes')
      .updateOne({ boxId: req.params.boxId }, { $unset: { dischargeTargetKg: '', dischargeStartMassKg: '' } });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Meta de descarga cancelada' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// PATCH /api/boxes/:boxId/meta-abastecimento - define uma meta de
// abastecimento: quanto (em kg) se espera CARREGAR no boxe a partir de agora
// (o espelho da meta de descarga acima). Guarda a massa da ÚLTIMA leitura
// como "massa inicial" de referência — o quanto já foi abastecido é sempre
// `massa atual - supplyStartMassKg`, calculado no frontend a cada poll (ver
// buildAlerts em utils.ts), não persistido aqui.
router.patch('/:boxId/meta-abastecimento', async (req, res) => {
  try {
    const { targetKg } = req.body;
    if (typeof targetKg !== 'number' || targetKg <= 0) {
      return res.status(400).json({ erro: 'targetKg é obrigatório e deve ser um número maior que zero' });
    }
    const db = getDB();

    const ultimaLeitura = await db
      .collection('readings')
      .find({ boxId: req.params.boxId })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    const massaAtualKg = ultimaLeitura[0]?.massTon ? ultimaLeitura[0].massTon * 1000 : 0;

    const resultado = await db.collection('boxes').updateOne(
      { boxId: req.params.boxId },
      { $set: { supplyTargetKg: targetKg, supplyStartMassKg: massaAtualKg } }
    );
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Meta de abastecimento definida', supplyStartMassKg: massaAtualKg });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/boxes/:boxId/meta-abastecimento - cancela a meta de abastecimento ativa (se houver)
router.delete('/:boxId/meta-abastecimento', async (req, res) => {
  try {
    const db = getDB();
    const resultado = await db
      .collection('boxes')
      .updateOne({ boxId: req.params.boxId }, { $unset: { supplyTargetKg: '', supplyStartMassKg: '' } });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Meta de abastecimento cancelada' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/boxes/:boxId - remove um boxe (não apaga o histórico de leituras já gravado)
router.delete('/:boxId', async (req, res) => {
  try {
    const db = getDB();
    const resultado = await db.collection('boxes').deleteOne({ boxId: req.params.boxId });
    if (resultado.deletedCount === 0) return res.status(404).json({ erro: 'Boxe não encontrado' });
    res.json({ mensagem: 'Boxe removido' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
