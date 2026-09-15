import { sql } from "./_lib/db.js";

// GET /api/benchmark?nome=CDI — série histórica de um benchmark (CDI,
// Ibovespa ou S&P 500), gravada pelo backfill/rotina. Não precisa de admin:
// é leitura, igual GET /api/fundos.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  const nome = req.query.nome;
  if (!nome) {
    res.status(400).json({ error: "Informe ?nome=CDI|Ibovespa|S&P 500" });
    return;
  }
  const rows = await sql`SELECT data, valor FROM benchmark_historico WHERE benchmark = ${nome} ORDER BY data ASC`;
  res.status(200).json(rows.map((r) => ({ data: r.data.toISOString().slice(0, 10), valor: Number(r.valor) })));
}
