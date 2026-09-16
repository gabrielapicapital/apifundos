import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { sincronizarCadastroFundo } from "./_lib/cadastroCompleto.js";

// POST /api/sincronizar-cadastro — backfill do cadastro completo da CVM
// (adendo "estrutura-dados-completa") pros fundos/FIDCs já cadastrados com
// CNPJ, incluindo número de cotistas (Informe Diário, ver cvm.js). ETFs não
// têm cadastro na CVM (usam ticker, não CNPJ) e ficam de fora. O registro da
// CVM e o mês corrente do Informe Diário ficam cacheados em memória (ver
// cvm.js), então baixam só uma vez mesmo com dezenas de fundos na lista.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const fundos = await sql`SELECT id, cnpj_ou_ticker FROM fundos WHERE cnpj_ou_ticker IS NOT NULL AND tipo != 'ETF'`;

  const relatorio = { atualizados: 0, semCadastro: [], erros: [] };

  for (const f of fundos) {
    try {
      const ok = await sincronizarCadastroFundo(f.id, f.cnpj_ou_ticker);
      if (ok) relatorio.atualizados++;
      else relatorio.semCadastro.push(f.id);
    } catch (err) {
      relatorio.erros.push({ id: f.id, erro: err.message });
    }
  }

  res.status(200).json(relatorio);
}
