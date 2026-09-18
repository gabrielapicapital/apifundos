import { subscribe, fundosFiltrados, fundosAgrupados, fundosNosGruposVisiveis } from "./state/store.js";
import * as tabsChips from "./components/tabsChips.js";
import * as summary from "./components/summary.js";
import * as table from "./components/table.js";
import * as adminAuth from "./components/adminAuth.js";
import * as addFundModal from "./components/addFundModal.js";
import * as editFundModal from "./components/editFundModal.js";
import * as misc from "./components/misc.js";
import * as fundoDetalhe from "./components/fundoDetalhe.js";
import * as riskGroupControls from "./components/riskGroupControls.js";
import { initRouter } from "./router.js";

// Cada fundo tem sua própria rota/URL ("/fundos/{id}") — ver adendo
// "pagina-detalhe-estrutura", seção 1. Só duas "telas": lista (comportamento
// de sempre) e detalhe (nova página, própria, sem a sidebar).
let rotaAtual = { nome: "lista" };

function aplicarRota(rota) {
  rotaAtual = rota;
  const listaView = document.getElementById("listaView");
  const detalheView = document.getElementById("detalheView");
  if (rota.nome === "detalhe") {
    listaView.classList.add("hidden");
    detalheView.classList.remove("hidden");
    if (fundoDetalhe.fundoCarregadoId() !== rota.id) fundoDetalhe.render(rota.id);
  } else {
    detalheView.classList.add("hidden");
    listaView.classList.remove("hidden");
  }
}

function renderAll(state) {
  if (!state.loaded) return;

  if (state.loadError) {
    document.getElementById("banner").style.display = "flex";
    document.getElementById("banner").innerHTML =
      `<span><strong>Não foi possível carregar os fundos do servidor.</strong> ${state.loadError} — recarregue a página em alguns instantes. Se persistir, avise um administrador.</span>`;
    document.getElementById("summaryCards").innerHTML = "";
    document.getElementById("tableBody").innerHTML = "";
    document.getElementById("countLabel").textContent = "";
    return;
  }

  if (rotaAtual.nome === "detalhe") {
    // Navegação direta por link (ex: recarregar a página): os fundos podem
    // ainda não estar carregados na primeira notificação — tenta de novo
    // assim que carregarem. Já carregado: só precisa refletir o que mudou
    // no modo administrador (login/logout pelo botão da própria página de
    // detalhe, ver fundoDetalhe.js) — sem refazer o fetch.
    if (fundoDetalhe.fundoCarregadoId() !== rotaAtual.id) fundoDetalhe.render(rotaAtual.id);
    else fundoDetalhe.atualizarEditMode();
    return;
  }

  tabsChips.render(state);
  adminAuth.render(state);
  riskGroupControls.render(state);

  // Adendo "grupos-de-risco": no modo "Por grupo de risco", os cartões de
  // resumo refletem só os grupos marcados como visíveis (seção 4), e a
  // tabela vira seções por grupo em vez de uma lista só (seção 3).
  const noModoGrupo = state.filtro.modoVisualizacao === "grupo";
  const listaPlana = noModoGrupo ? fundosNosGruposVisiveis() : fundosFiltrados();
  summary.render(listaPlana, state.filtro.tipo);
  table.render(noModoGrupo ? fundosAgrupados() : listaPlana, state);
}

export async function initApp() {
  tabsChips.init();
  await adminAuth.init();
  addFundModal.init();
  editFundModal.init();
  misc.init();
  riskGroupControls.init();

  subscribe(renderAll);
  initRouter(aplicarRota);
}
