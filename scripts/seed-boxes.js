import { connectDB, closeDB } from '../db/connection.js';

// Tamanhos e produtos variados só pra ter um dashboard visualmente rico
const boxesExemplo = [
  { boxId: 'box-01', widthM: 12, lengthM: 20, heightM: 6, sensorRows: 3, sensorCols: 2, productId: 'prod-ureia' },
  { boxId: 'box-02', widthM: 10, lengthM: 18, heightM: 5, sensorRows: 3, sensorCols: 2, productId: 'prod-map' },
  { boxId: 'box-03', widthM: 12, lengthM: 20, heightM: 6, sensorRows: 3, sensorCols: 2, productId: 'prod-ureia' },
  { boxId: 'box-04', widthM: 8, lengthM: 15, heightM: 4.5, sensorRows: 2, sensorCols: 2, productId: 'prod-map' },
  { boxId: 'box-05', widthM: 12, lengthM: 20, heightM: 6, sensorRows: 3, sensorCols: 2, productId: 'prod-ureia' },
  { boxId: 'box-06', widthM: 14, lengthM: 22, heightM: 6.5, sensorRows: 3, sensorCols: 3, productId: 'prod-kcl' },
  { boxId: 'box-07', widthM: 10, lengthM: 18, heightM: 5, sensorRows: 3, sensorCols: 2, productId: 'prod-map' },
  { boxId: 'box-08', widthM: 8, lengthM: 15, heightM: 4.5, sensorRows: 2, sensorCols: 2, productId: 'prod-ureia' },
  { boxId: 'box-09', widthM: 14, lengthM: 22, heightM: 6.5, sensorRows: 3, sensorCols: 3, productId: 'prod-kcl' },
  { boxId: 'box-10', widthM: 12, lengthM: 20, heightM: 6, sensorRows: 3, sensorCols: 2, productId: 'prod-map' },
];

const produtosExemplo = [
  { productId: 'prod-ureia', name: 'Ureia', bulkDensityKgM3: 770, colorHex: '#E8D9A0' },
  { productId: 'prod-map', name: 'MAP', bulkDensityKgM3: 950, colorHex: '#C7B8A3' },
  { productId: 'prod-kcl', name: 'Cloreto de potássio (KCl)', bulkDensityKgM3: 1000, colorHex: '#D98A8A' },
];

async function seed() {
  const db = await connectDB();

  for (const produto of produtosExemplo) {
    await db
      .collection('products')
      .updateOne({ productId: produto.productId }, { $set: produto }, { upsert: true });
  }
  console.log(`${produtosExemplo.length} produtos prontos.`);

  for (const box of boxesExemplo) {
    await db
      .collection('boxes')
      .updateOne(
        { boxId: box.boxId },
        { $set: box, $setOnInsert: { status: 'ativo' } },
        { upsert: true }
      );
  }
  console.log(`${boxesExemplo.length} boxes prontos: ${boxesExemplo.map((b) => b.boxId).join(', ')}`);

  await closeDB();
}

seed().catch((err) => {
  console.error('Erro ao criar boxes de exemplo:', err);
  process.exit(1);
});
