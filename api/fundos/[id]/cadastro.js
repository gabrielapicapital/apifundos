import { sql } from "../../_lib/db.js";

// GET /api/fundos/{id}/cadastro — cadastro completo da CVM (adendo
// "estrutura-dados-completa"), gravado por sincronizar-cadastro.js ou pelo
// backfill de um fundo novo. Leitura pública, igual GET /api/fundos.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  const { id } = req.query;
  const rows = await sql`SELECT * FROM fundos_cadastro WHERE fundo_id = ${id}`;
  if (!rows.length) {
    res.status(200).json(null);
    return;
  }
  const r = rows[0];
  res.status(200).json({
    codigoCvm: r.codigo_cvm,
    dataRegistro: r.data_registro ? r.data_registro.toISOString().slice(0, 10) : null,
    dataConstituicao: r.data_constituicao ? r.data_constituicao.toISOString().slice(0, 10) : null,
    primeiraCota: r.primeira_cota ? r.primeira_cota.toISOString().slice(0, 10) : null,
    situacao: r.situacao,
    classificacaoCvm: r.classificacao_cvm,
    classificacaoAnbima: r.classificacao_anbima,
    tipoClasse: r.tipo_classe,
    indicadorDesempenho: r.indicador_desempenho,
    permiteOffshore: r.permite_offshore,
    formaCondominio: r.forma_condominio,
    tributacaoLongoPrazo: r.tributacao_longo_prazo,
    publicoAlvo: r.publico_alvo,
    exclusivo: r.exclusivo,
    administrador: r.administrador,
    gestor: r.gestor,
    patrimonioLiquido: r.patrimonio_liquido != null ? Number(r.patrimonio_liquido) : null,
    dataPatrimonioLiquido: r.data_patrimonio_liquido ? r.data_patrimonio_liquido.toISOString().slice(0, 10) : null,
    numeroCotistas: r.numero_cotistas,
    dataNumeroCotistas: r.data_numero_cotistas ? r.data_numero_cotistas.toISOString().slice(0, 10) : null,
    atualizadoEm: r.atualizado_em,
  });
}
