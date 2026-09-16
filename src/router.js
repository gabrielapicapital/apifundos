// Roteador mínimo (History API, sem framework) — só duas rotas: lista
// ("/") e detalhe de um fundo ("/fundos/{id}"). Cada fundo tem URL própria
// (compartilhável, funciona com voltar/avançar do navegador e recarregar a
// página) — ver adendo "pagina-detalhe-estrutura", seção 1.
let ouvinte = null;

export function parseRoute() {
  const m = window.location.pathname.match(/^\/fundos\/([^/]+)\/?$/);
  if (m) return { nome: "detalhe", id: decodeURIComponent(m[1]) };
  return { nome: "lista" };
}

export function initRouter(handler) {
  ouvinte = handler;
  window.addEventListener("popstate", () => ouvinte(parseRoute()));
  ouvinte(parseRoute());
}

export function navigateTo(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  ouvinte(parseRoute());
}

export function irParaFundo(id) {
  navigateTo(`/fundos/${encodeURIComponent(id)}`);
}

export function voltarParaLista() {
  navigateTo("/");
}
