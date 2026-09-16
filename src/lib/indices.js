// Cálculos de rentabilidade histórica mês-a-mês/ano-a-ano, índices de
// risco/retorno (Sharpe, volatilidade) e drawdown — tudo derivado da série
// diária real (historico_precos + benchmark CDI), sem fonte externa extra
// (adendo "estrutura-dados-completa", seções 3 e 4). Fórmulas padrão de
// mercado, documentadas em cada função — nunca extrapola: uma janela sem
// cobertura suficiente fica de fora em vez de estimada.

const DIAS_UTEIS_ANO = 252; // convenção padrão do mercado brasileiro

function paraSerieOrdenada(pontos) {
  return pontos
    .map((p) => ({ data: p.data, valor: p.preco ?? p.valor }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

// Retornos diários simples (valor[i]/valor[i-1] - 1) a partir de uma série
// de níveis. Pula "buracos" (feriado, fim de semana) naturalmente — não
// assume periodicidade fixa, só usa os pontos que existem.
function retornosDiarios(serie) {
  const retornos = [];
  for (let i = 1; i < serie.length; i++) {
    if (serie[i - 1].valor > 0) {
      retornos.push({ data: serie[i].data, retorno: serie[i].valor / serie[i - 1].valor - 1 });
    }
  }
  return retornos;
}

function media(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function desvioPadrao(xs) {
  if (xs.length < 2) return null;
  const m = media(xs);
  const variancia = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variancia);
}

function primeiroApos(serie, dataISO) {
  for (const p of serie) if (p.data >= dataISO) return p;
  return null;
}

function addMeses(dataISO, meses) {
  const d = new Date(dataISO);
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

// Retorno acumulado (%) entre o início e o fim de uma série (níveis, não
// retornos) — mesma fórmula já usada em periodos.js.
function retornoAcumulado(serie) {
  if (serie.length < 2) return null;
  const primeiro = serie[0].valor;
  const ultimo = serie[serie.length - 1].valor;
  if (!primeiro) return null;
  return (ultimo / primeiro - 1) * 100;
}

// ---- 1. Rentabilidade mês a mês / ano a ano ----------------------------

// Mês seguinte no calendário (não confundir com "próxima chave que existe
// nos dados" — precisamos saber quando há um buraco real no meio).
function proximoMesChave(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

// Agrupa uma série de NÍVEIS em retorno de cada mês-calendário (usa o
// último valor disponível de cada mês vs. o último valor do mês anterior).
// Só calcula o retorno de um mês quando o mês calendário IMEDIATAMENTE
// anterior também tem dado — um fundo com buraco de vários meses no
// histórico (ex: backfill ainda incompleto) não pode comparar o último
// preço antes do buraco com o primeiro depois como se fossem vizinhos
// (mesmo problema já corrigido no gráfico de evolução, ver periodos.js).
function retornosMensais(serie) {
  if (serie.length < 2) return new Map();
  const porMes = new Map(); // "AAAA-MM" -> último ponto daquele mês
  for (const p of serie) {
    const chave = p.data.slice(0, 7);
    porMes.set(chave, p); // sobrescreve: sobra o último do mês
  }
  const chaves = [...porMes.keys()].sort();
  const retornos = new Map(); // "AAAA-MM" -> retorno % daquele mês
  for (let i = 1; i < chaves.length; i++) {
    if (proximoMesChave(chaves[i - 1]) !== chaves[i]) continue; // buraco: pula
    const atual = porMes.get(chaves[i]).valor;
    const anterior = porMes.get(chaves[i - 1]).valor;
    if (anterior > 0) retornos.set(chaves[i], (atual / anterior - 1) * 100);
  }
  return retornos;
}

// Monta a tabela ano×mês (adendo 4.2): uma linha por ano, uma coluna por
// mês + "No ano" + "Acumulado". Cada célula tem [retornoFundo%, pctDoCdi%]
// — segue a mesma convenção de "% do CDI" já usada na tabela de período
// (fundo/CDI × 100), não a taxa do CDI em si.
export function calcularRentabilidadeMensalAnual(fundoPontos, cdiPontos) {
  const fundoSerie = paraSerieOrdenada(fundoPontos);
  const cdiSerie = paraSerieOrdenada(cdiPontos);
  if (fundoSerie.length < 2) return { anos: [] };

  const retFundo = retornosMensais(fundoSerie);
  const retCdi = retornosMensais(cdiSerie);

  const anos = [...new Set([...retFundo.keys()].map((k) => k.slice(0, 4)))].sort();
  const primeiroMesFundo = [...retFundo.keys()].sort()[0];

  // Base 100 acumulada desde o primeiro mês com retorno, pra dar "Acumulado"
  // ano a ano sem refazer a conta a cada linha.
  let acumulado = 100;
  const acumuladoPorMes = new Map();
  for (const chave of [...retFundo.keys()].sort()) {
    acumulado *= 1 + retFundo.get(chave) / 100;
    acumuladoPorMes.set(chave, acumulado);
  }

  const linhas = anos.map((ano) => {
    const meses = [];
    let produtoAno = 1;
    let temMesNoAno = false;
    for (let m = 1; m <= 12; m++) {
      const chave = `${ano}-${String(m).padStart(2, "0")}`;
      const rFundo = retFundo.get(chave);
      const rCdi = retCdi.get(chave);
      if (rFundo == null) {
        meses.push(null);
        continue;
      }
      temMesNoAno = true;
      produtoAno *= 1 + rFundo / 100;
      const pctCdi = rCdi != null && rCdi !== 0 ? (rFundo / rCdi) * 100 : null;
      meses.push([rFundo, pctCdi]);
    }
    const noAno = temMesNoAno ? (produtoAno - 1) * 100 : null;
    const ultimoMesDoAno = [...retFundo.keys()].filter((k) => k.startsWith(ano)).sort().pop();
    const acumuladoFim = ultimoMesDoAno ? acumuladoPorMes.get(ultimoMesDoAno) : null;
    const acumuladoTotal = acumuladoFim != null ? (acumuladoFim / 100 - 1) * 100 : null;
    // %CDI acumulado no ano/total: mesma razão fundo/CDI, calculada sobre
    // os acumulados do ano/total (não a média das razões mensais).
    let noAnoCdi = null;
    if (temMesNoAno) {
      let produtoAnoCdi = 1;
      let temCdi = true;
      for (let m = 1; m <= 12; m++) {
        const chave = `${ano}-${String(m).padStart(2, "0")}`;
        if (retFundo.get(chave) == null) continue;
        const rCdi = retCdi.get(chave);
        if (rCdi == null) {
          temCdi = false;
          break;
        }
        produtoAnoCdi *= 1 + rCdi / 100;
      }
      if (temCdi) {
        const cdiAno = (produtoAnoCdi - 1) * 100;
        noAnoCdi = cdiAno !== 0 ? (noAno / cdiAno) * 100 : null;
      }
    }
    return {
      ano,
      meses,
      noAno: noAno != null ? [noAno, noAnoCdi] : null,
      acumulado: acumuladoTotal != null ? [acumuladoTotal, null] : null,
    };
  });

  return { anos: linhas, primeiroMes: primeiroMesFundo };
}

// ---- 2. Índices de risco/retorno (Sharpe, volatilidade, rentabilidade) --

const JANELAS_INDICES = [
  { label: "No mês", meses: null, tipo: "mes" },
  { label: "No ano", meses: null, tipo: "ano" },
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "12 meses", meses: 12 },
  { label: "24 meses", meses: 24 },
  { label: "36 meses", meses: 36 },
  { label: "48 meses", meses: 48 },
  { label: "60 meses", meses: 60 },
  { label: "Total", meses: null, tipo: "total" },
];

// Sharpe = (retorno anualizado do fundo - retorno anualizado do CDI no
// mesmo período) / volatilidade anualizada do fundo. Fórmula padrão
// (excess return sobre a taxa livre de risco, dividido pelo desvio-padrão
// dos retornos) — ver Sharpe (1994), "The Sharpe Ratio".
function calcularJanela(fundoSerie, cdiSerie, dataInicioISO) {
  const fInicioPonto = primeiroApos(fundoSerie, dataInicioISO);
  if (!fInicioPonto) return null;
  const fJanela = fundoSerie.filter((p) => p.data >= fInicioPonto.data);
  if (fJanela.length < 3) return null; // poucos pontos pra ter volatilidade que signifique algo

  const dias = fJanela.length - 1;
  const anos = dias / DIAS_UTEIS_ANO;
  const retTotal = retornoAcumulado(fJanela) / 100;
  const retAnualizado = anos > 0 ? (1 + retTotal) ** (1 / anos) - 1 : retTotal;

  const retornos = retornosDiarios(fJanela).map((r) => r.retorno);
  const desvioDiario = desvioPadrao(retornos);
  const volAnualizada = desvioDiario != null ? desvioDiario * Math.sqrt(DIAS_UTEIS_ANO) : null;

  let sharpe = null;
  const bInicioPonto = primeiroApos(cdiSerie, fInicioPonto.data);
  if (bInicioPonto && volAnualizada) {
    const bJanela = cdiSerie.filter((p) => p.data >= bInicioPonto.data && p.data <= fJanela[fJanela.length - 1].data);
    if (bJanela.length >= 2) {
      const retCdiTotal = retornoAcumulado(bJanela) / 100;
      const diasCdi = bJanela.length - 1;
      const anosCdi = diasCdi / DIAS_UTEIS_ANO;
      const retCdiAnualizado = anosCdi > 0 ? (1 + retCdiTotal) ** (1 / anosCdi) - 1 : retCdiTotal;
      if (volAnualizada !== 0) sharpe = (retAnualizado - retCdiAnualizado) / volAnualizada;
    }
  }

  return {
    rentabilidade: retTotal * 100,
    volatilidade: volAnualizada != null ? volAnualizada * 100 : null,
    sharpe,
  };
}

export function calcularIndicesRisco(fundoPontos, cdiPontos) {
  const fundoSerie = paraSerieOrdenada(fundoPontos);
  const cdiSerie = paraSerieOrdenada(cdiPontos);
  if (fundoSerie.length < 3) return null;

  const hoje = fundoSerie[fundoSerie.length - 1].data;
  const primeiraData = fundoSerie[0].data;

  const janelas = JANELAS_INDICES.map((j) => {
    let inicio;
    if (j.tipo === "mes") inicio = `${hoje.slice(0, 7)}-01`;
    else if (j.tipo === "ano") inicio = `${hoje.slice(0, 4)}-01-01`;
    else if (j.tipo === "total") inicio = primeiraData;
    else inicio = addMeses(hoje, j.meses);

    if (inicio < primeiraData) inicio = j.tipo === "total" ? primeiraData : inicio;
    if (j.tipo !== "total" && inicio < primeiraData) return { label: j.label, insuficiente: true };

    const resultado = calcularJanela(fundoSerie, cdiSerie, inicio);
    if (!resultado) return { label: j.label, insuficiente: true };
    return { label: j.label, ...resultado };
  });

  return { janelas };
}

// ---- 3. Drawdown (queda em relação ao pico anterior) --------------------

export function calcularDrawdown(fundoPontos) {
  const serie = paraSerieOrdenada(fundoPontos);
  if (serie.length < 2) return [];
  let pico = serie[0].valor;
  return serie.map((p) => {
    if (p.valor > pico) pico = p.valor;
    const dd = pico > 0 ? (p.valor / pico - 1) * 100 : 0;
    return { data: p.data, valor: dd };
  });
}

// ---- 4. Volatilidade móvel (janela deslizante, anualizada) --------------

export function calcularVolatilidadeSerie(fundoPontos, janelaDias = 21) {
  const serie = paraSerieOrdenada(fundoPontos);
  const retornos = retornosDiarios(serie);
  if (retornos.length < janelaDias) return [];

  const pontos = [];
  for (let i = janelaDias - 1; i < retornos.length; i++) {
    const janela = retornos.slice(i - janelaDias + 1, i + 1).map((r) => r.retorno);
    const dp = desvioPadrao(janela);
    if (dp != null) pontos.push({ data: retornos[i].data, valor: dp * Math.sqrt(DIAS_UTEIS_ANO) * 100 });
  }
  return pontos;
}
