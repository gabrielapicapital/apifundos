import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { buscarCotaPorCnpjData, buscarPrimeiraCotaAposData } from "../_lib/cvm.js";
import { buscarCotaFidcPorData } from "../_lib/cvmFidc.js";
import { buscarSerieYahoo } from "../_lib/mercado.js";
import { nomeDoAdmin } from "../../src/lib/admins.js";

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

function rowParaFundo(r) {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    instituicao: r.instituicao,
    categoria: r.categoria,
    cnpjOuTicker: r.cnpj_ou_ticker,
    cnpjCvm: r.cnpj_cvm,
    dataAdicao: r.data_adicao ? r.data_adicao.toISOString().slice(0, 10) : null,
    precoEntrada: r.preco_entrada != null ? Number(r.preco_entrada) : null,
    precoAtual: Number(r.preco_atual),
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

    const precoAtual = valores.preco_atual ?? Number(atual.preco_atual);
    const quantidadeCotas = valores.quantidade_cotas ?? Number(atual.quantidade_cotas);
    const patrimonio = quantidadeCotas * precoAtual;

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

    // Diagnóstico do time de Asset (adendo "diagnostico-asset-e-admins"):
    // histórico com autoria, não um campo que se sobrescreve — cada PATCH
    // com `novoDiagnostico` ACRESCENTA uma entrada. O autor vem do e-mail já
    // conferido por requireAdmin (header x-admin-email), nunca do que o
    // cliente mandar no body, pra ninguém poder assinar como outra pessoa.
    const historicoAtual = Array.isArray(atual.diagnostico_historico) ? atual.diagnostico_historico : [];
    let diagnosticoHistoricoFinal = historicoAtual;
    if (b.novoDiagnostico && typeof b.novoDiagnostico.texto === "string" && b.novoDiagnostico.texto.trim()) {
      const autorEmail = (req.headers["x-admin-email"] || "").toString().trim().toLowerCase();
      diagnosticoHistoricoFinal = [
        ...historicoAtual,
        {
          data: new Date().toISOString().slice(0, 10),
          autorEmail,
          autorNome: nomeDoAdmin(autorEmail),
          texto: b.novoDiagnostico.texto.trim(),
        },
      ];
    }

    const rows = await sql`
      UPDATE fundos SET
        nome = ${valores.nome ?? atual.nome},
        tipo = ${valores.tipo ?? atual.tipo},
        instituicao = ${valores.instituicao ?? atual.instituicao},
        categoria = ${valores.categoria ?? atual.categoria},
        cnpj_ou_ticker = ${cnpjFinal},
        cnpj_cvm = ${sets.includes("cnpj_cvm") ? valores.cnpj_cvm : atual.cnpj_cvm},
        data_adicao = ${dataAdicaoFinal},
        preco_entrada = ${precoEntradaFinal},
        preco_atual = ${precoAtual},
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
