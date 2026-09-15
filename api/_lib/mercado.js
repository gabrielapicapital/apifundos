// CDI: API do Banco Central (SGS, série 12) — pública, sem chave, e é a
// única das três fontes que também poderia ser chamada direto do navegador
// (CORS liberado). Chamamos aqui mesmo assim para manter tudo num lugar só.
export async function buscarCdiUltimosDias(dias = 10) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/${dias}?formato=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar CDI: HTTP ${res.status}`);
  const dados = await res.json();
  // [{data: "DD/MM/AAAA", valor: "0.051660"}, ...] — valor é a taxa DI diária em %.
  return dados.map((d) => ({ data: d.data, taxaDiaria: parseFloat(d.valor) }));
}

// Série do CDI num intervalo, já como número-índice acumulado (base 100 no
// primeiro dia) — comparável direto com cota de fundo/preço de ETF, que
// também são "nível", não "taxa".
export async function buscarCdiSerieIndice(dataInicialISO, dataFinalISO) {
  const [yi, mi, di] = dataInicialISO.split("-");
  const [yf, mf, df] = dataFinalISO.split("-");
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?dataInicial=${di}/${mi}/${yi}&dataFinal=${df}/${mf}/${yf}&formato=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar série do CDI: HTTP ${res.status}`);
  const dados = await res.json();

  let acumulado = 100;
  return dados.map((d) => {
    const [dd, mm, yy] = d.data.split("/");
    acumulado *= 1 + parseFloat(d.valor) / 100;
    return { data: `${yy}-${mm}-${dd}`, valor: acumulado };
  });
}

// ETFs e índices (Ibovespa "^BVSP", S&P 500 "^GSPC"): não têm CORS liberado
// para o navegador (testado), mas funções serverless não são sujeitas a CORS
// (é restrição só do navegador), então funciona normalmente aqui.
function yahooSymbol(ticker) {
  // Índices (começam com ^) não levam sufixo ".SA" — só ativos da B3 levam.
  return ticker.startsWith("^") ? ticker : `${ticker}.SA`;
}

export async function buscarCotacaoEtf(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(ticker)}?range=5d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Falha ao buscar cotação de ${ticker}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const closes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i] != null) {
      const d = new Date(timestamps[i] * 1000);
      return { data: d.toISOString().slice(0, 10), preco: closes[i] };
    }
  }
  return null;
}

// Série de fechamentos diários num intervalo — usada tanto pra ETF quanto
// pros índices de benchmark (Ibovespa, S&P 500).
export async function buscarSerieYahoo(ticker, dataInicialISO, dataFinalISO) {
  const p1 = Math.floor(new Date(dataInicialISO).getTime() / 1000);
  const p2 = Math.floor(new Date(dataFinalISO).getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol(ticker)}?period1=${p1}&period2=${p2}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Falha ao buscar série de ${ticker}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const closes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;
  const pontos = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(timestamps[i] * 1000);
    pontos.push({ data: d.toISOString().slice(0, 10), valor: closes[i] });
  }
  return pontos;
}
