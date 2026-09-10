import { fmtPct } from "../lib/format.js";
import { comparador } from "../lib/analytics.js";

function compRows(arr, maxAbs) {
  if (!arr.length) return `<div class="comp-empty">Sem dados suficientes nesta seleção.</div>`;
  return arr
    .map(
      (f) => `
      <div class="comp-row">
        <div class="comp-name" title="${f.nome}">${f.nome}</div>
        <div class="comp-bar-track"><div class="comp-bar-fill ${f.rentabilidadePct >= 0 ? "pos" : "neg"}" style="width:${Math.min(100, (Math.abs(f.rentabilidadePct) / maxAbs) * 100)}%"></div></div>
        <div class="comp-value ${f.rentabilidadePct >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(f.rentabilidadePct)}</div>
      </div>
    `
    )
    .join("");
}

export function render(validos) {
  const { melhores, piores, maxAbs } = comparador(validos, 5);
  document.getElementById("comparator").innerHTML = `
    <div class="comparator-panel">
      <h4>Melhores desempenhos</h4>
      ${compRows(melhores, maxAbs)}
    </div>
    <div class="comparator-panel">
      <h4>Piores desempenhos</h4>
      ${compRows(piores, maxAbs)}
    </div>
  `;
}
