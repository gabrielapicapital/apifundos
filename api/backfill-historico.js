import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import {
  BENCHMARK_POR_CATEGORIA,
  limitarInicio,
  gravarHistoricoEmLotes,
  coletarHistoricoCvm,
  coletarHistoricoEtf,
  garantirBenchmark,
} from "./_lib/backfill.js";

// Backfill retroativo de TODOS os fundos com cnpjOuTicker + dataAdicao —
// ver README seção "Gráfico de evolução". Idempotente (upsert por
// fundo_id+data), pode rodar de novo quando mais fundos ganharem CNPJ.
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

  const alvoCvm = alvo.filter((f) => f.tipo !== "ETF");
  const { linhasParaGravar: linhasCvm, ultimaCotaPorFundo: ultimaCvm } = await coletarHistoricoCvm(alvoCvm, hoje, relatorio.erros);
  relatorio.fundosCvm = ultimaCvm.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasCvm);

  const alvoEtf = alvo.filter((f) => f.tipo === "ETF");
  const { linhasParaGravar: linhasEtf, ultimaCotaPorFundo: ultimaEtf } = await coletarHistoricoEtf(alvoEtf, hoje, relatorio.erros);
  relatorio.fundosEtf = ultimaEtf.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasEtf);

  // Atualiza preco_atual/patrimonio de cada fundo com a cota real mais
  // recente que a gente acabou de baixar (em vez de deixar travado no preço
  // de entrada até a rotina diária passar).
  const ultimaCotaGeral = new Map([...ultimaCvm, ...ultimaEtf]);
  for (const [fundoId, { cota }] of ultimaCotaGeral) {
    await sql`
      UPDATE fundos SET preco_atual = ${cota}, patrimonio = quantidade_cotas * ${cota}, atualizado_em = now()
      WHERE id = ${fundoId}
    `;
  }

  // --- Benchmarks: só os que algum fundo alvo realmente usa ---
  const inicioGeral = alvo.length ? alvo.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvo[0].inicio) : hoje;
  const benchmarksNecessarios = new Set(alvo.map((f) => BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI"));

  for (const benchmark of benchmarksNecessarios) {
    relatorio.benchmarksGravados += await garantirBenchmark(benchmark, inicioGeral, hoje, relatorio.erros);
  }

  res.status(200).json(relatorio);
}
