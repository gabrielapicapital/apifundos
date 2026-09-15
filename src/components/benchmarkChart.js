import { fmtPct } from "../lib/format.js";
import {
  BENCHMARK_POR_CATEGORIA as BENCH_ILUSTRATIVO,
  gerarSerieIlustrativa,
  gerarSerieBenchmarkIlustrativa,
  gerarBenchmarkPorPeriodo,
  abreviarNome,
} from "../lib/illustrative.js";
import { BENCHMARK_POR_CATEGORIA, calcularPeriodos } from "../lib/periodos.js";
import { buscarHistorico, buscarBenchmark } from "../state/store.js";

const chartInstances = {};

export function renderDetailHtml(f) {
  return `
    <div class="detail-section">
      <h4 id="chart-titulo-${f.id}">Evolução da rentabilidade vs. benchmark</h4>
      <div class="evolucao-chart-wrap">
        <div class="evolucao-chart-canvas-box"><canvas id="chart-${f.id}"></canvas></div>
      </div>
      <div id="chart-nota-${f.id}"></div>
    </div>

    <div class="detail-section">
      <h4 id="periodo-titulo-${f.id}">Rentabilidade por período vs. benchmark</h4>
      <div id="periodo-conteudo-${f.id}"><span class="pending">carregando...</span></div>
    </div>
  `;
}

function tabelaPeriodoHtml(dados) {
  const hasCdiPct = dados.benchmark === "CDI";
  return `
    <table class="bench-table">
      <thead>
        <tr>
          <th>Período</th>
          <th>Fundo</th>
          <th>${dados.benchmark}</th>
          <th>Diferença</th>
          ${hasCdiPct ? "<th>% do CDI</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${dados.rows
          .map((r) =>
            r.insuficiente
              ? `<tr><td>${r.label}</td><td colspan="${hasCdiPct ? 4 : 3}"><span class="pending">sem histórico suficiente</span></td></tr>`
              : `
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
    ${dados.benchmark === "S&P 500" ? '<div class="bench-fx-note">S&P 500 em USD, sem ajuste cambial: o fundo é cotado em reais.</div>' : ""}
  `;
}

function desenharChart(f, labels, valoresFundo, valoresBench, nomeFundo, nomeBench) {
  const canvas = document.getElementById(`chart-${f.id}`);
  if (!canvas || typeof Chart === "undefined") return;
  if (chartInstances[f.id]) chartInstances[f.id].destroy();

  chartInstances[f.id] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: nomeFundo,
          data: valoresFundo,
          borderColor: "#0D2A54",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#0D2A54",
          tension: 0.25,
        },
        {
          label: nomeBench,
          data: valoresBench,
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
        x: { grid: { display: false }, ticks: { color: "rgba(23,23,23,0.5)", font: { size: 11, family: "Inter" }, maxTicksLimit: 10 } },
        y: {
          grid: { color: "#E6E7E8" },
          ticks: { color: "rgba(23,23,23,0.5)", font: { size: 11, family: "Inter" }, callback: (v) => v + "%" },
        },
      },
    },
  });
}

// Quantidade mínima de pontos reais pra considerar que já dá pra mostrar
// gráfico/tabela reais em vez do exemplo ilustrativo — abaixo disso a linha
// fica vazia demais pra significar alguma coisa (ver README).
const MINIMO_PONTOS_REAIS = 5;

async function renderizarReal(f, historicoFundo, historicoBench, benchmarkNome) {
  const dados = calcularPeriodos(historicoFundo, historicoBench, benchmarkNome);
  if (!dados) return false;

  document.getElementById("chart-titulo-" + f.id).textContent = "Evolução da rentabilidade vs. benchmark";
  document.getElementById("periodo-titulo-" + f.id).textContent = "Rentabilidade por período vs. benchmark";
  document.getElementById("periodo-conteudo-" + f.id).innerHTML = tabelaPeriodoHtml(dados);

  const base = dados.fundoSerie[0].valor;
  const baseBench = dados.benchSerie[0].valor;
  const labels = dados.fundoSerie.map((p) => p.data.slice(5).split("-").reverse().join("/"));
  const valoresFundo = dados.fundoSerie.map((p) => ((p.valor - base) / base) * 100);
  // Reamostra o benchmark nas mesmas datas do fundo (o mais próximo <= data).
  let j = 0;
  const valoresBench = dados.fundoSerie.map((p) => {
    while (j < dados.benchSerie.length - 1 && dados.benchSerie[j + 1].data <= p.data) j++;
    return ((dados.benchSerie[j].valor - baseBench) / baseBench) * 100;
  });

  desenharChart(f, labels, valoresFundo, valoresBench, abreviarNome(f.nome), benchmarkNome);

  const notaEl = document.getElementById("chart-nota-" + f.id);
  notaEl.innerHTML =
    f.dataAdicao && dados.fundoSerie[0].data > f.dataAdicao
      ? '<div class="bench-fx-note">Mostrando os últimos meses disponíveis — o histórico gravado ainda não cobre desde a data de adição real.</div>'
      : "";

  return true;
}

function renderizarIlustrativo(f) {
  const b = gerarBenchmarkPorPeriodo(f);
  const hasCdiPct = b.benchmark === "CDI";

  document.getElementById("chart-titulo-" + f.id).innerHTML =
    'Evolução da rentabilidade vs. benchmark<span class="bench-illustrative-tag">exemplo ilustrativo</span>';
  document.getElementById("periodo-titulo-" + f.id).innerHTML =
    'Rentabilidade por período vs. benchmark<span class="bench-illustrative-tag">exemplo ilustrativo</span>';
  document.getElementById("periodo-conteudo-" + f.id).innerHTML = `
    <table class="bench-table">
      <thead>
        <tr>
          <th>Período</th><th>Fundo</th><th>${b.benchmark}</th><th>Diferença</th>${hasCdiPct ? "<th>% do CDI</th>" : ""}
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
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${b.benchmark === "S&P 500" ? '<div class="bench-fx-note">S&P 500 em USD, sem ajuste cambial: o fundo é cotado em reais.</div>' : ""}
  `;

  const benchmarkName = BENCH_ILUSTRATIVO[f.categoria] || "CDI";
  const { labels, values } = gerarSerieIlustrativa(f);
  const benchValues = gerarSerieBenchmarkIlustrativa(f.nome, values.length);
  desenharChart(f, labels, values, benchValues, abreviarNome(f.nome), benchmarkName);

  document.getElementById("chart-nota-" + f.id).innerHTML = !f.dataAdicao
    ? '<div class="bench-fx-note">Período de exemplo (8 meses): este fundo ainda não tem data de adição registrada, então o gráfico não começa na data real de entrada.</div>'
    : "";
}

export async function initChart(f) {
  const benchmarkNome = BENCHMARK_POR_CATEGORIA[f.categoria] || "CDI";
  const [historicoFundo, historicoBench] = await Promise.all([buscarHistorico(f.id), buscarBenchmark(benchmarkNome)]);

  // A troca de painel (fechar/abrir outro fundo) pode acontecer antes da
  // resposta chegar — se o canvas já não existe mais, não faz nada.
  if (!document.getElementById(`chart-${f.id}`)) return;

  let mostrouReal = false;
  if (historicoFundo.length >= MINIMO_PONTOS_REAIS && historicoBench.length >= MINIMO_PONTOS_REAIS) {
    mostrouReal = await renderizarReal(f, historicoFundo, historicoBench, benchmarkNome);
  }
  if (!mostrouReal) {
    renderizarIlustrativo(f);
  }
}
