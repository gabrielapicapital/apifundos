import { sql } from "../_lib/db.js";
import { buscarCotaMaisRecente } from "../_lib/cvm.js";
import { buscarCotacaoEtf } from "../_lib/mercado.js";
import { buscarCotaFidcMaisRecente } from "../_lib/cvmFidc.js";

// Vercel chama essa rota sozinha, no horário definido em vercel.json
// ("crons"), enviando Authorization: Bearer <CRON_SECRET> automaticamente
// quando essa variável de ambiente existe — é a única proteção contra
// alguém de fora chamar essa rota manualmente e forçar uma atualização.
function autorizado(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (!autorizado(req)) {
    res.status(401).json({ error: "Não autorizado." });
    return;
  }

  const fundos = await sql`SELECT id, tipo, cnpj_ou_ticker, quantidade_cotas FROM fundos WHERE cnpj_ou_ticker IS NOT NULL`;

  const resultado = { atualizados: 0, semDado: [], erros: [] };

  for (const f of fundos) {
    try {
      let cota = null;
      let data = null;

      if (f.tipo === "ETF") {
        const r = await buscarCotacaoEtf(f.cnpj_ou_ticker);
        if (r) {
          cota = r.preco;
          data = r.data;
        }
      } else {
        const r = await buscarCotaMaisRecente(f.cnpj_ou_ticker);
        if (r) {
          cota = r.cota;
          data = r.data;
        } else if (f.tipo === "FIDC") {
          // FIDC não tem Informe Diário — último recurso é o Informe Mensal
          // (atraso de vários meses, ver api/_lib/cvmFidc.js).
          const rMensal = await buscarCotaFidcMaisRecente(f.cnpj_ou_ticker);
          if (rMensal) {
            cota = rMensal.cota;
            data = rMensal.data;
          }
        }
      }

      if (cota == null) {
        resultado.semDado.push(f.id);
        continue;
      }

      const patrimonio = Number(f.quantidade_cotas) * cota;
      await sql`
        UPDATE fundos SET preco_atual = ${cota}, data_preco_atual = ${data}, patrimonio = ${patrimonio}, atualizado_em = now()
        WHERE id = ${f.id}
      `;
      await sql`
        INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${f.id}, ${data}, ${cota})
        ON CONFLICT (fundo_id, data) DO UPDATE SET preco = EXCLUDED.preco
      `;
      resultado.atualizados++;
    } catch (err) {
      resultado.erros.push({ id: f.id, erro: err.message });
    }
  }

  res.status(200).json(resultado);
}
