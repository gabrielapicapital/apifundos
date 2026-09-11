import { fmtPct } from "../lib/format.js";
import {
  BENCHMARK_POR_CATEGORIA,
  gerarSerieIlustrativa,
  gerarSerieBenchmarkIlustrativa,
  gerarBenchmarkPorPeriodo,
  abreviarNome,
} from "../lib/illustrative.js";

const chartInstances = {};

export function renderDetailHtml(f) {
  const b = gerarBenchmarkPorPeriodo(f);
  const hasCdiPct = b.benchmark === "CDI";

  return `
    <div class="detail-section">
      <h4>Evolução da rentabilidade vs. benchmark<span class="bench-illustrative-tag">exemplo ilustrativo</span></h4>
      <div class="evolucao-chart-wrap">
        <div class="evolucao-chart-canvas-box"><canvas id="chart-${f.id}"></canvas></div>
      </div>
      ${
        !f.dataAdicao
          ? '<div class="bench-fx-note">Período de exemplo (8 meses): este fundo ainda não tem data de adição registrada, então o gráfico não começa na data real de entrada.</div>'
          : ""
      }
    </div>

    <div class="detail-section">
      <h4>Rentabilidade por período vs. benchmark<span class="bench-illustrative-tag">exemplo ilustrativo</span></h4>
      <table class="bench-table">
        <thead>
          <tr>
            <th>Período</th>
            <th>Fundo</th>
            <th>${b.benchmark}</th>
            <th>Diferença</th>
            ${hasCdiPct ? "<th>% do CDI</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${b.rows
            .map(
              (r) => `
            <tr>
              <td>${r.label}</td>
              <td class="${r.fundo >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(r.fundo)}</td>
              <td>${fmtPct(r.bench)}</td>
              <td class="${r.diff >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(r.diff)}</td>
              ${hasCdiPct ? `<td>${r.pctCdi.toFixed(0)}%</td>` : ""}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      ${b.benchmark === "S&P 500" ? '<div class="bench-fx-note">S&P 500 em USD, sem ajuste cambial: o fundo é cotado em reais.</div>' : ""}
    </div>
  `;
}

export function initChart(f) {
  const canvas = document.getElementById(`chart-${f.id}`);
  if (!canvas || typeof Chart === "undefined") return;
  if (chartInstances[f.id]) chartInstances[f.id].destroy();

  const benchmarkName = BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI";
  const { labels, values } = gerarSerieIlustrativa(f);
  const benchValues = gerarSerieBenchmarkIlustrativa(f.nome, values.length);
  const fundLabel = abreviarNome(f.nome);

  chartInstances[f.id] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: fundLabel,
          data: values,
          borderColor: "#0D2A54",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#0D2A54",
          tension: 0.25,
        },
        {
          label: benchmarkName,
          data: benchValues,
          borderColor: "#AA7D41",
          backgroundColor: "transparent",
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#AA7D41",
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "start",
          labels: { color: "rgba(23,23,23,0.5)", boxWidth: 14, boxHeight: 2, font: { size: 12, family: "Inter" }, usePointStyle: false },
        },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#171717",
          bodyColor: "#171717",
          borderColor: "#E6E7E8",
          borderWidth: 1,
          padding: 10,
          titleFont: { family: "Inter" },
          bodyFont: { family: "Inter" },
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2).replace(".", ",")}%`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "rgba(23,23,23,0.5)", font: { size: 11, family: "Inter" } } },
        y: {
          grid: { color: "#E6E7E8" },
          ticks: { color: "rgba(23,23,23,0.5)", font: { size: 11, family: "Inter" }, callback: (v) => v + "%" },
        },
      },
    },
  });
}
