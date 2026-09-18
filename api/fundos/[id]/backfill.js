import { sql } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import {
  BENCHMARKS_DISPONIVEIS,
  inicioParaCriacao,
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
// salvo: busca de uma vez toda a cota real desde a criação do fundo (não só
// desde a data de compra — ver inicioParaCriacao em ../../_lib/backfill.js e
// o adendo toggle-criacao-vs-compra) até hoje, atualiza preco_atual pra cota
// de hoje e garante o benchmark da categoria dele. historico_precos guarda
// a série completa; o toggle "desde a criação"/"desde a compra" na tela de
// detalhe é só um filtro por dataAdicao em cima dela.
//
// Um fundo antigo pode precisar de muitos meses de Informe Diário (cada um
// um arquivo grande, baixado inteiro só pra tirar as linhas de um CNPJ) —
// isso pode passar dos ~90s de orçamento da função numa chamada só. Por
// isso aceita `desde`/`ate` (query, formato AAAA-MM-DD) opcionais pra
// processar um pedaço do intervalo por vez, chamado várias vezes em
// sequência por fora (ver README) até cobrir a data de início real.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  const existente = await sql`
    SELECT f.id, f.tipo, f.categoria, f.cnpj_ou_ticker, f.data_adicao, fc.primeira_cota
    FROM fundos f
    LEFT JOIN fundos_cadastro fc ON fc.fundo_id = f.id
    WHERE f.id = ${id}
  `;
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
  const dataAdicaoISO = f.data_adicao.toISOString().slice(0, 10);
  // "Primeira chamada" é definida pelo chamador ter omitido `desde` (não
  // pelo valor calculado de inicioCompleto, que só dá pra saber DEPOIS de
  // sincronizar o cadastro) — é o sinal de que ainda não processamos nenhum
  // pedaço desse backfill fatiado.
  const primeiraChamada = typeof req.query.desde !== "string";

  const relatorio = { pontosGravados: 0, cotaAtualizada: false, benchmarksGravados: 0, cadastroSincronizado: false, erros: [], intervalo: null };

  // Cadastro completo (adendo "estrutura-dados-completa") só precisa ser
  // buscado uma vez, não em todo pedaço de um backfill fatiado — além dos
  // outros campos, é ele quem traz/atualiza a "primeira cota" usada abaixo
  // pra saber desde quando o fundo existe de verdade. ETF não tem CNPJ/
  // cadastro na CVM (usa ticker).
  let primeiraCotaISO = f.primeira_cota ? f.primeira_cota.toISOString().slice(0, 10) : null;
  if (f.tipo !== "ETF" && primeiraChamada) {
    try {
      const registro = await sincronizarCadastroFundo(f.id, f.cnpj_ou_ticker);
      relatorio.cadastroSincronizado = Boolean(registro);
      if (registro?.primeiraCota) primeiraCotaISO = registro.primeiraCota;
    } catch (err) {
      relatorio.erros.push({ etapa: "cadastro", erro: err.message });
    }
  }

  const inicioCompleto = inicioParaCriacao({ tipo: f.tipo, primeiraCotaISO, dataAdicaoISO, hojeISO: hojeReal });
  const desde = typeof req.query.desde === "string" && req.query.desde > inicioCompleto ? req.query.desde : inicioCompleto;
  const fim = typeof req.query.ate === "string" && req.query.ate < hojeReal ? req.query.ate : hojeReal;
  relatorio.intervalo = { desde, ate: fim };

  const alvo = {
    id: f.id,
    tipo: f.tipo,
    categoria: f.categoria,
    cnpjOuTicker: f.cnpj_ou_ticker,
    inicio: desde,
  };

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
      UPDATE fundos SET preco_atual = ${ultima.cota}, data_preco_atual = ${ultima.data}, patrimonio = quantidade_cotas * ${ultima.cota}, atualizado_em = now()
      WHERE id = ${f.id}
    `;
    relatorio.cotaAtualizada = true;
  }

  // Garante os 4 benchmarks do seletor "Comparar com", não só o default da
  // categoria — qualquer fundo pode trocar de benchmark na tela.
  for (const benchmark of BENCHMARKS_DISPONIVEIS) {
    relatorio.benchmarksGravados += await garantirBenchmark(benchmark, desde, fim, relatorio.erros);
  }

  res.status(200).json(relatorio);
}
