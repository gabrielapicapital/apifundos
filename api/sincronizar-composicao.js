import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { normalizeCnpj } from "./_lib/cvm.js";
import { buscarComposicaoLote } from "./_lib/cda.js";

// POST /api/sincronizar-composicao — preenche a composição da carteira
// (adendo "estrutura-dados-completa", seção 6) pros fundos/FIDCs já
// cadastrados com CNPJ, a partir do dataset CDA da CVM. ETFs ficam de fora
// (não têm CNPJ nesse dataset — replicam um índice, não uma carteira
// discricionária). Um download só (~20-30MB) cobre todos os fundos de uma
// vez, ver buscarComposicaoLote em cda.js.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const fundos = await sql`SELECT id, cnpj_ou_ticker FROM fundos WHERE cnpj_ou_ticker IS NOT NULL AND tipo != 'ETF'`;
  const porDigits = new Map();
  for (const f of fundos) porDigits.set(normalizeCnpj(f.cnpj_ou_ticker), f.id);

  const relatorio = { competencia: null, atualizados: 0, semDados: [], erros: [] };

  try {
    const { competencia, porCnpj } = await buscarComposicaoLote(new Set(porDigits.keys()));
    relatorio.competencia = competencia;

    for (const [digits, fundoId] of porDigits) {
      const dados = porCnpj.get(digits);
      if (!dados) {
        relatorio.semDados.push(fundoId);
        continue;
      }
      try {
        await sql`
          INSERT INTO fundos_composicao (fundo_id, competencia, total_geral, blocos, atualizado_em)
          VALUES (${fundoId}, ${dados.competencia}, ${dados.totalGeral}, ${JSON.stringify(dados.blocos)}, now())
          ON CONFLICT (fundo_id) DO UPDATE SET
            competencia = EXCLUDED.competencia,
            total_geral = EXCLUDED.total_geral,
            blocos = EXCLUDED.blocos,
            atualizado_em = now()
        `;
        relatorio.atualizados++;
      } catch (err) {
        relatorio.erros.push({ id: fundoId, erro: err.message });
      }
    }
  } catch (err) {
    res.status(500).json({ error: `Falha ao buscar CDA: ${err.message}` });
    return;
  }

  res.status(200).json(relatorio);
}
