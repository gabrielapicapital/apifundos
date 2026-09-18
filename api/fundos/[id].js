import { randomUUID } from "node:crypto";
import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { buscarCotaPorCnpjData, buscarPrimeiraCotaAposData, buscarCotaMaisRecente } from "../_lib/cvm.js";
import { buscarCotaFidcPorData, buscarCotaFidcMaisRecente } from "../_lib/cvmFidc.js";
import { buscarSerieYahoo, buscarCotacaoEtf } from "../_lib/mercado.js";
import { nomeDoAdmin } from "../../src/lib/admins.js";
import { SEM_GRUPO } from "../../src/lib/gruposRisco.js";
import { aprenderGrupoPorCnpj } from "../_lib/gruposRiscoDb.js";

// Busca a cota real (não inventada) mais próxima de uma data, pra um fundo
// já existente que teve a data de compra ou o CNPJ/ticker alterados via
// "Editar dados do fundo" — sem isso, o admin tinha que digitar a cota à
// mão de novo toda vez que corrigia a data (ver PATCH abaixo). ETF usa a
// mesma janela de +-7 dias da Yahoo já usada no resto do app; Fundo/FIDC
// tenta a cota diária da CVM, depois a primeira cota disponível a partir
// dali (fundo que começou depois da data digitada), depois o informe
// mensal de FIDC como último recurso — mesma ordem de fallback do
// cvm-lookup.js (usado ao adicionar um fundo novo).
async function buscarCotaNaData(tipo, cnpjOuTicker, dataISO) {
  if (tipo === "ETF") {
    const desde = new Date(dataISO);
    desde.setDate(desde.getDate() - 7);
    const ate = new Date(dataISO);
    ate.setDate(ate.getDate() + 7);
    const pontos = await buscarSerieYahoo(cnpjOuTicker, desde.toISOString().slice(0, 10), ate.toISOString().slice(0, 10));
    if (!pontos.length) return null;
    let melhor = null;
    let melhorDiff = Infinity;
    for (const p of pontos) {
      const diff = Math.abs(new Date(p.data).getTime() - new Date(dataISO).getTime());
      if (diff < melhorDiff) {
        melhorDiff = diff;
        melhor = p;
      }
    }
    return melhor ? melhor.valor : null;
  }

  const cvm = await buscarCotaPorCnpjData(cnpjOuTicker, dataISO).catch(() => null);
  if (cvm) return cvm.cota;

  const primeira = await buscarPrimeiraCotaAposData(cnpjOuTicker, dataISO).catch(() => null);
  if (primeira) return primeira.cota;

  const fidc = await buscarCotaFidcPorData(cnpjOuTicker, dataISO).catch(() => null);
  if (fidc) return fidc.cota;

  return null;
}

// Cota mais recente disponível (não numa data específica) — mesma cascata
// de fallback já usada pela rotina diária (api/cron/atualizar-precos.js):
// ETF via Yahoo, Fundo/FIDC via Informe Diário da CVM, e Informe Mensal
// como último recurso só pra FIDC (que não publica diário). Usada aqui pra
// preencher "Preço atual" sozinho quando o admin deixa em branco ou quando
// o CNPJ/ticker muda em "Editar dados do fundo" — sem isso o campo ficava
// travado em "0" pra sempre depois de um CNPJ errado, mesmo já corrigido,
// até a rotina diária passar de novo (até 24h) ou puxar histórico completo.
// Devolve a DATA junto com a cota — sem isso não dava pra saber se "preço
// atual" é de hoje ou de um FIDC com informe mensal atrasado vários meses.
async function buscarCotaAtual(tipo, cnpjOuTicker) {
  if (tipo === "ETF") {
    const r = await buscarCotacaoEtf(cnpjOuTicker).catch(() => null);
    return r ? { cota: r.preco, data: r.data } : null;
  }
  const r = await buscarCotaMaisRecente(cnpjOuTicker).catch(() => null);
  if (r) return { cota: r.cota, data: r.data };
  if (tipo === "FIDC") {
    const rMensal = await buscarCotaFidcMaisRecente(cnpjOuTicker).catch(() => null);
    if (rMensal) return { cota: rMensal.cota, data: rMensal.data };
  }
  return null;
}

function rowParaFundo(r) {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    instituicao: r.instituicao,
    categoria: r.categoria,
    grupoRisco: r.grupo_risco || SEM_GRUPO,
    cnpjOuTicker: r.cnpj_ou_ticker,
    cnpjCvm: r.cnpj_cvm,
    dataAdicao: r.data_adicao ? r.data_adicao.toISOString().slice(0, 10) : null,
    precoEntrada: r.preco_entrada != null ? Number(r.preco_entrada) : null,
    precoAtual: Number(r.preco_atual),
    dataPrecoAtual: r.data_preco_atual ? r.data_preco_atual.toISOString().slice(0, 10) : null,
    quantidadeCotas: Number(r.quantidade_cotas),
    patrimonio: Number(r.patrimonio),
    pendenteCorrecao: r.pendente_correcao,
    diagnosticoHistorico: Array.isArray(r.diagnostico_historico) ? r.diagnostico_historico : [],
  };
}

// Colunas que um PATCH pode alterar, mapeando chave do JSON -> coluna SQL.
// diagnostico_historico fica de fora desse mapeamento genérico: um PATCH com
// `novoDiagnostico` ACRESCENTA uma entrada ao histórico em vez de
// sobrescrever (ver abaixo), semântica diferente de "definir esse campo".
const CAMPOS = {
  nome: "nome",
  tipo: "tipo",
  instituicao: "instituicao",
  categoria: "categoria",
  grupoRisco: "grupo_risco",
  cnpjOuTicker: "cnpj_ou_ticker",
  cnpjCvm: "cnpj_cvm",
  dataAdicao: "data_adicao",
  precoEntrada: "preco_entrada",
  precoAtual: "preco_atual",
  quantidadeCotas: "quantidade_cotas",
  pendenteCorrecao: "pendente_correcao",
};

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    await sql`DELETE FROM fundos WHERE id = ${id}`;
    res.status(204).end();
    return;
  }

  if (req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const b = req.body || {};

    const existente = await sql`SELECT * FROM fundos WHERE id = ${id}`;
    if (!existente.length) {
      res.status(404).json({ error: "Fundo não encontrado." });
      return;
    }
    const atual = existente[0];

    const sets = [];
    const valores = {};
    for (const [chave, coluna] of Object.entries(CAMPOS)) {
      if (Object.prototype.hasOwnProperty.call(b, chave)) {
        sets.push(coluna);
        valores[coluna] = b[chave];
      }
    }

    const quantidadeCotas = valores.quantidade_cotas ?? Number(atual.quantidade_cotas);

    const dataAdicaoAntiga = atual.data_adicao ? atual.data_adicao.toISOString().slice(0, 10) : null;
    const dataAdicaoFinal = sets.includes("data_adicao") ? valores.data_adicao : dataAdicaoAntiga;
    const cnpjFinal = sets.includes("cnpj_ou_ticker") ? valores.cnpj_ou_ticker : atual.cnpj_ou_ticker;
    const tipoFinal = valores.tipo ?? atual.tipo;

    // "Editar dados do fundo" reenvia o formulário inteiro a cada salvamento
    // (mesmo editando só o preço atual, por exemplo) — sets.includes(...)
    // sozinho não diz se a data/CNPJ de fato MUDARAM, só que vieram no body.
    // Comparar contra o valor antigo evita disparar a busca de cota à toa
    // toda vez que o admin salva qualquer outra coisa no modal.
    const dataMudou = sets.includes("data_adicao") && valores.data_adicao !== dataAdicaoAntiga;
    const cnpjMudou = sets.includes("cnpj_ou_ticker") && valores.cnpj_ou_ticker !== atual.cnpj_ou_ticker;

    // O campo de preço de entrada do modal vem sempre presente no body,
    // mesmo vazio (nesse caso como null) — tratar null igual a "não
    // informado" é o que permite a busca automática substituir um campo
    // deixado em branco, sem nunca sobrescrever um valor digitado de verdade.
    const precoEntradaEnviado = sets.includes("preco_entrada") ? valores.preco_entrada : undefined;

    // Data de compra ou CNPJ/ticker mudou nesse PATCH: busca a cota real de
    // novo, a não ser que o admin já tenha digitado o preço de entrada à mão
    // no mesmo PATCH (nesse caso o valor digitado manda, nunca sobrescreve).
    // Falha na busca (fonte fora do ar, fundo sem cota ainda) não trava o
    // PATCH — só mantém pendente_correcao como estava.
    let precoEntradaAuto = null;
    if ((dataMudou || cnpjMudou) && (precoEntradaEnviado === undefined || precoEntradaEnviado === null) && dataAdicaoFinal && cnpjFinal) {
      precoEntradaAuto = await buscarCotaNaData(tipoFinal, cnpjFinal, dataAdicaoFinal).catch(() => null);
    }

    // Chave nem veio no body (ex: PATCH só de diagnóstico): preserva o que
    // já tinha. Veio (mesmo null, campo deixado em branco): a busca
    // automática pode preenchê-la; se não achou nada, respeita o branco
    // explícito do admin em vez de restaurar o valor antigo.
    const precoEntradaFinal = precoEntradaEnviado === undefined ? atual.preco_entrada : precoEntradaAuto ?? precoEntradaEnviado;
    // A busca automática ganha do que o formulário mandou: o checkbox do
    // modal é calculado no cliente ANTES de saber se a busca ia achar uma
    // cota real, então "pendente" que ele mandou pode já estar desatualizado
    // pelo mesmo salvamento.
    const pendenteCorrecaoFinal =
      precoEntradaAuto != null ? false : sets.includes("pendente_correcao") ? valores.pendente_correcao : atual.pendente_correcao;

    // Preço atual: mesma convenção do preço de entrada acima — o campo vem
    // sempre presente no body (em branco = null), e null é o sinal de
    // "busca sozinho". Dispara a busca quando o CNPJ/ticker mudou (cota
    // antiga não serve mais pro fundo certo) OU quando o admin deixou em
    // branco de propósito (ex: forçar atualização, ou um fundo que ficou
    // travado em 0 por um CNPJ errado já corrigido). Nunca sobrescreve um
    // valor que o admin digitou explicitamente.
    const precoAtualFoiEnviado = sets.includes("preco_atual");
    const precoAtualEnviado = precoAtualFoiEnviado ? valores.preco_atual : undefined;
    // "Enviado em branco" (precoAtualFoiEnviado true, valor null) dispara a
    // busca; campo nem vindo no body (ex: PATCH só de diagnóstico) NÃO —
    // sem essa distinção, salvar um registro de diagnóstico dispararia uma
    // busca de cota à toa em todo fundo.
    let precoAtualAuto = null;
    if ((cnpjMudou || (precoAtualFoiEnviado && precoAtualEnviado == null)) && cnpjFinal) {
      precoAtualAuto = await buscarCotaAtual(tipoFinal, cnpjFinal).catch(() => null);
    }
    const precoAtualFinal = precoAtualAuto?.cota ?? precoAtualEnviado ?? Number(atual.preco_atual);
    const patrimonio = quantidadeCotas * precoAtualFinal;
    // Data da cota usada em "preço atual": vem da busca automática quando
    // ela achou algo; um valor digitado à mão é assumido como "de hoje"
    // (é o que o admin está informando nesse instante); sem busca nem
    // valor novo, preserva a data que já tinha.
    const hojeISO = new Date().toISOString().slice(0, 10);
    const dataPrecoAtualFinal = precoAtualAuto?.data ?? (precoAtualEnviado != null ? hojeISO : atual.data_preco_atual);

    // Grupo de risco (adendo "grupos-de-risco") — campo simples, a detecção
    // por CNPJ acontece no cliente (sugestão inline ao sair do campo CNPJ);
    // aqui só grava o valor final que o admin confirmou (manual ou aceito
    // da sugestão) e, se for um grupo de verdade, "ensina" a tabela
    // cnpj_grupo_risco pra próxima vez que esse CNPJ aparecer.
    const grupoRiscoMudou = sets.includes("grupo_risco") && valores.grupo_risco !== atual.grupo_risco;
    const grupoRiscoFinal = sets.includes("grupo_risco") ? valores.grupo_risco : atual.grupo_risco;

    // Diagnóstico do time de Asset (adendo "diagnostico-asset-e-admins" +
    // pedido de editar/remover registro): histórico com autoria, não um
    // campo que se sobrescreve. Três ações possíveis num PATCH, mutuamente
    // exclusivas: `novoDiagnostico` ACRESCENTA uma entrada, `editarDiagnostico`
    // troca o texto de uma entrada existente (por id) e `removerDiagnostico`
    // tira uma entrada do histórico. O autor de uma entrada NOVA vem do
    // e-mail já conferido por requireAdmin (header x-admin-email), nunca do
    // que o cliente mandar no body, pra ninguém poder assinar como outra
    // pessoa — mas qualquer administrador pode editar/remover qualquer
    // entrada (mesmo modelo de permissão já usado no resto do app).
    //
    // Entradas gravadas antes de "id" existir não têm esse campo — sem ele
    // não dá pra mirar uma entrada específica pra editar/remover (a posição
    // no array pode mudar depois de uma remoção). Preenche na hora se faltar.
    const historicoAtual = (Array.isArray(atual.diagnostico_historico) ? atual.diagnostico_historico : []).map((e) =>
      e.id ? e : { ...e, id: randomUUID() }
    );
    let diagnosticoHistoricoFinal = historicoAtual;
    if (b.novoDiagnostico && typeof b.novoDiagnostico.texto === "string" && b.novoDiagnostico.texto.trim()) {
      const autorEmail = (req.headers["x-admin-email"] || "").toString().trim().toLowerCase();
      diagnosticoHistoricoFinal = [
        ...historicoAtual,
        {
          id: randomUUID(),
          data: new Date().toISOString().slice(0, 10),
          autorEmail,
          autorNome: nomeDoAdmin(autorEmail),
          texto: b.novoDiagnostico.texto.trim(),
        },
      ];
    } else if (b.editarDiagnostico && b.editarDiagnostico.id && typeof b.editarDiagnostico.texto === "string" && b.editarDiagnostico.texto.trim()) {
      diagnosticoHistoricoFinal = historicoAtual.map((e) =>
        e.id === b.editarDiagnostico.id ? { ...e, texto: b.editarDiagnostico.texto.trim(), editadoEm: new Date().toISOString().slice(0, 10) } : e
      );
    } else if (b.removerDiagnostico && b.removerDiagnostico.id) {
      diagnosticoHistoricoFinal = historicoAtual.filter((e) => e.id !== b.removerDiagnostico.id);
    }

    const rows = await sql`
      UPDATE fundos SET
        nome = ${valores.nome ?? atual.nome},
        tipo = ${valores.tipo ?? atual.tipo},
        instituicao = ${valores.instituicao ?? atual.instituicao},
        categoria = ${valores.categoria ?? atual.categoria},
        grupo_risco = ${grupoRiscoFinal},
        cnpj_ou_ticker = ${cnpjFinal},
        cnpj_cvm = ${sets.includes("cnpj_cvm") ? valores.cnpj_cvm : atual.cnpj_cvm},
        data_adicao = ${dataAdicaoFinal},
        preco_entrada = ${precoEntradaFinal},
        preco_atual = ${precoAtualFinal},
        data_preco_atual = ${dataPrecoAtualFinal},
        quantidade_cotas = ${quantidadeCotas},
        patrimonio = ${patrimonio},
        pendente_correcao = ${pendenteCorrecaoFinal},
        diagnostico_historico = ${JSON.stringify(diagnosticoHistoricoFinal)},
        atualizado_em = now()
      WHERE id = ${id}
      RETURNING *
    `;

    if (precoEntradaFinal != null && dataAdicaoFinal) {
      await sql`
        INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${id}, ${dataAdicaoFinal}, ${precoEntradaFinal})
        ON CONFLICT (fundo_id, data) DO UPDATE SET preco = EXCLUDED.preco
      `;
    }

    if (grupoRiscoMudou) {
      await aprenderGrupoPorCnpj(cnpjFinal, grupoRiscoFinal);
    }

    const resposta = rowParaFundo(rows[0]);
    // Sinaliza pro cliente disparar o backfill completo (histórico desde a
    // data de compra até hoje, ver api/fundos/[id]/backfill.js) sempre que a
    // data ou o CNPJ/ticker mudarem — sem isso só o ponto da data de entrada
    // fica gravado, e o gráfico/índices continuam vazios.
    resposta.precisaBackfill = Boolean((dataMudou || cnpjMudou) && cnpjFinal && dataAdicaoFinal);
    res.status(200).json(resposta);
    return;
  }

  if (req.method === "GET") {
    const rows = await sql`SELECT data, preco FROM historico_precos WHERE fundo_id = ${id} ORDER BY data ASC`;
    res.status(200).json(rows.map((r) => ({ data: r.data.toISOString().slice(0, 10), preco: Number(r.preco) })));
    return;
  }

  res.status(405).json({ error: "Método não permitido" });
}
