import { sql } from "./db.js";
import { SEM_GRUPO } from "../../src/lib/gruposRisco.js";

// Grava/atualiza a "memória" de CNPJ -> grupo de risco (adendo "grupos-de-
// risco", seção 5) sempre que um fundo é classificado com um grupo de
// verdade — é assim que a tabela fica editável sem precisar de deploy: o
// próprio uso normal do app (adicionar/editar um fundo com CNPJ conhecido)
// a mantém atualizada, sem precisar de uma tela de administração separada.
// Usada tanto ao criar um fundo (api/fundos.js) quanto ao editar um já
// existente (api/fundos/[id].js).
export async function aprenderGrupoPorCnpj(cnpjOuTicker, grupoRisco) {
  if (!cnpjOuTicker || !grupoRisco || grupoRisco === SEM_GRUPO) return;
  const digits = cnpjOuTicker.replace(/\D/g, "");
  if (digits.length !== 14) return;
  await sql`
    INSERT INTO cnpj_grupo_risco (cnpj_digits, grupo_risco, atualizado_em) VALUES (${digits}, ${grupoRisco}, now())
    ON CONFLICT (cnpj_digits) DO UPDATE SET grupo_risco = EXCLUDED.grupo_risco, atualizado_em = now()
  `;
}
