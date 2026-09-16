// Entrypoint usado pelo Vercel (função serverless) — mesmo app Express do
// server.js, mas sem `.listen()` (o runtime da Vercel cuida de receber as
// requisições e invocar este handler).
import { app } from './app.js';

export default app;
