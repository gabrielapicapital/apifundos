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
import { sincronizarCadastroFundo } from "../../_lib/cadastroCompleto.js";

// POST /api/fundos/{id}/backfill — versão de UM fundo só do backfill em
// lote (api/backfill-historico.js), disparada automaticamente pelo modal
// "Adicionar fundo" assim que um fundo com CNPJ/ticker + data de compra é
// salvo: busca de uma vez toda a cota real desde a data de compra até hoje
// (em vez de esperar a rotina diária acumular um ponto por dia), atualiza
// preco_atual pra cota de hoje e garante o benchmark da categoria dele.
//
// Um fundo antigo pode precisar de muitos meses de Informe Diário (cada um
// um arquivo grande, baixado inteiro só pra tirar as linhas de um CNPJ) —
// isso pode passar dos ~90s de orçamento da função numa chamada só. Por
// isso aceita `desde`/`ate` (query, formato AAAA-MM-DD) opcionais pra
// processar um pedaço do intervalo por vez, chamado várias vezes em
// sequência por fora (ver README) até cobrir a data de adição real.
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

  const hojeReal = new Date().toISOString().slice(0, 10);
  const inicioCompleto = limitarInicio(f.data_adicao.toISOString().slice(0, 10), hojeReal);
  const desde = typeof req.query.desde === "string" && req.query.desde > inicioCompleto ? req.query.desde : inicioCompleto;
  const fim = typeof req.query.ate === "string" && req.query.ate < hojeReal ? req.query.ate : hojeReal;

  const alvo = {
    id: f.id,
    tipo: f.tipo,
    categoria: f.categoria,
    cnpjOuTicker: f.cnpj_ou_ticker,
    inicio: desde,
  };

  const relatorio = { pontosGravados: 0, cotaAtualizada: false, benchmarksGravados: 0, cadastroSincronizado: false, erros: [], intervalo: { desde, ate: fim } };

  // Cadastro completo (adendo "estrutura-dados-completa") só precisa ser
  // buscado uma vez, não em todo pedaço de um backfill fatiado. ETF não tem
  // CNPJ/cadastro na CVM (usa ticker).
  if (f.tipo !== "ETF" && desde === inicioCompleto) {
    try {
      relatorio.cadastroSincronizado = await sincronizarCadastroFundo(f.id, f.cnpj_ou_ticker);
    } catch (err) {
      relatorio.erros.push({ etapa: "cadastro", erro: err.message });
    }
  }

  const coleta =
    f.tipo === "ETF"
      ? await coletarHistoricoEtf([alvo], fim, relatorio.erros)
      : await coletarHistoricoCvm([alvo], fim, relatorio.erros);

  relatorio.pontosGravados = await gravarHistoricoEmLotes(coleta.linhasParaGravar);

  // Só limpa dado antigo/errado se esse pedaço começa desde o início de
  // verdade — senão apagaria histórico real já gravado por um pedaço
  // anterior (ver limparHistoricoAntesDe).
  if (f.tipo === "ETF" && desde === inicioCompleto) {
    const primeiraValida = coleta.primeiraDataValidaPorFundo?.get(f.id);
    if (primeiraValida) await limparHistoricoAntesDe(f.id, primeiraValida, f.data_adicao.toISOString().slice(0, 10));
  }

  // Só atualiza preco_atual/patrimonio se esse pedaço realmente cobre até
  // hoje — um pedaço mais antigo não deve sobrescrever com uma cota velha.
  const ultima = coleta.ultimaCotaPorFundo.get(f.id);
  if (ultima && fim === hojeReal) {
    await sql`
      UPDATE fundos SET preco_atual = ${ultima.cota}, patrimonio = quantidade_cotas * ${ultima.cota}, atualizado_em = now()
      WHERE id = ${f.id}
    `;
    relatorio.cotaAtualizada = true;
  }

  const benchmark = BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI";
  relatorio.benchmarksGravados = await garantirBenchmark(benchmark, desde, fim, relatorio.erros);

  res.status(200).json(relatorio);
}
