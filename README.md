# SmartBox API

API em Node.js/Express que recebe leituras dos sensores dos boxes de fertilizante,
calcula volume/massa e serve o dashboard React.

## Como rodar

```bash
npm install
cp .env.example .env   # ajuste MONGODB_URI se necessário
npm run init-db        # cria coleções, índices e dados de exemplo
npm start               # inicia a API em http://localhost:3000
```

## Rotas

### Produtos
- `GET /api/products` — lista produtos
- `GET /api/products/:productId` — detalhe de um produto
- `POST /api/products` — cria produto `{ productId, name, bulkDensityKgM3, colorHex }`

### Boxes
- `GET /api/boxes` — lista boxes com produto atual (join)
- `GET /api/boxes/:boxId` — detalhe de um boxe
- `POST /api/boxes` — cria boxe `{ boxId, widthM, lengthM, heightM, sensorRows, sensorCols, productId }`
- `PATCH /api/boxes/:boxId/produto` — troca o produto atual do boxe `{ productId }`

### Leituras
- `POST /api/readings` — recebe leitura nova `{ boxId, matriz, source }` (usado pelo serviço de ingestão)
- `GET /api/readings/:boxId/latest` — última leitura do boxe
- `GET /api/readings/:boxId?from=&to=` — histórico de leituras

## Tempo real

A API roda como função serverless na Vercel, então não há conexão persistente
(WebSocket) disponível. O dashboard React atualiza os dados por **polling**:
busca `GET /api/boxes` e `GET /api/readings/:boxId/latest` de cada boxe a cada
10 segundos.

## Gerando os 10 boxes simulados

Depois do `npm run init-db`, crie os outros 9 boxes via `POST /api/boxes`
(mesmas dimensões do box-01 ou dimensões diferentes, como preferir) e, no
serviço de ingestão, faça um `POST /api/readings` para cada `boxId` reaproveitando
a mesma `matriz` lida do boxe real, com `source: "simulated"`.
