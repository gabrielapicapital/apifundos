// Configuração do app. Nada aqui deve conter segredos reais — só flags e listas
// públicas.

// A lista de administradores autorizados mudou pra src/lib/admins.js (adendo
// "diagnostico-asset-e-admins", seção 5) — é usada tanto pelo login no
// cliente (components/adminAuth.js) quanto pela conferência real no servidor
// (api/_lib/auth.js), que importa o mesmo arquivo. Ainda não é OAuth de
// verdade: confirma que o e-mail está na lista, não QUEM digitou. Ver README
// para o plano de migração para OAuth real.

export const WHATSAPP_NUMBER = "555181099336";
export const WHATSAPP_DISPLAY = "(51) 81099-336";

export const CATEGORIAS = [
  "Todos",
  "Renda Fixa Brasil",
  "Renda Variável Brasil",
  "Multimercados",
  "Global Renda Variável",
  "Global Renda Fixa",
];

export const TIPOS = ["Todos", "Fundo", "ETF", "FIDC"];
export const TIPO_LABELS = { Todos: "Todos", Fundo: "Fundos", ETF: "ETFs", FIDC: "FIDCs" };

export function assetWord(tipo, plural) {
  if (tipo === "ETF") return plural ? "ETFs" : "ETF";
  if (tipo === "FIDC") return plural ? "FIDCs" : "FIDC";
  return plural ? "fundos" : "fundo";
}
