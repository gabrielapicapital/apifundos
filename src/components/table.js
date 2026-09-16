import { fmtPct, fmtBRL, fmtDateBR } from "../lib/format.js";
import { TIPO_LABELS } from "../config.js";
import { removeFundo } from "../state/store.js";
import { irParaFundo } from "../router.js";
import { ICON_TRIANGLE_ALERT, ICON_TRASH } from "../lib/icons.js";

// Clicar num fundo navega pra página própria dele (adendo "pagina-detalhe-
// estrutura": "a linha não expande mais inline") — ver src/router.js e
// src/components/fundoDetalhe.js.
export function render(lista, state) {
  const { editMode } = state;
  document.getElementById("actionsHeader").style.display = editMode ? "table-cell" : "none";
  document.getElementById("fundColHeader").textContent = state.filtro.tipo === "Todos" ? "Fundo" : state.filtro.tipo;

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  lista.forEach((f) => {
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
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      const fundo = lista.find((f) => f.id === id);
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
