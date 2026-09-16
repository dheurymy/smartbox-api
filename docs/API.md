# API SmartBox

API REST + WebSocket que recebe leituras dos sensores dos boxes de fertilizante,
calcula volume/massa ocupados e serve o dashboard.

- **Base URL (dev):** `http://localhost:3000`
- **Formato:** todas as rotas recebem e retornam `application/json`
- **Autenticação:** nenhuma (protótipo)
- **CORS:** liberado para qualquer origem (`*`)

---

## Sumário

- [Modelos de dados](#modelos-de-dados)
- [Boxes](#boxes)
- [Produtos](#produtos)
- [Leituras](#leituras)
- [WebSocket](#websocket-tempo-real)
- [Erros](#formato-de-erros)

---

## Modelos de dados

### Box

| Campo | Tipo | Descrição |
|---|---|---|
| `boxId` | string | Identificador único do boxe (ex: `"box-01"`) |
| `widthM` | number | Largura do boxe, em metros |
| `lengthM` | number | Comprimento do boxe, em metros |
| `heightM` | number | Altura máxima do boxe (topo do sensor até o piso), em metros |
| `sensorRows` | number | Linhas da matriz de sensores instalada nesse boxe |
| `sensorCols` | number | Colunas da matriz de sensores instalada nesse boxe |
| `productId` | string \| null | Produto atualmente armazenado (referência a `Product.productId`) |
| `status` | string | `"ativo"` por padrão |

### Product

| Campo | Tipo | Descrição |
|---|---|---|
| `productId` | string | Identificador único do produto (ex: `"prod-ureia"`) |
| `name` | string | Nome de exibição (ex: `"Ureia"`) |
| `bulkDensityKgM3` | number | Densidade aparente, em kg/m³ — usada para converter volume em massa |
| `colorHex` | string | Cor de referência para exibir no dashboard/gêmeo digital |

### Reading

| Campo | Tipo | Descrição |
|---|---|---|
| `timestamp` | datetime | Data/hora em que a leitura foi recebida pela API |
| `boxId` | string | Boxe ao qual a leitura pertence |
| `productId` | string \| null | Produto do boxe **no momento da leitura** (snapshot, não muda se o boxe for reabastecido depois) |
| `matriz` | number[][] | Distâncias em **milímetros**, uma por sensor; `9999` = leitura inválida (sem alvo detectado) |
| `volumeM3` | number | Volume ocupado estimado, em m³ |
| `volumePercent` | number | Percentual de ocupação (0–100) |
| `massTon` | number \| null | Massa estimada, em toneladas (`null` se o boxe não tiver produto definido) |
| `source` | string | `"real"` (sensor físico) ou `"simulated"` (dado gerado por `npm run simulate`) |

---

## Boxes

### `GET /api/boxes`

Lista todos os boxes, já com os dados do produto atual (join com `products`).

**Resposta `200`**
```json
[
  {
    "_id": "...",
    "boxId": "box-01",
    "widthM": 12,
    "lengthM": 20,
    "heightM": 6,
    "sensorRows": 3,
    "sensorCols": 2,
    "productId": "prod-ureia",
    "status": "ativo",
    "produto": {
      "productId": "prod-ureia",
      "name": "Ureia",
      "bulkDensityKgM3": 770,
      "colorHex": "#E8D9A0"
    }
  }
]
```
> Se o boxe não tiver `productId`, o campo `produto` vem ausente.

---

### `GET /api/boxes/:boxId`

Retorna um boxe específico (sem join com produto).

**Resposta `200`**
```json
{
  "boxId": "box-01",
  "widthM": 12,
  "lengthM": 20,
  "heightM": 6,
  "sensorRows": 3,
  "sensorCols": 2,
  "productId": "prod-ureia",
  "status": "ativo"
}
```

**Resposta `404`** — boxe não encontrado.

---

### `POST /api/boxes`

Cria um novo boxe.

**Corpo da requisição**
```json
{
  "boxId": "box-11",
  "widthM": 12,
  "lengthM": 20,
  "heightM": 6,
  "sensorRows": 3,
  "sensorCols": 2,
  "productId": "prod-ureia"
}
```

| Campo | Obrigatório | Padrão |
|---|---|---|
| `boxId` | sim | — |
| `widthM` | sim | — |
| `lengthM` | sim | — |
| `heightM` | sim | — |
| `sensorRows` | não | `3` |
| `sensorCols` | não | `2` |
| `productId` | não | `null` |

**Resposta `201`**
```json
{ "mensagem": "Boxe criado" }
```

**Resposta `400`** — faltou algum campo obrigatório.
**Resposta `409`** — já existe um boxe com esse `boxId`.

---

### `PATCH /api/boxes/:boxId/produto`

Troca o produto atualmente armazenado no boxe (ex: reabastecimento com outro fertilizante).
Não altera leituras já gravadas — elas mantêm o `productId` de quando foram medidas.

**Corpo da requisição**
```json
{ "productId": "prod-map" }
```

**Resposta `200`**
```json
{ "mensagem": "Produto do boxe atualizado" }
```

**Resposta `400`** — `productId` ausente.
**Resposta `404`** — boxe não encontrado.

---

### `PUT /api/boxes/:boxId`

Atualiza um ou mais campos de dimensão/configuração de um boxe existente.
Para trocar o produto armazenado, use `PATCH /api/boxes/:boxId/produto` acima.

**Corpo da requisição** (envie só os campos que quer mudar)
```json
{
  "widthM": 14,
  "heightM": 6.5,
  "status": "manutenção"
}
```

Campos aceitos: `widthM`, `lengthM`, `heightM`, `sensorRows`, `sensorCols`, `status`.

**Resposta `200`**
```json
{ "mensagem": "Boxe atualizado" }
```

**Resposta `400`** — nenhum campo válido enviado.
**Resposta `404`** — boxe não encontrado.

---

### `DELETE /api/boxes/:boxId`

Remove um boxe. **Não apaga o histórico de leituras já gravado** — as leituras antigas
continuam no banco associadas a um `boxId` que não existe mais em `boxes`.

**Resposta `200`**
```json
{ "mensagem": "Boxe removido" }
```

**Resposta `404`** — boxe não encontrado.

---

## Produtos

### `GET /api/products`

Lista todos os produtos cadastrados.

**Resposta `200`**
```json
[
  { "productId": "prod-ureia", "name": "Ureia", "bulkDensityKgM3": 770, "colorHex": "#E8D9A0" },
  { "productId": "prod-map", "name": "MAP", "bulkDensityKgM3": 950, "colorHex": "#C7B8A3" }
]
```

---

### `GET /api/products/:productId`

Retorna um produto específico.

**Resposta `200`** — objeto do produto.
**Resposta `404`** — produto não encontrado.

---

### `POST /api/products`

Cria um novo produto.

**Corpo da requisição**
```json
{
  "productId": "prod-kcl",
  "name": "Cloreto de potássio (KCl)",
  "bulkDensityKgM3": 1000,
  "colorHex": "#D98A8A"
}
```

| Campo | Obrigatório |
|---|---|
| `productId` | sim |
| `name` | sim |
| `bulkDensityKgM3` | sim |
| `colorHex` | não |

**Resposta `201`**
```json
{ "mensagem": "Produto criado" }
```

**Resposta `400`** — faltou campo obrigatório.
**Resposta `409`** — já existe um produto com esse `productId`.

---

### `PUT /api/products/:productId`

Atualiza um ou mais campos de um produto existente.

**Corpo da requisição** (envie só os campos que quer mudar)
```json
{ "bulkDensityKgM3": 780, "colorHex": "#EAD9A5" }
```

Campos aceitos: `name`, `bulkDensityKgM3`, `colorHex`.

**Resposta `200`**
```json
{ "mensagem": "Produto atualizado" }
```

**Resposta `400`** — nenhum campo válido enviado.
**Resposta `404`** — produto não encontrado.

---

### `DELETE /api/products/:productId`

Remove um produto — **só é permitido se nenhum boxe estiver usando esse produto no momento**
(evita deixar `boxes.productId` apontando pra um produto que não existe mais).

**Resposta `200`**
```json
{ "mensagem": "Produto removido" }
```

**Resposta `404`** — produto não encontrado.
**Resposta `409`** — produto está em uso por um ou mais boxes; troque o produto desses boxes
(via `PATCH /api/boxes/:boxId/produto`) antes de remover.

---

## Leituras

### `POST /api/readings`

Recebe uma leitura nova de um boxe (chamado pelo serviço de ingestão real ou pelo simulador).
A API busca o boxe e o produto atual dele, calcula `volumeM3`/`volumePercent`/`massTon`,
grava no MongoDB e emite o evento `nova-leitura` via WebSocket.

**Corpo da requisição**
```json
{
  "boxId": "box-01",
  "matriz": [[420, 415], [430, 428], [445, 440]],
  "source": "real"
}
```

| Campo | Obrigatório | Padrão |
|---|---|---|
| `boxId` | sim | — |
| `matriz` | sim | — |
| `source` | não | `"real"` |

**Resposta `201`** — devolve a leitura completa já calculada e gravada:
```json
{
  "timestamp": "2026-09-14T18:20:00.000Z",
  "boxId": "box-01",
  "productId": "prod-ureia",
  "matriz": [[420, 415], [430, 428], [445, 440]],
  "volumeM3": 890.4,
  "volumePercent": 62.4,
  "massTon": 685.6,
  "source": "real"
}
```

**Resposta `400`** — `boxId` ou `matriz` ausentes.
**Resposta `404`** — boxe não encontrado.

---

### `GET /api/readings/:boxId/latest`

Retorna a leitura mais recente de um boxe.

**Resposta `200`** — objeto de leitura (ver [modelo](#reading)).
**Resposta `404`** — nenhuma leitura encontrada para o boxe.

---

### `GET /api/readings/:boxId?from=&to=`

Retorna o histórico de leituras de um boxe, em ordem cronológica crescente.
`from` e `to` são opcionais (datas em formato ISO 8601) e filtram por `timestamp`.

**Exemplo**
```
GET /api/readings/box-01?from=2026-09-14T00:00:00Z&to=2026-09-14T23:59:59Z
```

**Resposta `200`** — array de leituras (pode vir vazio, `[]`).

---

## WebSocket (tempo real)

O servidor expõe Socket.io na mesma porta da API (`http://localhost:3000`).
Toda vez que uma leitura é gravada via `POST /api/readings`, o evento
`nova-leitura` é emitido com o documento salvo — use isso no dashboard em vez
de fazer polling a cada 10s.

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("nova-leitura", (leitura) => {
  // leitura tem o mesmo formato do modelo Reading acima
  console.log(leitura.boxId, leitura.volumePercent);
});
```

> O evento é global (não filtrado por boxe) — se você só quiser reagir a um
> boxe específico, filtre `leitura.boxId === boxIdDesejado` no callback.

---

## Formato de erros

Todas as rotas retornam erros no mesmo formato:

```json
{ "erro": "mensagem descrevendo o problema" }
```

| Status | Quando acontece |
|---|---|
| `400` | Campo obrigatório ausente no corpo da requisição |
| `404` | Boxe, produto ou leitura não encontrados |
| `409` | Conflito de chave única (`boxId` ou `productId` já existe) |
| `500` | Erro inesperado (ex: falha de conexão com o MongoDB) |
