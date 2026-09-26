import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, resetDB } from './db/connection.js';
import boxesRouter from './routes/boxes.js';
import productsRouter from './routes/products.js';
import readingsRouter from './routes/readings.js';

dotenv.config();

export const app = express();
app.use(cors());
app.use(express.json());

// Garante que a conexão com o banco esteja pronta e VIVA antes de qualquer
// rota. Em serverless (Vercel) não existe um passo de "startup" — cada
// invocação pode reaproveitar uma instância "quente" de uma chamada anterior,
// junto com a conexão cacheada por connectDB(). O `ping` aqui existe porque
// essa conexão cacheada pode ter morrido por trás (o Atlas fecha o socket por
// idle timeout ou blip de rede) sem o driver perceber sozinho — sem esse
// check, a instância quente ficaria devolvendo erro de conexão pra SEMPRE,
// até a função esfriar e reiniciar do zero (minutos, não segundos). Se o
// ping falhar, descartamos a conexão (resetDB) pra próxima requisição abrir
// uma nova — a requisição atual ainda falha, mas a API se autorrecupera já
// na seguinte, em vez de ficar travada.
app.use(async (req, res, next) => {
  try {
    const db = await connectDB();
    await db.command({ ping: 1 });
    next();
  } catch (err) {
    resetDB();
    res.status(500).json({ erro: 'Erro ao conectar no banco: ' + err.message });
  }
});

app.use('/api/boxes', boxesRouter);
app.use('/api/products', productsRouter);
app.use('/api/readings', readingsRouter);

app.get('/', (req, res) => res.json({ status: 'ok' }));
