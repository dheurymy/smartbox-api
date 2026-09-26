/**
 * Cálculo de volume a partir da grade de sensores — separado de routes/readings.js
 * pra poder ser testado/entendido isoladamente. Usa a mesma técnica de
 * interpolação suave (Catmull-Rom) que a visualização 3D do frontend
 * (ver frontend/src/app/services/boxVolume.ts:smoothInterpolate — os dois
 * arquivos são cópias conceitualmente idênticas, cada um na linguagem do seu
 * lado, pra evitar o front rodar Node) — o que se vê no Modelo 3D é
 * matematicamente a mesma superfície usada aqui pra somar o volume, em vez de
 * duas aproximações independentes que poderiam divergir.
 */

const SENTINELA_INVALIDO = 9999;

function clampIndex(i, len) {
  return Math.max(0, Math.min(len - 1, i));
}

/** Catmull-Rom 1D: curva suave (não reta) passando exatamente por p1 e p2, com p0/p3 guiando a curvatura. */
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Interpola suavemente (bicúbica Catmull-Rom) uma grade esparsa (rows x cols)
 * pra uma grade fina (targetRows x targetCols) — ao contrário de interpolação
 * linear/bilinear, a curva pode arredondar entre os pontos em vez de formar
 * rampas retas, ficando mais parecida com o formato real de um monte de
 * material. Resultado é grampeado a [min, max] da matriz original: uma spline
 * pode "ultrapassar" levemente os valores de entrada entre dois pontos
 * (efeito colateral normal de Catmull-Rom), e isso criaria alturas acima do
 * topo do box ou negativas se não fosse contido.
 */
function smoothInterpolate(matrix, targetRows, targetCols) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return [];

  let vmin = Infinity;
  let vmax = -Infinity;
  for (const linha of matrix) {
    for (const v of linha) {
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
  }

  const result = [];
  for (let ty = 0; ty < targetRows; ty++) {
    const y = rows === 1 ? 0 : (ty / (targetRows - 1)) * (rows - 1);
    const jy = Math.floor(y);
    const fy = y - jy;
    const row = [];

    for (let tx = 0; tx < targetCols; tx++) {
      const x = cols === 1 ? 0 : (tx / (targetCols - 1)) * (cols - 1);
      const ix = Math.floor(x);
      const fx = x - ix;

      const linhasInterpoladas = [];
      for (let dy = -1; dy <= 2; dy++) {
        const ry = clampIndex(jy + dy, rows);
        const p0 = matrix[ry][clampIndex(ix - 1, cols)];
        const p1 = matrix[ry][clampIndex(ix, cols)];
        const p2 = matrix[ry][clampIndex(ix + 1, cols)];
        const p3 = matrix[ry][clampIndex(ix + 2, cols)];
        linhasInterpoladas.push(catmullRom1D(p0, p1, p2, p3, fx));
      }

      let valor = catmullRom1D(linhasInterpoladas[0], linhasInterpoladas[1], linhasInterpoladas[2], linhasInterpoladas[3], fy);
      valor = Math.min(vmax, Math.max(vmin, valor));
      row.push(valor);
    }
    result.push(row);
  }
  return result;
}

/**
 * Preenche células inválidas (sensor com sentinela, ou sem baseline) com a
 * média dos vizinhos IMEDIATOS válidos (cima/baixo/esquerda/direita) — em vez
 * de simplesmente excluir a célula da média global, como antes. Isso importa
 * quando a falha é localizada (ex: um sensor específico com fiação ruim):
 * preencher com a vizinhança real daquele ponto é mais fiel do que "puxar"
 * o valor de um canto inteiro do box pra média do resto, que pode estar bem
 * mais cheio ou mais vazio. Some recorre à média global apenas se a célula
 * não tiver NENHUM vizinho válido (ex: uma quina isolada).
 */
function preencherInvalidas(alturasMm, validas, mediaGlobalMm) {
  const rows = alturasMm.length;
  const cols = alturasMm[0]?.length ?? 0;
  const resultado = alturasMm.map((linha) => [...linha]);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (validas[r][c]) continue;
      const vizinhos = [];
      if (r > 0 && validas[r - 1][c]) vizinhos.push(alturasMm[r - 1][c]);
      if (r < rows - 1 && validas[r + 1][c]) vizinhos.push(alturasMm[r + 1][c]);
      if (c > 0 && validas[r][c - 1]) vizinhos.push(alturasMm[r][c - 1]);
      if (c < cols - 1 && validas[r][c + 1]) vizinhos.push(alturasMm[r][c + 1]);
      resultado[r][c] = vizinhos.length
        ? vizinhos.reduce((soma, v) => soma + v, 0) / vizinhos.length
        : mediaGlobalMm;
    }
  }
  return resultado;
}

/**
 * Calcula o volume ocupado a partir da matriz de distâncias.
 *
 * A altura do material em cada célula é sempre relativa ao `baseline` (a
 * matriz da PRIMEIRA leitura já recebida pra esse box) — altura = baseline -
 * distância atual. Isso calibra automaticamente qualquer offset de
 * instalação do sensor real (ver POST /api/readings, que captura o baseline).
 *
 * Diferença do cálculo anterior (uma média única e plana de todas as
 * células válidas × área total do box): aqui a altura de cada célula
 * inválida é primeiro reconstruída a partir da vizinhança real dela
 * (`preencherInvalidas`), e o volume é integrado numa superfície suave
 * supersample (`smoothInterpolate`) em vez de um único escalar — o que
 * aproxima melhor um monte real de material (mais alto no meio, afinando nas
 * bordas) do que tratar o box inteiro como um bloco de altura uniforme. Pra
 * uma grade totalmente válida e um monte perfeitamente plano, o resultado é
 * matematicamente equivalente ao cálculo antigo (mesma média × mesma área).
 */
function calcularVolume(box, matriz, baseline) {
  const rows = matriz.length;
  const cols = matriz[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return { volumeM3: 0, volumePercent: 0 };

  const alturasMm = [];
  const validas = [];
  const alturasValidasMm = [];

  for (let r = 0; r < rows; r++) {
    const linhaAltura = [];
    const linhaValida = [];
    for (let c = 0; c < cols; c++) {
      const distanciaMm = matriz[r][c];
      const zeroMm = baseline?.[r]?.[c];
      const valido = distanciaMm !== SENTINELA_INVALIDO && zeroMm !== undefined && zeroMm !== SENTINELA_INVALIDO;
      const alturaMm = valido ? zeroMm - distanciaMm : null;
      linhaValida.push(valido);
      linhaAltura.push(alturaMm);
      if (valido) alturasValidasMm.push(alturaMm);
    }
    alturasMm.push(linhaAltura);
    validas.push(linhaValida);
  }

  if (alturasValidasMm.length === 0) return { volumeM3: 0, volumePercent: 0 };

  const mediaGlobalMm = alturasValidasMm.reduce((soma, h) => soma + h, 0) / alturasValidasMm.length;
  const alturasPreenchidasMm = preencherInvalidas(alturasMm, validas, mediaGlobalMm);

  // Supersampling: quantos pontos finos por célula de sensor, em cada eixo.
  // Custo é desprezível (poucas centenas de células) mesmo pra grades maiores,
  // então prioriza fidelidade da curva em vez de performance.
  const SUPERSAMPLE_POR_SENSOR = 6;
  const fineRows = Math.max(1, rows - 1) * SUPERSAMPLE_POR_SENSOR + 1;
  const fineCols = Math.max(1, cols - 1) * SUPERSAMPLE_POR_SENSOR + 1;
  const fineGridMm = smoothInterpolate(alturasPreenchidasMm, fineRows, fineCols);

  let somaAlturasM = 0;
  let totalCelulas = 0;
  for (const linha of fineGridMm) {
    for (const alturaMm of linha) {
      const alturaClampedM = Math.min(box.heightM, Math.max(0, alturaMm / 1000));
      somaAlturasM += alturaClampedM;
      totalCelulas++;
    }
  }

  const alturaMediaM = totalCelulas > 0 ? somaAlturasM / totalCelulas : 0;
  const volumeM3 = alturaMediaM * box.widthM * box.lengthM;
  const volumePercent = box.heightM > 0 ? (alturaMediaM / box.heightM) * 100 : 0;

  return { volumeM3, volumePercent };
}

export { calcularVolume, smoothInterpolate, preencherInvalidas };
