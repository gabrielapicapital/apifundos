import { sql } from "../../_lib/db.js";

// GET /api/fundos/{id}/composicao — composição da carteira (dataset CDA da
// CVM, adendo "estrutura-dados-completa" seção 6), gravada por
// sincronizar-composicao.js. Leitura pública, igual GET /api/fundos.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  const { id } = req.query;
  const rows = await sql`SELECT * FROM fundos_composicao WHERE fundo_id = ${id}`;
  if (!rows.length) {
    res.status(200).json(null);
    return;
  }
  const r = rows[0];
  res.status(200).json({
    competencia: r.competencia ? r.competencia.toISOString().slice(0, 10) : null,
    totalGeral: r.total_geral != null ? Number(r.total_geral) : null,
    blocos: r.blocos,
    atualizadoEm: r.atualizado_em,
  });
}
