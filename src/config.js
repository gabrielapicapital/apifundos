// Configuração do app. Nada aqui deve conter segredos reais — só flags e listas
// públicas (allowlist de e-mails não é segredo em si; a validação real é feita
// pelo provedor OAuth, ver README > "Autenticação de administradores").

// TODO(admin): a especificação (seção 3) pede login restrito por e-mail
// (ex: Google OAuth) para os 2 administradores. Isso exige um backend (para
// validar o token do provedor OAuth) que ainda não existe nesta fase
// "frontend primeiro". Por enquanto, o app pede o e-mail e confere contra esta
// lista *apenas no navegador* — ou seja, NÃO é autenticação de verdade
// (qualquer pessoa pode digitar um e-mail da lista). Ver README para o plano
// de migração para OAuth real.
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

export const STORAGE_KEY = "api-capital-fundos-v1";
