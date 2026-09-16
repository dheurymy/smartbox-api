import { connectDB, closeDB } from './connection.js';

async function init() {
  const db = await connectDB();

  const colecoesExistentes = (await db.listCollections().toArray()).map((c) => c.name);

  // --- products ---
  if (!colecoesExistentes.includes('products')) {
    await db.createCollection('products');
    console.log('Coleção "products" criada.');
  }
  await db.collection('products').createIndex({ productId: 1 }, { unique: true });

  // --- boxes ---
  if (!colecoesExistentes.includes('boxes')) {
    await db.createCollection('boxes');
    console.log('Coleção "boxes" criada.');
  }
  await db.collection('boxes').createIndex({ boxId: 1 }, { unique: true });

  // --- readings (time-series) ---
  if (!colecoesExistentes.includes('readings')) {
    await db.createCollection('readings', {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'boxId',
        granularity: 'seconds',
      },
    });
    console.log('Coleção "readings" criada (time-series).');
  }
  await db.collection('readings').createIndex({ boxId: 1, timestamp: -1 });

  // --- seed opcional ---
  if ((await db.collection('products').countDocuments()) === 0) {
    await db.collection('products').insertMany([
      { productId: 'prod-ureia', name: 'Ureia', bulkDensityKgM3: 770, colorHex: '#E8D9A0' },
      { productId: 'prod-map', name: 'MAP', bulkDensityKgM3: 950, colorHex: '#C7B8A3' },
    ]);
    console.log('Produtos de exemplo inseridos.');
  }

  if ((await db.collection('boxes').countDocuments()) === 0) {
    await db.collection('boxes').insertOne({
      boxId: 'box-01',
      widthM: 12.0,
      lengthM: 20.0,
      heightM: 6.0,
      sensorRows: 3,
      sensorCols: 2,
      productId: 'prod-ureia',
      status: 'ativo',
    });
    console.log('Boxe de exemplo (box-01) inserido.');
  }

  console.log('Inicialização do banco concluída.');
  await closeDB();
}

init().catch((err) => {
  console.error('Erro ao inicializar banco:', err);
  process.exit(1);
});
