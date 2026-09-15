import { subscribe, fundosFiltrados } from "./state/store.js";
import * as tabsChips from "./components/tabsChips.js";
import * as summary from "./components/summary.js";
import * as comparator from "./components/comparator.js";
import * as table from "./components/table.js";
import * as adminAuth from "./components/adminAuth.js";
import * as addFundModal from "./components/addFundModal.js";
import * as editFundModal from "./components/editFundModal.js";
import * as misc from "./components/misc.js";

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
}
