import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'smartbox';

let client;
let db;

export async function connectDB() {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log(`Conectado ao MongoDB: ${dbName}`);
  return db;
}

export function getDB() {
  if (!db) throw new Error('DB não inicializado. Chame connectDB() primeiro.');
  return db;
}

/**
 * Descarta a conexão cacheada — usado quando um erro de rede/SSL indica que
 * o socket morreu. Em serverless (Vercel), a função pode ficar "quente" entre
 * invocações e reaproveitar essa conexão (é o que `connectDB()` faz de
 * propósito, pra não abrir uma conexão nova a cada request), mas se o Atlas
 * fechar o socket por trás (idle timeout, blip de rede), TODA requisição
 * seguinte na mesma instância quente ia falhar com o mesmo erro pra sempre,
 * até a função esfriar e reiniciar do zero. Chamando isso, a PRÓXIMA
 * `connectDB()` abre uma conexão nova em vez de devolver a quebrada.
 */
export function resetDB() {
  if (client) {
    client.close().catch(() => {});
  }
  client = undefined;
  db = undefined;
}

export async function closeDB() {
  if (client) await client.close();
}
