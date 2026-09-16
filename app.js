import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db/connection.js';
import boxesRouter from './routes/boxes.js';
import productsRouter from './routes/products.js';
import readingsRouter from './routes/readings.js';

dotenv.config();

export const app = express();
app.use(cors());
app.use(express.json());

// Garante que a conexão com o banco esteja pronta antes de qualquer rota.
// Em serverless (Vercel) não existe um passo de "startup" — cada invocação
// pode ser uma instância fria — então conectamos (ou reaproveitamos a conexão
// já cacheada por connectDB) no início de cada requisição.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao conectar no banco: ' + err.message });
  }
});

app.use('/api/boxes', boxesRouter);
app.use('/api/products', productsRouter);
app.use('/api/readings', readingsRouter);

app.get('/', (req, res) => res.json({ status: 'ok' }));
