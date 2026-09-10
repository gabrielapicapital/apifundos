import { fmtPct } from "../lib/format.js";
import { resumo } from "../lib/analytics.js";
import { TIPO_LABELS, assetWord } from "../config.js";

export function render(lista, tipoAtivo) {
  const effectiveType = tipoAtivo === "Todos" ? "Fundo" : tipoAtivo;
  const labelPlural = tipoAtivo === "Todos" ? "Fundos" : TIPO_LABELS[tipoAtivo];
  const flaggedTotalCount = lista.filter((f) => f.pendenteCorrecao).length;
  const banner = document.getElementById("banner");
  // O aviso do topo conta os pendentes na base inteira (não só na visão
  // filtrada) para o time nunca perder de vista o tamanho do problema.
  if (flaggedTotalCount > 0) {
    banner.style.display = "flex";
    banner.innerHTML = `<span>⚠️</span><span><strong>${flaggedTotalCount} fundo${flaggedTotalCount > 1 ? "s" : ""} com preço de entrada pendente de correção.</strong>
      Foram herdados da carteira antiga com um aporte fixo de R$ 1.000, sem registrar a cota real do dia, então a
      rentabilidade não pode ser calculada corretamente ainda. Assim que a cota de entrada for recotada (seção 7 da
      especificação), o cálculo passa a valer normalmente.</span>`;
  } else {
    banner.style.display = "none";
  }

  document.getElementById("countLabel").textContent =
    `${lista.length} ${assetWord(effectiveType, lista.length !== 1)} encontrado${lista.length === 1 ? "" : "s"}`;

  const { rentabilidadeMedia, positivos, negativos, pendentes } = resumo(lista);

  document.getElementById("summaryCards").innerHTML = `
    <div class="summary-card"><div class="label">${labelPlural} na visão atual</div><div class="value">${lista.length}</div></div>
    <div class="summary-card"><div class="label">Rentabilidade média</div><div class="value ${rentabilidadeMedia === null ? "" : rentabilidadeMedia >= 0 ? "pos" : "neg"}">${rentabilidadeMedia !== null ? fmtPct(rentabilidadeMedia) : "—"}</div></div>
    <div class="summary-card"><div class="label">Positivos / negativos</div><div class="value"><span class="pos">${positivos}</span> / <span class="neg">${negativos}</span></div></div>
    <div class="summary-card"><div class="label">Pendentes de correção</div><div class="value ${pendentes > 0 ? "amber" : ""}">${pendentes}</div></div>
  `;
}
