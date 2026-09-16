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

export async function closeDB() {
  if (client) await client.close();
}
