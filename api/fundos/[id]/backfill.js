import { sql } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import {
  BENCHMARK_POR_CATEGORIA,
  limitarInicio,
  gravarHistoricoEmLotes,
  coletarHistoricoCvm,
  coletarHistoricoEtf,
  garantirBenchmark,
  limparHistoricoAntesDe,
} from "../../_lib/backfill.js";

// POST /api/fundos/{id}/backfill — versão de UM fundo só do backfill em
// lote (api/backfill-historico.js), disparada automaticamente pelo modal
// "Adicionar fundo" assim que um fundo com CNPJ/ticker + data de compra é
// salvo: busca de uma vez toda a cota real desde a data de compra até hoje
// (em vez de esperar a rotina diária acumular um ponto por dia), atualiza
// preco_atual pra cota de hoje e garante o benchmark da categoria dele.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  const existente = await sql`SELECT id, tipo, categoria, cnpj_ou_ticker, data_adicao FROM fundos WHERE id = ${id}`;
  if (!existente.length) {
    res.status(404).json({ error: "Fundo não encontrado." });
    return;
  }
  const f = existente[0];
  if (!f.cnpj_ou_ticker || !f.data_adicao) {
    res.status(400).json({ error: "Fundo sem cnpjOuTicker ou dataAdicao: nada pra buscar." });
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const alvo = {
    id: f.id,
    tipo: f.tipo,
    categoria: f.categoria,
    cnpjOuTicker: f.cnpj_ou_ticker,
    inicio: limitarInicio(f.data_adicao.toISOString().slice(0, 10), hoje),
  };

  const relatorio = { pontosGravados: 0, cotaAtualizada: false, benchmarksGravados: 0, erros: [] };

  const coleta =
    f.tipo === "ETF"
      ? await coletarHistoricoEtf([alvo], hoje, relatorio.erros)
      : await coletarHistoricoCvm([alvo], hoje, relatorio.erros);

  relatorio.pontosGravados = await gravarHistoricoEmLotes(coleta.linhasParaGravar);

  if (f.tipo === "ETF") {
    const primeiraValida = coleta.primeiraDataValidaPorFundo?.get(f.id);
    if (primeiraValida) await limparHistoricoAntesDe(f.id, primeiraValida, f.data_adicao.toISOString().slice(0, 10));
  }

  const ultima = coleta.ultimaCotaPorFundo.get(f.id);
  if (ultima) {
    await sql`
      UPDATE fundos SET preco_atual = ${ultima.cota}, patrimonio = quantidade_cotas * ${ultima.cota}, atualizado_em = now()
      WHERE id = ${f.id}
    `;
    relatorio.cotaAtualizada = true;
  }

  const benchmark = BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI";
  relatorio.benchmarksGravados = await garantirBenchmark(benchmark, alvo.inicio, hoje, relatorio.erros);

  res.status(200).json(relatorio);
}
