import { fmtPct, fmtBRL, fmtDateBR, fmtNumber } from "../lib/format.js";
import { TIPO_LABELS } from "../config.js";
import { toggleExpanded, removeFundo, updateDiagnostico } from "../state/store.js";
import * as editFundModal from "./editFundModal.js";
import * as benchmarkChart from "./benchmarkChart.js";

function detailHtml(f, editMode) {
  return `
    ${editMode ? `<div style="margin-bottom:4px;"><button class="add-fund-btn" data-edit-fundo="${f.id}">Editar dados do fundo</button></div>` : ""}
    <div class="detail-section">
      <h4>Visão geral</h4>
      <div class="detail-grid">
        <div>Tipo<span>${TIPO_LABELS[f.tipo] || f.tipo}</span></div>
        <div>Gestora / Instituição<span>${f.instituicao}</span></div>
        <div>Categoria / Estratégia<span>${f.categoria}</span></div>
        <div>Patrimônio na posição<span>${fmtBRL(f.patrimonio)}</span></div>
      </div>
    </div>

    <div class="detail-section">
      <h4>Performance</h4>
      <div class="detail-grid">
        <div>Quantidade de cotas<span>${fmtNumber(f.quantidadeCotas)}</span></div>
        <div>Preço de entrada<span>${f.precoEntrada != null ? fmtBRL(f.precoEntrada) : "—"}</span></div>
        <div>Preço atual<span>${fmtBRL(f.precoAtual)}</span></div>
        <div>Rentabilidade desde a entrada<span>${
          f.pendenteCorrecao
            ? '<span class="pending">verificar entrada</span>'
            : `<span class="${f.rentabilidadePct >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(f.rentabilidadePct)}</span>`
        }</span></div>
      </div>
    </div>

    ${benchmarkChart.renderDetailHtml(f)}

    <div class="detail-section">
      <h4>Diagnóstico da equipe</h4>
      <div class="diagnostico-box">
        ${
          editMode
            ? `<textarea id="diag-${f.id}" placeholder="Pontos positivos e pontos de atenção sobre esse fundo...">${f.diagnostico || ""}</textarea>
               <button data-diag-save="${f.id}">Salvar diagnóstico</button>`
            : `<span>${f.diagnostico ? f.diagnostico : '<span class="pending">nenhum diagnóstico registrado ainda</span>'}</span>`
        }
      </div>
    </div>

    ${
      f.pendenteCorrecao
        ? `<div class="detail-note">Este fundo entrou com R$ 1.000 fixos e cota de entrada registrada incorretamente, sem refletir a cota real do dia. Precisa de recotação (manual ou automática, via CVM) para a rentabilidade fazer sentido.</div>`
        : ""
    }
  `;
}

export function render(lista, state) {
  const { editMode, expandedId } = state;
  document.getElementById("actionsHeader").style.display = editMode ? "table-cell" : "none";
  document.getElementById("fundColHeader").textContent = state.filtro.tipo === "Todos" ? "Fundo" : state.filtro.tipo;

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const colSpan = editMode ? 7 : 6;

  lista.forEach((f) => {
    const tr = document.createElement("tr");
    tr.onclick = (e) => {
      if (e.target.closest(".remove-btn")) return;
      toggleExpanded(f.id);
    };

    const retCell = f.pendenteCorrecao
      ? `<span class="flagbadge">⚠ verificar entrada</span>`
      : `<span class="${f.rentabilidadePct >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(f.rentabilidadePct)}</span>`;

    const isExpanded = expandedId === f.id;

    tr.innerHTML = `
      <td data-label="Fundo">
        <div class="fundo-cell-inner">
          <div>
            <div class="fund-name">${f.nome}</div>
            <div class="fund-inst">${f.instituicao}</div>
          </div>
          <svg class="expand-chevron${isExpanded ? " open" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </td>
      <td data-label="Categoria"><span class="tag tag-tipo">${TIPO_LABELS[f.tipo] || f.tipo}</span><span class="tag">${f.categoria}</span></td>
      <td data-label="Adicionado em" class="muted-cell">${f.dataAdicao ? fmtDateBR(f.dataAdicao) : "—"}</td>
      <td data-label="Preço de entrada" class="num">${f.precoEntrada != null ? fmtBRL(f.precoEntrada) : "—"}</td>
      <td data-label="Preço atual" class="num">${fmtBRL(f.precoAtual)}</td>
      <td data-label="Rentabilidade" class="num">${retCell}</td>
      ${editMode ? `<td data-label="Ações" class="num"><button class="remove-btn" title="Remover fundo" data-remove="${f.id}">✕</button></td>` : ""}
    `;
    tbody.appendChild(tr);

    if (expandedId === f.id) {
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      const detailTd = document.createElement("td");
      detailTd.colSpan = colSpan;
      detailTd.innerHTML = detailHtml(f, editMode);
      detailTr.appendChild(detailTd);
      tbody.appendChild(detailTr);
      benchmarkChart.initChart(f);
    }
  });

  tbody.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      const fundo = lista.find((f) => f.id === id);
      if (fundo && confirm(`Remover "${fundo.nome}" da lista de fundos indicados?`)) {
        removeFundo(id);
      }
    });
  });

  tbody.querySelectorAll("[data-diag-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.diagSave;
      const textarea = document.getElementById(`diag-${id}`);
      updateDiagnostico(id, textarea.value.trim());
    });
  });

  tbody.querySelectorAll("[data-edit-fundo]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fundo = lista.find((f) => f.id === btn.dataset.editFundo);
      if (fundo) editFundModal.open(fundo);
    });
  });
}
