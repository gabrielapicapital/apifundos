import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { normalizeCnpj } from "./_lib/cvm.js";
import { sincronizarCadastroFundo } from "./_lib/cadastroCompleto.js";
import { buscarComposicaoLote } from "./_lib/cda.js";

// POST /api/sincronizar-cadastro — backfill do cadastro completo da CVM
// (adendo "estrutura-dados-completa") pros fundos/FIDCs já cadastrados com
// CNPJ: seções 1+2 (cadastro + número de cotistas, via cadastroCompleto.js)
// e seção 6 (composição da carteira, via dataset CDA, cda.js). ETFs ficam de
// fora (não têm CNPJ nesses datasets). Um POST só faz as duas partes — eram
// dois endpoints separados, mas o Vercel Hobby tem limite de 12 funções por
// deployment, então foram unidos aqui.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const fundos = await sql`SELECT id, cnpj_ou_ticker FROM fundos WHERE cnpj_ou_ticker IS NOT NULL AND tipo != 'ETF'`;

  const relatorio = {
    cadastro: { atualizados: 0, semCadastro: [], erros: [] },
    composicao: { competencia: null, atualizados: 0, semDados: [], erros: [] },
  };

  for (const f of fundos) {
    try {
      const ok = await sincronizarCadastroFundo(f.id, f.cnpj_ou_ticker);
      if (ok) relatorio.cadastro.atualizados++;
      else relatorio.cadastro.semCadastro.push(f.id);
    } catch (err) {
      relatorio.cadastro.erros.push({ id: f.id, erro: err.message });
    }
  }

  const porDigits = new Map();
  for (const f of fundos) porDigits.set(normalizeCnpj(f.cnpj_ou_ticker), f.id);

  try {
    const { competencia, porCnpj } = await buscarComposicaoLote(new Set(porDigits.keys()));
    relatorio.composicao.competencia = competencia;

    for (const [digits, fundoId] of porDigits) {
      const dados = porCnpj.get(digits);
      if (!dados) {
        relatorio.composicao.semDados.push(fundoId);
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
        relatorio.composicao.atualizados++;
      } catch (err) {
        relatorio.composicao.erros.push({ id: fundoId, erro: err.message });
      }
    }
  } catch (err) {
    relatorio.composicao.erros.push({ id: null, erro: `Falha ao buscar CDA: ${err.message}` });
  }

  res.status(200).json(relatorio);
}
