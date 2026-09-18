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
//
// Com ~70 fundos e histórico agora podendo voltar mais de 10 anos, uma
// chamada só cobrindo tudo de uma vez pode passar dos 300s de orçamento da
// função — por isso aceita `desde`/`ate` (query, formato AAAA-MM-DD)
// opcionais, mesmo mecanismo do backfill por fundo (api/fundos/[id]/
// backfill.js), pra rodar em pedaços (ex: um intervalo de 12 meses por
// chamada) chamados em sequência por fora até cobrir o fundo mais antigo.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const desdeParam = typeof req.query.desde === "string" ? req.query.desde : null;
  const fim = typeof req.query.ate === "string" && req.query.ate < hoje ? req.query.ate : hoje;

  const fundos = await sql`
    SELECT f.id, f.tipo, f.categoria, f.cnpj_ou_ticker, f.data_adicao, fc.primeira_cota
    FROM fundos f
    LEFT JOIN fundos_cadastro fc ON fc.fundo_id = f.id
    WHERE f.cnpj_ou_ticker IS NOT NULL AND f.data_adicao IS NOT NULL
  `;

  const alvoTodos = fundos.map((f) => {
    const dataAdicaoISO = f.data_adicao.toISOString().slice(0, 10);
    const inicioReal = inicioParaCriacao({
      tipo: f.tipo,
      primeiraCotaISO: f.primeira_cota ? f.primeira_cota.toISOString().slice(0, 10) : null,
      dataAdicaoISO,
      hojeISO: hoje,
    });
    return {
      id: f.id,
      tipo: f.tipo,
      categoria: f.categoria,
      cnpjOuTicker: f.cnpj_ou_ticker,
      dataAdicao: dataAdicaoISO,
      inicioReal,
      // Início efetivo pra ESSE pedaço: nunca antes do início de verdade do
      // fundo, nem antes do que esse pedaço pediu pra cobrir.
      inicio: desdeParam && desdeParam > inicioReal ? desdeParam : inicioReal,
    };
  });
  // Fundo cujo início de verdade é depois do fim desse pedaço: nada pra
  // buscar ainda aqui (um pedaço mais pra frente no tempo vai cobrir).
  const alvo = alvoTodos.filter((f) => f.inicioReal <= fim);
  const primeiroPedaco = !desdeParam;

  const relatorio = { fundosCvm: 0, fundosEtf: 0, pontosGravados: 0, benchmarksGravados: 0, erros: [], intervalo: { desde: desdeParam, ate: fim } };

  const alvoCvm = alvo.filter((f) => f.tipo !== "ETF");
  const { linhasParaGravar: linhasCvm, ultimaCotaPorFundo: ultimaCvm } = await coletarHistoricoCvm(alvoCvm, fim, relatorio.erros);
  relatorio.fundosCvm = ultimaCvm.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasCvm);

  const alvoEtf = alvo.filter((f) => f.tipo === "ETF");
  const { linhasParaGravar: linhasEtf, ultimaCotaPorFundo: ultimaEtf, primeiraDataValidaPorFundo } = await coletarHistoricoEtf(alvoEtf, fim, relatorio.erros);
  relatorio.fundosEtf = ultimaEtf.size;
  relatorio.pontosGravados += await gravarHistoricoEmLotes(linhasEtf);

  // Limpa linha antigas de um backfill anterior que ficaram no "patamar"
  // espúrio da Yahoo (ver buscarSerieYahoo) — só no primeiro pedaço, que é
  // o único que sabe onde a série de verdade começa (um pedaço do meio não
  // pode concluir isso, senão apagaria histórico real de um pedaço anterior).
  if (primeiroPedaco) {
    for (const f of alvoEtf) {
      const primeiraValida = primeiraDataValidaPorFundo.get(f.id);
      if (primeiraValida) await limparHistoricoAntesDe(f.id, primeiraValida, f.dataAdicao);
    }
  }

  // Atualiza preco_atual/patrimonio com a cota mais recente baixada — só
  // quando esse pedaço realmente cobre até hoje (senão um pedaço antigo
  // sobrescreveria com uma cota velha).
  if (fim === hoje) {
    const ultimaCotaGeral = new Map([...ultimaCvm, ...ultimaEtf]);
    for (const [fundoId, { cota, data }] of ultimaCotaGeral) {
      await sql`
        UPDATE fundos SET preco_atual = ${cota}, data_preco_atual = ${data}, patrimonio = quantidade_cotas * ${cota}, atualizado_em = now()
        WHERE id = ${fundoId}
      `;
    }
  }

  // --- Benchmarks: os 4 do seletor "Comparar com" (adendo pagina-detalhe-
  // estrutura, seção 4.1) cobrindo o intervalo desse pedaço ---
  const inicioGeral = alvo.length ? alvo.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvo[0].inicio) : fim;

  for (const benchmark of BENCHMARKS_DISPONIVEIS) {
    relatorio.benchmarksGravados += await garantirBenchmark(benchmark, inicioGeral, fim, relatorio.erros);
  }

  res.status(200).json(relatorio);
}
