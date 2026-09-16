// Cálculo de rentabilidade por período (mês / YTD / 12 meses) a partir de
// série histórica REAL — fundo vs. benchmark. Espelha a fórmula do adendo
// "rentabilidade-periodo-benchmark": nunca extrapola nem calcula com dado
// incompleto — janela sem cobertura vira "sem histórico suficiente".

export const BENCHMARK_POR_CATEGORIA = {
  "Renda Fixa Brasil": "CDI",
  Multimercados: "CDI",
  "Global Renda Fixa": "CDI",
  "Renda Variável Brasil": "Ibovespa",
  "Global Renda Variável": "S&P 500",
};

function paraSerieOrdenada(pontos) {
  return pontos
    .map((p) => ({ data: p.data, valor: p.preco ?? p.valor }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

// Primeiro ponto da série com data >= alvo (entra na janela "depois do
// início do período"); null se a série não chega até lá.
function primeiroApos(serie, dataAlvoISO) {
  for (const p of serie) {
    if (p.data >= dataAlvoISO) return p;
  }
  return null;
}

function addDias(dataISO, dias) {
  const d = new Date(dataISO);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function calcularPeriodos(fundoPontosBrutos, benchPontosBrutos, benchmarkNome) {
  const fundoSerieBruta = paraSerieOrdenada(fundoPontosBrutos);
  const benchSerieBruta = paraSerieOrdenada(benchPontosBrutos);
  if (fundoSerieBruta.length < 2 || benchSerieBruta.length < 2) return null;

  // O fundo pode ter um ponto "solto" bem mais antigo que o resto da série —
  // o preço de entrada gravado na hora que o fundo foi cadastrado, antes de
  // um backfill retroativo ter rodado (ou um trecho que a fonte de dado não
  // cobre). Sem cortar isso, o gráfico liga esse ponto isolado ao próximo dado real
  // como se fossem vizinhos (ignorando o buraco de meses no meio) e compara
  // contra um benchmark que só tem histórico a partir de uma data bem mais
  // recente — resultando numa comparação artificialmente distorcida. Corta
  // as duas séries pro início em comum (a data mais tardia entre as duas)
  // antes de calcular qualquer coisa.
  const inicioComum = fundoSerieBruta[0].data > benchSerieBruta[0].data ? fundoSerieBruta[0].data : benchSerieBruta[0].data;
  const fundoSerie = fundoSerieBruta.filter((p) => p.data >= inicioComum);
  const benchSerie = benchSerieBruta.filter((p) => p.data >= inicioComum);
  if (fundoSerie.length < 2 || benchSerie.length < 2) return null;

  const hoje = new Date().toISOString().slice(0, 10);
  const ultimoFundo = fundoSerie[fundoSerie.length - 1];
  const ultimoBench = benchSerie[benchSerie.length - 1];
  const primeiraDataDisponivel = fundoSerie[0].data;

  const anoAtual = hoje.slice(0, 4);
  const mesAtual = hoje.slice(0, 7);
  const hasCdiPct = benchmarkNome === "CDI";

  const janelas = [
    { label: "No mês", inicio: `${mesAtual}-01` },
    { label: "No ano (YTD)", inicio: `${anoAtual}-01-01` },
    { label: "Em 12 meses", inicio: addDias(hoje, -365) },
  ];

  const rows = janelas.map((j) => {
    if (j.inicio < primeiraDataDisponivel) {
      return { label: j.label, insuficiente: true };
    }
    const fInicio = primeiroApos(fundoSerie, j.inicio);
    const bInicio = primeiroApos(benchSerie, j.inicio);
    if (!fInicio || !bInicio || fInicio.valor === 0 || bInicio.valor === 0) {
      return { label: j.label, insuficiente: true };
    }
    const fundo = ((ultimoFundo.valor - fInicio.valor) / fInicio.valor) * 100;
    const bench = ((ultimoBench.valor - bInicio.valor) / bInicio.valor) * 100;
    return {
      label: j.label,
      fundo,
      bench,
      diff: fundo - bench,
      pctCdi: hasCdiPct ? (fundo / bench) * 100 : null,
    };
  });

  return { benchmark: benchmarkNome, rows, fundoSerie, benchSerie };
}
