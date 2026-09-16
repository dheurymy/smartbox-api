import { Router } from 'express';
import { getDB } from '../db/connection.js';

const router = Router();

// GET /api/products - lista todos os produtos
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const produtos = await db.collection('products').find().toArray();
    res.json(produtos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/products/:productId
router.get('/:productId', async (req, res) => {
  try {
    const db = getDB();
    const produto = await db.collection('products').findOne({ productId: req.params.productId });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/products - cria um novo produto
router.post('/', async (req, res) => {
  try {
    const { productId, name, bulkDensityKgM3, colorHex } = req.body;
    if (!productId || !name || !bulkDensityKgM3) {
      return res.status(400).json({ erro: 'productId, name e bulkDensityKgM3 são obrigatórios' });
    }
    const db = getDB();
    await db.collection('products').insertOne({ productId, name, bulkDensityKgM3, colorHex });
    res.status(201).json({ mensagem: 'Produto criado' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ erro: 'productId já existe' });
    res.status(500).json({ erro: err.message });
  }
});

// PUT /api/products/:productId - atualiza um ou mais campos de um produto existente
router.put('/:productId', async (req, res) => {
  try {
    const { name, bulkDensityKgM3, colorHex } = req.body;
    const camposParaAtualizar = {};
    if (name !== undefined) camposParaAtualizar.name = name;
    if (bulkDensityKgM3 !== undefined) camposParaAtualizar.bulkDensityKgM3 = bulkDensityKgM3;
    if (colorHex !== undefined) camposParaAtualizar.colorHex = colorHex;

    if (Object.keys(camposParaAtualizar).length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um campo para atualizar' });
    }

    const db = getDB();
    const resultado = await db
      .collection('products')
      .updateOne({ productId: req.params.productId }, { $set: camposParaAtualizar });
    if (resultado.matchedCount === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ mensagem: 'Produto atualizado' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// DELETE /api/products/:productId - remove um produto, se ele não estiver em uso por nenhum boxe
router.delete('/:productId', async (req, res) => {
  try {
    const db = getDB();
    const boxesUsando = await db
      .collection('boxes')
      .countDocuments({ productId: req.params.productId });
    if (boxesUsando > 0) {
      return res
        .status(409)
        .json({ erro: `Produto está em uso por ${boxesUsando} boxe(s) e não pode ser removido` });
    }
    const resultado = await db.collection('products').deleteOne({ productId: req.params.productId });
    if (resultado.deletedCount === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json({ mensagem: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
