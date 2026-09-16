import { sql } from "./db.js";
import { fetchCadastro, normalizeCnpj } from "./cvm.js";

// Grava (upsert) o cadastro completo de UM fundo em fundos_cadastro, a
// partir de um registro já buscado (ver fetchCadastro em cvm.js). Não
// inventa nada: campo que a CVM não publica pro fundo fica NULL.
export async function gravarCadastroCompleto(fundoId, registro) {
  await sql`
    INSERT INTO fundos_cadastro (
      fundo_id, codigo_cvm, data_registro, data_constituicao, primeira_cota,
      situacao, classificacao_cvm, classificacao_anbima, tipo_classe,
      indicador_desempenho, permite_offshore, forma_condominio,
      tributacao_longo_prazo, publico_alvo, exclusivo, administrador,
      gestor, patrimonio_liquido, data_patrimonio_liquido, atualizado_em
    ) VALUES (
      ${fundoId}, ${registro.codigoCvm}, ${registro.dataRegistro}, ${registro.dataConstituicao}, ${registro.primeiraCota},
      ${registro.situacao}, ${registro.classeCvm}, ${registro.classificacaoAnbima}, ${registro.tipoClasse},
      ${registro.indicadorDesempenho}, ${registro.permiteOffshore}, ${registro.formaCondominio},
      ${registro.tributacaoLongoPrazo}, ${registro.publicoAlvo}, ${registro.exclusivo}, ${registro.instituicao},
      ${registro.gestor}, ${registro.patrimonioLiquido}, ${registro.dataPatrimonioLiquido}, now()
    )
    ON CONFLICT (fundo_id) DO UPDATE SET
      codigo_cvm = EXCLUDED.codigo_cvm,
      data_registro = EXCLUDED.data_registro,
      data_constituicao = EXCLUDED.data_constituicao,
      primeira_cota = EXCLUDED.primeira_cota,
      situacao = EXCLUDED.situacao,
      classificacao_cvm = EXCLUDED.classificacao_cvm,
      classificacao_anbima = EXCLUDED.classificacao_anbima,
      tipo_classe = EXCLUDED.tipo_classe,
      indicador_desempenho = EXCLUDED.indicador_desempenho,
      permite_offshore = EXCLUDED.permite_offshore,
      forma_condominio = EXCLUDED.forma_condominio,
      tributacao_longo_prazo = EXCLUDED.tributacao_longo_prazo,
      publico_alvo = EXCLUDED.publico_alvo,
      exclusivo = EXCLUDED.exclusivo,
      administrador = EXCLUDED.administrador,
      gestor = EXCLUDED.gestor,
      patrimonio_liquido = EXCLUDED.patrimonio_liquido,
      data_patrimonio_liquido = EXCLUDED.data_patrimonio_liquido,
      atualizado_em = now()
  `;
}

// Busca+grava o cadastro completo de um fundo único, a partir do CNPJ. Usa
// fetchCadastro() (cache de 6h em memória) — se for chamado logo depois de
// outro fundo, provavelmente nem baixa o registro da CVM de novo.
export async function sincronizarCadastroFundo(fundoId, cnpjOuTicker) {
  const cadastro = await fetchCadastro();
  const registro = cadastro.get(normalizeCnpj(cnpjOuTicker));
  if (!registro) return false;
  await gravarCadastroCompleto(fundoId, registro);
  return true;
}
