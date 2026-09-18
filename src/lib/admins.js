// Lista fixa de administradores autorizados (adendo "diagnostico-asset-e-
// admins", seção 5) — ÚNICA fonte de verdade pro app inteiro: quem pode
// entrar no modo administrador (client: components/adminAuth.js; servidor:
// api/_lib/auth.js, que importa este mesmo arquivo) e o nome usado pra
// identificar autoria em qualquer registro do app (ex: histórico de
// diagnóstico do fundo, ver components/fundoDetalhe.js). Pra adicionar ou
// remover alguém, editar só aqui — nenhum outro lugar do código guarda essa
// lista.
//
// Fica em src/ (não em api/_lib/) de propósito: esse projeto não tem etapa
// de build nem bundler (HTML/CSS/JS puro, ver README), então um módulo em
// api/ não é alcançável pelo navegador (a pasta api/ é só funções da
// Vercel). Ficando em src/, o cliente importa direto (arquivo estático) e o
// servidor também consegue importar (o bundler de funções da Vercel resolve
// imports relativos pra qualquer lugar do repositório).
export const ADMINS = {
  "gabriel.teixeira@apicapital.com.br": "Gabriel Teixeira",
  "heitor.oro@apicapital.com.br": "Heitor Oro",
  "guilherme.barbosa@apicapital.com.br": "Guilherme Barbosa",
  "hiran.cruz@apicapital.com.br": "Hiran Cruz",
  "gabriel.diefenbach@apicapital.com.br": "Gabriel Diefenbach",
};

function normalizarEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}

export function isAdminEmail(email) {
  return Object.prototype.hasOwnProperty.call(ADMINS, normalizarEmail(email));
}

export function nomeDoAdmin(email) {
  return ADMINS[normalizarEmail(email)] || null;
}
