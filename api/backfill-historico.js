import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import {
  BENCHMARKS_DISPONIVEIS,
  inicioParaCriacao,
  gravarHistoricoEmLotes,
  coletarHistoricoCvm,
  coletarHistoricoEtf,
  garantirBenchmark,
  limparHistoricoAntesDe,
} from "./_lib/backfill.js";

// Backfill retroativo de TODOS os fundos com cnpjOuTicker + dataAdicao —
// ver README seção "Gráfico de evolução". Idempotente (upsert por
// fundo_id+data), pode rodar de novo quando mais fundos ganharem CNPJ.
//
// Busca desde a criação do fundo (primeira_cota, se o cadastro já tiver
// sido sincronizado — ver inicioParaCriacao em ./_lib/backfill.js), não só
// desde a compra: historico_precos vira a série completa, e o toggle
// "desde a criação"/"desde a compra" na tela de detalhe é só um filtro por
// dataAdicao em cima dela. Essa rota não sincroniza cadastro sozinha (isso
// é feito por /api/sincronizar-cadastro ou pelo backfill por fundo) — pra
// um fundo cujo cadastro ainda não foi sincronizado, cai pro comportamento
// de antes (desde a compra) até isso acontecer.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const fundos = await sql`
    SELECT f.id, f.tipo, f.categoria, f.cnpj_ou_ticker, f.data_adicao, fc.primeira_cota
    FROM fundos f
    LEFT JOIN fundos_cadastro fc ON fc.fundo_id = f.id
    WHERE f.cnpj_ou_ticker IS NOT NULL AND f.data_adicao IS NOT NULL
  `;

  const alvo = fundos.map((f) => {
    const dataAdicaoISO = f.data_adicao.toISOString().slice(0, 10);
    return {
      id: f.id,
      tipo: f.tipo,
      categoria: f.categoria,
      cnpjOuTicker: f.cnpj_ou_ticker,
      dataAdicao: dataAdicaoISO,
      inicio: inicioParaCriacao({
        tipo: f.tipo,
        primeiraCotaISO: f.primeira_cota ? f.primeira_cota.toISOString().slice(0, 10) : null,
        dataAdicaoISO,
        hojeISO: hoje,
      }),
    };
  });

  const relatorio = { fundosCvm: 0, fundosEtf: 0, pontosGravados: 0, benchmarksGravados: 0, erros: [] };

  const alvoCvm = alvo.filter((f) => f.tipo !== "ETF");
  const { linhasParaGravar: linhasCvm, ultimaCotaPorFundo: ultimaCvm } = await coletarHistoricoCvm(alvoCvm, hoje, relatorio.erros);
  relatorio.fundosCvm = ultimaCvm.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasCvm);

  const alvoEtf = alvo.filter((f) => f.tipo === "ETF");
  const { linhasParaGravar: linhasEtf, ultimaCotaPorFundo: ultimaEtf, primeiraDataValidaPorFundo } = await coletarHistoricoEtf(alvoEtf, hoje, relatorio.erros);
  relatorio.fundosEtf = ultimaEtf.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasEtf);

  // Limpa linha antigas de um backfill anterior que ficaram no "patamar"
  // espúrio da Yahoo (ver buscarSerieYahoo) — agora que sabemos onde a
  // cota real de fato começa.
  for (const f of alvoEtf) {
    const primeiraValida = primeiraDataValidaPorFundo.get(f.id);
    if (primeiraValida) await limparHistoricoAntesDe(f.id, primeiraValida, f.dataAdicao);
  }

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

  // --- Benchmarks: os 4 do seletor "Comparar com" (adendo pagina-detalhe-
  // estrutura, seção 4.1) cobrindo desde o fundo mais antigo, pra qualquer
  // fundo poder trocar de benchmark na hora sem precisar buscar de novo ---
  const inicioGeral = alvo.length ? alvo.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvo[0].inicio) : hoje;

  for (const benchmark of BENCHMARKS_DISPONIVEIS) {
    relatorio.benchmarksGravados += await garantirBenchmark(benchmark, inicioGeral, hoje, relatorio.erros);
  }

  res.status(200).json(relatorio);
}
