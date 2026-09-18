import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";
import { SEM_GRUPO } from "../src/lib/gruposRisco.js";
import { aprenderGrupoPorCnpj } from "./_lib/gruposRiscoDb.js";

function rowParaFundo(r) {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    instituicao: r.instituicao,
    categoria: r.categoria,
    grupoRisco: r.grupo_risco || SEM_GRUPO,
    cnpjOuTicker: r.cnpj_ou_ticker,
    cnpjCvm: r.cnpj_cvm,
    dataAdicao: r.data_adicao ? r.data_adicao.toISOString().slice(0, 10) : null,
    precoEntrada: r.preco_entrada != null ? Number(r.preco_entrada) : null,
    precoAtual: Number(r.preco_atual),
    dataPrecoAtual: r.data_preco_atual ? r.data_preco_atual.toISOString().slice(0, 10) : null,
    quantidadeCotas: Number(r.quantidade_cotas),
    patrimonio: Number(r.patrimonio),
    pendenteCorrecao: r.pendente_correcao,
    diagnosticoHistorico: Array.isArray(r.diagnostico_historico) ? r.diagnostico_historico : [],
    atualizadoEm: r.atualizado_em,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Sugestão automática de grupo de risco ao digitar um CNPJ conhecido
    // (adendo "grupos-de-risco", seção 5) — leitura rápida e pública, sem
    // rodar pelo mesmo endpoint que busca cadastro/cota na CVM (esse é
    // instantâneo, direto do banco; dispara na perda de foco do campo
    // CNPJ, não pode esperar uma chamada de rede pra CVM). Dividido aqui em
    // vez de um arquivo de rota novo pelo limite de funções da Vercel
    // (Hobby), ver comentário em api/sincronizar-cadastro.js.
    if (typeof req.query.grupoPorCnpj === "string") {
      const digits = req.query.grupoPorCnpj.replace(/\D/g, "");
      if (digits.length !== 14) {
        res.status(200).json({ grupoRisco: null });
        return;
      }
      const rows = await sql`SELECT grupo_risco FROM cnpj_grupo_risco WHERE cnpj_digits = ${digits}`;
      res.status(200).json({ grupoRisco: rows[0]?.grupo_risco ?? null });
      return;
    }

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
    const grupoRisco = b.grupoRisco || SEM_GRUPO;
    const rows = await sql`
      INSERT INTO fundos (id, nome, tipo, instituicao, categoria, grupo_risco, cnpj_ou_ticker, data_adicao, preco_entrada, preco_atual, quantidade_cotas, patrimonio, pendente_correcao)
      VALUES (${id}, ${b.nome}, ${b.tipo}, ${b.instituicao}, ${b.categoria}, ${grupoRisco}, ${b.cnpjOuTicker || null}, ${b.dataAdicao || null}, ${b.precoEntrada ?? null}, ${b.precoAtual}, ${b.quantidadeCotas}, ${patrimonio}, ${b.pendenteCorrecao ?? false})
      RETURNING *
    `;
    if (b.precoEntrada != null && b.dataAdicao) {
      await sql`INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${id}, ${b.dataAdicao}, ${b.precoEntrada}) ON CONFLICT DO NOTHING`;
    }
    await aprenderGrupoPorCnpj(b.cnpjOuTicker, grupoRisco);
    res.status(201).json(rowParaFundo(rows[0]));
    return;
  }

  res.status(405).json({ error: "Método não permitido" });
}
