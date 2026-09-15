// Configuração do app. Nada aqui deve conter segredos reais — só flags e listas
// públicas (allowlist de e-mails não é segredo em si; a validação real é feita
// pelo provedor OAuth, ver README > "Autenticação de administradores").

// TODO(admin): a especificação (seção 3) pede login restrito por e-mail
// (ex: Google OAuth) para os 2 administradores. Isso ainda não existe: o que
// há hoje são DUAS conferências por e-mail, nenhuma delas é OAuth de
// verdade —
//   1. Esta lista, conferida só no navegador (rápida, mas qualquer pessoa
//      pode digitar um e-mail da lista e "passar" por ela).
//   2. api/_lib/auth.js, que confere de novo no servidor contra a variável
//      de ambiente ADMIN_EMAILS antes de qualquer escrita no banco — essa
//      é a que realmente protege os dados, mas ainda não confirma QUEM
//      está digitando o e-mail.
// Ver README para o plano de migração para OAuth real.
export const ADMIN_EMAILS_PLACEHOLDER = [
  // "consultor.admin1@apicapital.com.br",
  // "consultor.admin2@apicapital.com.br",
];

// Permite configurar em tempo de execução sem reeditar o código-fonte:
// crie um arquivo public/admin-emails.local.json (git-ignorado) com um array
// de e-mails, ex: ["fulano@apicapital.com.br", "ciclana@apicapital.com.br"]
// Caminho relativo à raiz do site (mesma base usada por index.html), não ao
// módulo que o importa — ver uso em components/adminAuth.js.
export const ADMIN_EMAILS_LOCAL_CONFIG_URL = "./public/admin-emails.local.json";

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
