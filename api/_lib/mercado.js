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

// ETFs: não têm CORS liberado para o navegador (testado), mas funções
// serverless não são sujeitas a CORS (é uma restrição só do navegador),
// então funciona normalmente aqui.
export async function buscarCotacaoEtf(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?range=5d&interval=1d`;
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
