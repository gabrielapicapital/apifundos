import { CATEGORIAS, TIPOS, TIPO_LABELS } from "../config.js";
import { setFiltro } from "../state/store.js";

export function init() {
  const typeTabsEl = document.getElementById("typeTabs");
  TIPOS.forEach((tipo) => {
    const tab = document.createElement("div");
    tab.className = "type-tab";
    tab.textContent = TIPO_LABELS[tipo];
    tab.dataset.tipo = tipo;
    tab.onclick = () => setFiltro({ tipo });
    typeTabsEl.appendChild(tab);
  });

  const chipRow = document.getElementById("chipRow");
  CATEGORIAS.forEach((cat) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = cat;
    chip.dataset.cat = cat;
    chip.onclick = () => setFiltro({ categoria: cat });
    chipRow.appendChild(chip);
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    setFiltro({ busca: e.target.value });
  });
  document.getElementById("sortSelect").addEventListener("change", (e) => {
    setFiltro({ ordenacao: e.target.value });
  });
}

export function render(state) {
  document.querySelectorAll(".type-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tipo === state.filtro.tipo);
  });
  document.querySelectorAll(".chip").forEach((el) => {
    el.classList.toggle("active", el.dataset.cat === state.filtro.categoria);
  });
}
