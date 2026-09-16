import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { fetchCadastro, normalizeCnpj } from "./_lib/cvm.js";
import { gravarCadastroCompleto } from "./_lib/cadastroCompleto.js";

// POST /api/sincronizar-cadastro — backfill do cadastro completo da CVM
// (adendo "estrutura-dados-completa") pros fundos/FIDCs já cadastrados com
// CNPJ. ETFs não têm cadastro na CVM (usam ticker, não CNPJ) e ficam de
// fora. Uma chamada só baixa o registro inteiro da CVM (~43MB, cacheado 6h)
// e distribui pra todos os fundos que precisam — bem mais barato que o
// backfill de histórico, que baixa mês a mês.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const fundos = await sql`SELECT id, cnpj_ou_ticker FROM fundos WHERE cnpj_ou_ticker IS NOT NULL AND tipo != 'ETF'`;
  const cadastro = await fetchCadastro();

  const relatorio = { atualizados: 0, semCadastro: [], erros: [] };

  for (const f of fundos) {
    try {
      const registro = cadastro.get(normalizeCnpj(f.cnpj_ou_ticker));
      if (!registro) {
        relatorio.semCadastro.push(f.id);
        continue;
      }
      await gravarCadastroCompleto(f.id, registro);
      relatorio.atualizados++;
    } catch (err) {
      relatorio.erros.push({ id: f.id, erro: err.message });
    }
  }

  res.status(200).json(relatorio);
}
