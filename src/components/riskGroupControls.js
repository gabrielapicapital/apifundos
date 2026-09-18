// Controles do modo "Por grupo de risco" (adendo "grupos-de-risco",
// seções 3 e 4): o toggle "Por grupo de risco"/"Ranking por rentabilidade"
// e o painel "Grupos visíveis" (checkbox de cada um dos 20 grupos + "Sem
// grupo", com atalhos "Marcar todos"/"Limpar").
import { GRUPOS_RISCO_ORDEM, SEM_GRUPO } from "../lib/gruposRisco.js";
import { setFiltro } from "../state/store.js";

function renderFilterPanel(gruposVisiveis) {
  const panel = document.getElementById("groupFilterPanel");
  panel.innerHTML = `
    <div class="group-filter-actions">
      <button type="button" id="groupFilterAll">Marcar todos</button>
      <button type="button" id="groupFilterNone">Limpar</button>
    </div>
    ${GRUPOS_RISCO_ORDEM.map(
      (g) => `
        <label class="group-filter-option">
          <input type="checkbox" data-group="${g}" ${gruposVisiveis.has(g) ? "checked" : ""}>
          ${g === SEM_GRUPO ? "⚠ Sem grupo" : g}
        </label>`
    ).join("")}
  `;

  panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const novoSet = new Set(gruposVisiveis);
      if (cb.checked) novoSet.add(cb.dataset.group);
      else novoSet.delete(cb.dataset.group);
      setFiltro({ gruposVisiveis: novoSet });
    });
  });
  document.getElementById("groupFilterAll").addEventListener("click", () => {
    setFiltro({ gruposVisiveis: new Set(GRUPOS_RISCO_ORDEM) });
  });
  document.getElementById("groupFilterNone").addEventListener("click", () => {
    setFiltro({ gruposVisiveis: new Set() });
  });
}

export function init() {
  document.querySelectorAll("#viewModeToggle .view-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFiltro({ modoVisualizacao: btn.dataset.mode }));
  });

  document.getElementById("groupFilterBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("groupFilterPanel").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    const section = document.getElementById("groupFilterSection");
    if (section && !e.composedPath().includes(section)) {
      document.getElementById("groupFilterPanel").classList.add("hidden");
    }
  });
}

// Só re-renderiza o painel de checkboxes quando o conjunto de grupos
// visíveis de fato muda (não a cada render geral) — evita fechar o painel
// ou perder o estado de scroll toda vez que outra coisa na tela atualiza.
let ultimoGruposVisiveisRenderizado = null;

export function render(state) {
  const { modoVisualizacao, gruposVisiveis } = state.filtro;

  document.querySelectorAll("#viewModeToggle .view-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === modoVisualizacao);
  });

  const noModoGrupo = modoVisualizacao === "grupo";
  document.getElementById("groupFilterSection").style.display = noModoGrupo ? "" : "none";
  document.getElementById("sortSection").style.display = noModoGrupo ? "none" : "";

  const total = GRUPOS_RISCO_ORDEM.length;
  const n = gruposVisiveis.size;
  document.getElementById("groupFilterBtnLabel").textContent =
    n === total ? "Todos os grupos" : n === 0 ? "Nenhum grupo selecionado" : `${n} de ${total} grupos`;

  if (gruposVisiveis !== ultimoGruposVisiveisRenderizado) {
    ultimoGruposVisiveisRenderizado = gruposVisiveis;
    renderFilterPanel(gruposVisiveis);
  }
}
