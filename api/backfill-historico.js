import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { fetchInformeMes, mesesEntre, normalizeCnpj } from "./_lib/cvm.js";
import { buscarSerieYahoo, buscarCdiSerieIndice } from "./_lib/mercado.js";

const BENCHMARK_POR_CATEGORIA = {
  "Renda Fixa Brasil": "CDI",
  Multimercados: "CDI",
  "Global Renda Fixa": "CDI",
  "Renda Variável Brasil": "Ibovespa",
  "Global Renda Variável": "S&P 500",
};

const TICKER_BENCHMARK = { CDI: null, Ibovespa: "^BVSP", "S&P 500": "^GSPC" };

// Profundidade máxima do backfill: os últimos 13 meses (ver adendo
// "rentabilidade-periodo-benchmark", seção 3 — cobre a janela de 12 meses +
// folga). Fundo adicionado há mais tempo que isso começa o gráfico nesse
// ponto, não na data de entrada real; ainda assim é dado 100% real, só que
// truncado — bem diferente do "exemplo ilustrativo" anterior.
const PROFUNDIDADE_MESES = 13;
const LOTE = 300; // linhas por transação — reduz de "1 round-trip por linha" pra "1 a cada 300"

function limitarInicio(dataAdicaoISO, hojeISO) {
  const hoje = new Date(hojeISO);
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - PROFUNDIDADE_MESES);
  const entrada = new Date(dataAdicaoISO);
  return entrada > limite ? dataAdicaoISO : limite.toISOString().slice(0, 10);
}

async function gravarHistoricoEmLotes(linhas) {
  // linhas: [{fundoId, data, preco}]
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await sql.transaction(
      lote.map(
        (l) => sql`
          INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${l.fundoId}, ${l.data}, ${l.preco})
          ON CONFLICT (fundo_id, data) DO UPDATE SET preco = EXCLUDED.preco
        `
      )
    );
    gravados += lote.length;
  }
  return gravados;
}

async function gravarBenchmarkEmLotes(benchmark, pontos) {
  let gravados = 0;
  for (let i = 0; i < pontos.length; i += LOTE) {
    const lote = pontos.slice(i, i + LOTE);
    await sql.transaction(
      lote.map(
        (p) => sql`
          INSERT INTO benchmark_historico (benchmark, data, valor) VALUES (${benchmark}, ${p.data}, ${p.valor})
          ON CONFLICT (benchmark, data) DO UPDATE SET valor = EXCLUDED.valor
        `
      )
    );
    gravados += lote.length;
  }
  return gravados;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const fundos = await sql`SELECT id, tipo, categoria, cnpj_ou_ticker, data_adicao FROM fundos WHERE cnpj_ou_ticker IS NOT NULL AND data_adicao IS NOT NULL`;

  const alvo = fundos.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    categoria: f.categoria,
    cnpjOuTicker: f.cnpj_ou_ticker,
    inicio: limitarInicio(f.data_adicao.toISOString().slice(0, 10), hoje),
  }));

  const relatorio = { fundosCvm: 0, fundosEtf: 0, pontosGravados: 0, benchmarksGravados: 0, erros: [] };

  // --- Fundos/FIDCs: um passe por mês, compartilhado entre todos ---
  const alvoCvm = alvo.filter((f) => f.tipo !== "ETF");
  if (alvoCvm.length) {
    const inicioMaisAntigo = alvoCvm.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvoCvm[0].inicio);
    const meses = mesesEntre(inicioMaisAntigo, hoje);
    const linhasParaGravar = [];
    const fundosComDado = new Set();

    // Baixa até 4 meses ao mesmo tempo (é I/O de rede, não CPU) — em série
    // levaria tempo demais pra caber no limite da função.
    const CONCORRENCIA = 6;
    for (let i = 0; i < meses.length; i += CONCORRENCIA) {
      const lote = meses.slice(i, i + CONCORRENCIA);
      const mapas = await Promise.all(
        lote.map((mes) =>
          fetchInformeMes(mes)
            .then((m) => ({ mes, m }))
            .catch((err) => {
              relatorio.erros.push({ mes, erro: err.message });
              return { mes, m: new Map() };
            })
        )
      );
      for (const { m: mapaMes } of mapas) {
        for (const f of alvoCvm) {
          const cnpjDigits = normalizeCnpj(f.cnpjOuTicker);
          const linhas = mapaMes.get(cnpjDigits);
          if (!linhas) continue;
          for (const l of linhas) {
            if (l.data >= f.inicio && l.data <= hoje) {
              linhasParaGravar.push({ fundoId: f.id, data: l.data, preco: l.vlQuota });
              fundosComDado.add(f.id);
            }
          }
        }
      }
    }

    relatorio.fundosCvm = fundosComDado.size;
    relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasParaGravar);
  }

  // --- ETFs: chamadas leves, em paralelo (são JSON pequenos, não arquivo) ---
  const alvoEtf = alvo.filter((f) => f.tipo === "ETF");
  const seriesEtf = await Promise.all(
    alvoEtf.map((f) =>
      buscarSerieYahoo(f.cnpjOuTicker, f.inicio, hoje)
        .then((serie) => ({ f, serie }))
        .catch((err) => {
          relatorio.erros.push({ fundo: f.id, erro: err.message });
          return { f, serie: [] };
        })
    )
  );
  for (const { f, serie } of seriesEtf) {
    if (!serie.length) continue;
    relatorio.fundosEtf++;
    relatorio.pontosGravados += await gravarHistoricoEmLotes(
      serie.map((p) => ({ fundoId: f.id, data: p.data, preco: p.valor }))
    );
  }

  // --- Benchmarks: só os que algum fundo alvo realmente usa ---
  const inicioGeral = alvo.length ? alvo.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvo[0].inicio) : hoje;
  const benchmarksNecessarios = new Set(alvo.map((f) => BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI"));

  for (const benchmark of benchmarksNecessarios) {
    try {
      const serie =
        benchmark === "CDI"
          ? await buscarCdiSerieIndice(inicioGeral, hoje)
          : await buscarSerieYahoo(TICKER_BENCHMARK[benchmark], inicioGeral, hoje);
      relatorio.benchmarksGravados += await gravarBenchmarkEmLotes(benchmark, serie);
    } catch (err) {
      relatorio.erros.push({ benchmark, erro: err.message });
    }
  }

  res.status(200).json(relatorio);
}
