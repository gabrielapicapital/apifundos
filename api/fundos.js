import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";

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
    atualizadoEm: r.atualizado_em,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM fundos ORDER BY nome`;
    res.status(200).json(rows.map(rowParaFundo));
    return;
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    const b = req.body || {};
    if (!b.nome || !b.precoAtual || !b.quantidadeCotas) {
      res.status(400).json({ error: "Campos obrigatórios: nome, precoAtual, quantidadeCotas." });
      return;
    }
    const id = `${b.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const patrimonio = b.quantidadeCotas * b.precoAtual;
    const rows = await sql`
      INSERT INTO fundos (id, nome, tipo, instituicao, categoria, cnpj_ou_ticker, data_adicao, preco_entrada, preco_atual, quantidade_cotas, patrimonio, pendente_correcao, diagnostico)
      VALUES (${id}, ${b.nome}, ${b.tipo}, ${b.instituicao}, ${b.categoria}, ${b.cnpjOuTicker || null}, ${b.dataAdicao || null}, ${b.precoEntrada ?? null}, ${b.precoAtual}, ${b.quantidadeCotas}, ${patrimonio}, ${b.pendenteCorrecao ?? false}, ${b.diagnostico || null})
      RETURNING *
    `;
    if (b.precoEntrada != null && b.dataAdicao) {
      await sql`INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${id}, ${b.dataAdicao}, ${b.precoEntrada}) ON CONFLICT DO NOTHING`;
    }
    res.status(201).json(rowParaFundo(rows[0]));
    return;
  }

  res.status(405).json({ error: "Método não permitido" });
}
