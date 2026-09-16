import { subscribe, fundosFiltrados } from "./state/store.js";
import * as tabsChips from "./components/tabsChips.js";
import * as summary from "./components/summary.js";
import * as comparator from "./components/comparator.js";
import * as table from "./components/table.js";
import * as adminAuth from "./components/adminAuth.js";
import * as addFundModal from "./components/addFundModal.js";
import * as editFundModal from "./components/editFundModal.js";
import * as misc from "./components/misc.js";
import * as fundoDetalhe from "./components/fundoDetalhe.js";
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
    document.getElementById("comparator").innerHTML = "";
    document.getElementById("tableBody").innerHTML = "";
    document.getElementById("countLabel").textContent = "";
    return;
  }

  if (rotaAtual.nome === "detalhe") {
    // Navegação direta por link (ex: recarregar a página): os fundos podem
    // ainda não estar carregados na primeira notificação — tenta de novo
    // assim que carregarem.
    if (fundoDetalhe.fundoCarregadoId() !== rotaAtual.id) fundoDetalhe.render(rotaAtual.id);
    return;
  }

  tabsChips.render(state);
  adminAuth.render(state);

  const lista = fundosFiltrados();
  summary.render(lista, state.filtro.tipo);
  comparator.render(lista.filter((f) => !f.pendenteCorrecao));
  table.render(lista, state);
}

export async function initApp() {
  tabsChips.init();
  await adminAuth.init();
  addFundModal.init();
  editFundModal.init();
  misc.init();

  subscribe(renderAll);
  initRouter(aplicarRota);
}
