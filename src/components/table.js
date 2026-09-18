import { fmtPct, fmtBRL, fmtDateBR } from "../lib/format.js";
import { TIPO_LABELS } from "../config.js";
import { SEM_GRUPO } from "../lib/gruposRisco.js";
import { removeFundo } from "../state/store.js";
import { irParaFundo } from "../router.js";
import { ICON_TRIANGLE_ALERT, ICON_TRASH } from "../lib/icons.js";

function linhaFundo(f, editMode) {
  const tr = document.createElement("tr");
  tr.onclick = (e) => {
    if (e.target.closest(".remove-btn")) return;
    irParaFundo(f.id);
  };

  const retCell = f.pendenteCorrecao
    ? `<span class="flagbadge">${ICON_TRIANGLE_ALERT}<span>verificar entrada</span></span>`
    : `<span class="${f.rentabilidadePct >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(f.rentabilidadePct)}</span>`;

  tr.innerHTML = `
    <td data-label="Fundo">
      <div class="fundo-cell-inner">
        <div>
          <div class="fund-name">${f.nome}</div>
          <div class="fund-inst">${f.instituicao}</div>
        </div>
      </div>
    </td>
    <td data-label="Categoria"><span class="tag tag-tipo">${TIPO_LABELS[f.tipo] || f.tipo}</span><span class="tag">${f.categoria}</span></td>
    <td data-label="Adicionado em" class="muted-cell">${f.dataAdicao ? fmtDateBR(f.dataAdicao) : "-"}</td>
    <td data-label="Preço de entrada" class="num">${f.precoEntrada != null ? fmtBRL(f.precoEntrada) : "-"}</td>
    <td data-label="Preço atual" class="num">${fmtBRL(f.precoAtual)}</td>
    <td data-label="Rentabilidade" class="num">${retCell}</td>
    ${editMode ? `<td data-label="Ações" class="num"><button class="remove-btn" title="Remover fundo" data-remove="${f.id}">${ICON_TRASH}</button></td>` : ""}
  `;
  return tr;
}

function linhaGrupoHeader(grupo, quantidade, colSpan) {
  const tr = document.createElement("tr");
  tr.className = "group-header-tr";
  const isUngrouped = grupo === SEM_GRUPO;
  tr.innerHTML = `<td colspan="${colSpan}" class="group-header-row${isUngrouped ? " group-header-ungrouped" : ""}">${isUngrouped ? "⚠ " : ""}${grupo} <span class="group-header-count">${quantidade} fundo${quantidade === 1 ? "" : "s"}</span></td>`;
  return tr;
}

// Clicar num fundo navega pra página própria dele (adendo "pagina-detalhe-
// estrutura": "a linha não expande mais inline") — ver src/router.js e
// src/components/fundoDetalhe.js.
//
// `dados` é uma lista de fundos (modo "ranking") ou, no modo "Por grupo de
// risco" (adendo "grupos-de-risco"), um array de {grupo, fundos} já
// montado por state/store.js (fundosAgrupados()) — uma seção por grupo,
// com cabeçalho, na ordem de risco.
export function render(dados, state) {
  const { editMode } = state;
  const noModoGrupo = state.filtro.modoVisualizacao === "grupo";
  document.getElementById("actionsHeader").style.display = editMode ? "table-cell" : "none";
  document.getElementById("fundColHeader").textContent = state.filtro.tipo === "Todos" ? "Fundo" : state.filtro.tipo;

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const colSpan = editMode ? 7 : 6;
  const todosOsFundos = noModoGrupo ? dados.flatMap((secao) => secao.fundos) : dados;

  if (noModoGrupo) {
    dados.forEach(({ grupo, fundos }) => {
      tbody.appendChild(linhaGrupoHeader(grupo, fundos.length, colSpan));
      fundos.forEach((f) => tbody.appendChild(linhaFundo(f, editMode)));
    });
  } else {
    dados.forEach((f) => tbody.appendChild(linhaFundo(f, editMode)));
  }

  tbody.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      const fundo = todosOsFundos.find((f) => f.id === id);
      if (fundo && confirm(`Remover "${fundo.nome}" da lista de fundos indicados?`)) {
        try {
          await removeFundo(id);
        } catch (err) {
          alert(`Não foi possível remover: ${err.message}`);
        }
      }
    });
  });
}
