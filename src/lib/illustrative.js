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

export function gerarSerieIlustrativa(nome) {
  const seed = seedFromName(nome);
  const months = ["02/26", "03/26", "04/26", "05/26", "06/26", "07/26", "08/26", "09/26"];
  const labels = [];
  const values = [];
  let v = 0;
  const totalPoints = 160;
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
