// Dados ILUSTRATIVOS para a comparação com benchmark e o gráfico de evolução.
// Gerados de forma determinística a partir do nome do fundo (mesma semente ->
// mesma série sempre), só para mostrar como a funcionalidade vai se comportar
// quando houver histórico real (ver especificação seção 8: "nenhuma dessas
// métricas deve ser mostrada antes de haver histórico real suficiente para
// calculá-las honestamente"). Por isso a UI marca sempre "exemplo ilustrativo"
// — nunca é exibido como se fosse rentabilidade real do fundo.

export const BENCHMARK_POR_CATEGORIA = {
  "Renda Fixa Brasil": "CDI",
  Multimercados: "CDI",
  "Global Renda Fixa": "CDI",
  "Renda Variável Brasil": "Ibovespa",
  "Global Renda Variável": "S&P 500",
};

function seedFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
  return h;
}

function mockReturn(seed, salt, scale) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  const frac = x - Math.floor(x);
  return (frac * 2 - 1) * scale;
}

const DEFAULT_CHART_MONTHS = ["02/26", "03/26", "04/26", "05/26", "06/26", "07/26", "08/26", "09/26"];

// dataAdicao pode estar em "DD/MM/AAAA" (dados do seed) ou "AAAA-MM-DD"
// (fundos adicionados/editados pelo <input type="date">) — ver lib/format.js.
function parseFundDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.includes("-") ? dateStr.split("-").map(Number) : dateStr.split("/").reverse().map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function monthRangeFrom(startDate, endDate) {
  const labels = [];
  let y = startDate.getFullYear();
  let m = startDate.getMonth();
  const endY = endDate.getFullYear();
  const endM = endDate.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    labels.push(`${String(m + 1).padStart(2, "0")}/${String(y).slice(2)}`);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return labels;
}

export function abreviarNome(nome, maxLen = 26) {
  if (!nome) return "";
  return nome.length > maxLen ? `${nome.slice(0, maxLen - 1).trim()}…` : nome;
}

// Se o fundo tem data_adicao conhecida, o gráfico começa nesse mês e vai até
// hoje (mais pontos = mais meses de "histórico" ilustrativo). Sem data
// conhecida, cai numa janela padrão de 8 meses só pra não ficar vazio — ver
// aviso correspondente em benchmarkChart.js.
export function gerarSerieIlustrativa(fundo) {
  const seed = seedFromName(fundo.nome);
  const entryDate = parseFundDate(fundo.dataAdicao);
  const months = entryDate ? monthRangeFrom(entryDate, new Date()) : DEFAULT_CHART_MONTHS;
  const labels = [];
  const values = [];
  let v = 0;
  const totalPoints = Math.max(20, months.length * 20);
  for (let i = 0; i < totalPoints; i++) {
    const noise = mockReturn(seed + i * 7, i % 13, 1.1);
    const drift = (mockReturn(seed, 99, 1) / totalPoints) * 3;
    v += noise * 0.35 + drift;
    values.push(v);
    const monthIdx = Math.min(months.length - 1, Math.floor((i / totalPoints) * months.length));
    labels.push(months[monthIdx]);
  }
  return { labels, values };
}

export function gerarSerieBenchmarkIlustrativa(nome, totalPoints) {
  const seed = seedFromName(nome) + 5000;
  const values = [];
  let v = 0;
  for (let i = 0; i < totalPoints; i++) {
    const noise = mockReturn(seed + i * 7, (i % 13) + 20, 0.7);
    const drift = (mockReturn(seed, 199, 0.6) / totalPoints) * 3;
    v += noise * 0.35 + drift;
    values.push(v);
  }
  return values;
}

export function gerarBenchmarkPorPeriodo(fundo) {
  const benchmark = BENCHMARK_POR_CATEGORIA[fundo.categoria] || "CDI";
  const seed = seedFromName(fundo.nome);
  const isFx = benchmark === "CDI";
  const scaleFundo = isFx ? 1.5 : 6;
  const scaleBench = isFx ? 1.1 : 4;

  const periodos = [
    { label: "No mês", saltF: 1, saltB: 2 },
    { label: "No ano (YTD)", saltF: 3, saltB: 4 },
    { label: "Em 12 meses", saltF: 5, saltB: 6 },
  ];

  return {
    benchmark,
    rows: periodos.map((p) => {
      const fundoRet = mockReturn(seed, p.saltF, scaleFundo) + (isFx ? 0.8 : 3);
      const benchRet = mockReturn(seed, p.saltB, scaleBench) + (isFx ? 0.9 : 2);
      return {
        label: p.label,
        fundo: fundoRet,
        bench: benchRet,
        diff: fundoRet - benchRet,
        pctCdi: isFx ? (fundoRet / benchRet) * 100 : null,
      };
    }),
  };
}
