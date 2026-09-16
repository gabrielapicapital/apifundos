import { sql } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

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
    diagnostico: r.diagnostico,
  };
}

// Colunas que um PATCH pode alterar, mapeando chave do JSON -> coluna SQL.
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
  diagnostico: "diagnostico",
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

    const rows = await sql`
      UPDATE fundos SET
        nome = ${valores.nome ?? atual.nome},
        tipo = ${valores.tipo ?? atual.tipo},
        instituicao = ${valores.instituicao ?? atual.instituicao},
        categoria = ${valores.categoria ?? atual.categoria},
        cnpj_ou_ticker = ${sets.includes("cnpj_ou_ticker") ? valores.cnpj_ou_ticker : atual.cnpj_ou_ticker},
        cnpj_cvm = ${sets.includes("cnpj_cvm") ? valores.cnpj_cvm : atual.cnpj_cvm},
        data_adicao = ${sets.includes("data_adicao") ? valores.data_adicao : atual.data_adicao},
        preco_entrada = ${sets.includes("preco_entrada") ? valores.preco_entrada : atual.preco_entrada},
        preco_atual = ${precoAtual},
        quantidade_cotas = ${quantidadeCotas},
        patrimonio = ${patrimonio},
        pendente_correcao = ${sets.includes("pendente_correcao") ? valores.pendente_correcao : atual.pendente_correcao},
        diagnostico = ${sets.includes("diagnostico") ? valores.diagnostico : atual.diagnostico},
        atualizado_em = now()
      WHERE id = ${id}
      RETURNING *
    `;

    const dataAdicaoFinal = sets.includes("data_adicao") ? valores.data_adicao : atual.data_adicao;
    const precoEntradaFinal = sets.includes("preco_entrada") ? valores.preco_entrada : atual.preco_entrada;
    if (precoEntradaFinal != null && dataAdicaoFinal) {
      await sql`
        INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${id}, ${dataAdicaoFinal}, ${precoEntradaFinal})
        ON CONFLICT (fundo_id, data) DO UPDATE SET preco = EXCLUDED.preco
      `;
    }

    res.status(200).json(rowParaFundo(rows[0]));
    return;
  }

  if (req.method === "GET") {
    const rows = await sql`SELECT data, preco FROM historico_precos WHERE fundo_id = ${id} ORDER BY data ASC`;
    res.status(200).json(rows.map((r) => ({ data: r.data.toISOString().slice(0, 10), preco: Number(r.preco) })));
    return;
  }

  res.status(405).json({ error: "Método não permitido" });
}
