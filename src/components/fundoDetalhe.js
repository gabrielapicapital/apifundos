import { getState, buscarHistorico, buscarBenchmark, buscarCadastro, buscarComposicao, updateDiagnostico } from "../state/store.js";
import { voltarParaLista } from "../router.js";
import { fmtBRL, fmtPct, fmtDateBR, fmtNumber } from "../lib/format.js";
import { BENCHMARK_POR_CATEGORIA, calcularPeriodos } from "../lib/periodos.js";
import { calcularRentabilidadeMensalAnual, calcularIndicesRisco, calcularDrawdown, calcularVolatilidadeSerie } from "../lib/indices.js";
import { ICON_TRIANGLE_ALERT } from "../lib/icons.js";
import * as editFundModal from "./editFundModal.js";

const BENCHMARKS_DISPONIVEIS = ["CDI", "Ibovespa", "S&P 500", "IPCA"];
const TIPO_LABEL_SINGULAR = { Fundo: "Fundo", ETF: "ETF", FIDC: "FIDC" };

// Estado local da página (um fundo por vez, controlado pelo roteador).
let fundoAtualId = null;
let abaAtiva = "info";
let benchmarkSelecionado = "CDI";
let dadosCarregados = null; // { fundo, cadastro, historico, benchmarks: {nome: pontos} }
const chartInstances = {};

function destruirGraficos() {
  for (const key of Object.keys(chartInstances)) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function simNaoOuTraco(v) {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  return "—";
}

function textoOuTraco(v) {
  return v && String(v).trim() ? v : "—";
}

// ---- Shell: cabeçalho + abas ---------------------------------------------

function renderShell(fundo, cadastro) {
  const container = document.getElementById("detalheView");
  const statusOk = cadastro?.situacao === "Em Funcionamento Normal";
  const editMode = getState().editMode;
  container.innerHTML = `
    <div class="topbar">
      <button class="back-link" id="voltarListaBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M19 12H5"></path><path d="m12 19-7-7 7-7"></path></svg>
        <span>Voltar para a lista</span>
      </button>
      ${editMode ? `<button class="back-link" id="editarFundoBtn" style="margin-left:auto;">Editar dados do fundo</button>` : ""}
    </div>

    <div class="detalhe-page">
      <div class="fund-header">
        <div class="fund-header-top">
          <div>
            <div class="fund-eyebrow">${TIPO_LABEL_SINGULAR[fundo.tipo] || fundo.tipo}</div>
            <h1>${fundo.nome}</h1>
            ${
              cadastro?.situacao
                ? `<span class="status-badge${statusOk ? "" : " atencao"}">● ${cadastro.situacao}</span>`
                : ""
            }
            <div class="cnpj-line">${fundo.tipo === "ETF" ? "Ticker" : "CNPJ"}: ${fundo.cnpjOuTicker || "não informado"}</div>
          </div>
          <div class="admin-gestor">
            Administrador:<br><b>${textoOuTraco(cadastro?.administrador || fundo.instituicao)}</b><br><br>
            Gestor:<br><b>${textoOuTraco(cadastro?.gestor)}</b>
          </div>
        </div>

        <div class="quick-stats">
          <div class="quick-stat">
            <div class="label">Cotistas totais da casca</div>
            <div class="value">${cadastro?.numeroCotistas != null ? fmtNumber(cadastro.numeroCotistas, 0) : "não disponível"}</div>
          </div>
          <div class="quick-stat">
            <div class="label">Patrimônio total da casca</div>
            <div class="value">${cadastro?.patrimonioLiquido != null ? fmtBRL(cadastro.patrimonioLiquido) : "não disponível"}</div>
          </div>
          <div class="quick-stat">
            <div class="label">Data de registro na CVM</div>
            <div class="value">${cadastro?.dataRegistro ? fmtDateBR(cadastro.dataRegistro) : "não disponível"}</div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn active" data-tab="info">Informações</button>
        <button class="tab-btn" data-tab="rentabilidade">Rentabilidade</button>
        <button class="tab-btn" data-tab="indices">Índices</button>
        <button class="tab-btn" data-tab="carteira">Carteira</button>
      </div>

      <div id="detalheTabContent"></div>
    </div>
  `;

  document.getElementById("voltarListaBtn").addEventListener("click", voltarParaLista);
  document.getElementById("editarFundoBtn")?.addEventListener("click", () => editFundModal.open(fundo));
  container.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      abaAtiva = btn.dataset.tab;
      container.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderAbaAtiva();
    });
  });
}

// ---- Aba 1: Informações ---------------------------------------------------

function renderAbaInfo(fundo, cadastro) {
  const editMode = getState().editMode;
  return `
    <div class="card">
      <h3>Nossa posição</h3>
      <p class="sub">Dados já rastreados pelo app</p>
      <div class="metric-cards">
        <div class="metric-card"><div class="label">Tipo</div><div class="value">${TIPO_LABEL_SINGULAR[fundo.tipo] || fundo.tipo}</div></div>
        <div class="metric-card"><div class="label">Categoria / Estratégia</div><div class="value">${fundo.categoria}</div></div>
        <div class="metric-card"><div class="label">Adicionado em</div><div class="value">${fundo.dataAdicao ? fmtDateBR(fundo.dataAdicao) : "—"}</div></div>
        <div class="metric-card"><div class="label">Quantidade de cotas</div><div class="value">${fmtNumber(fundo.quantidadeCotas)}</div></div>
        <div class="metric-card"><div class="label">Preço de entrada</div><div class="value">${fundo.precoEntrada != null ? fmtBRL(fundo.precoEntrada) : "—"}</div></div>
        <div class="metric-card"><div class="label">Preço atual</div><div class="value">${fmtBRL(fundo.precoAtual)}</div></div>
        <div class="metric-card"><div class="label">Patrimônio na posição</div><div class="value">${fmtBRL(fundo.patrimonio)}</div></div>
        <div class="metric-card">
          <div class="label">Rentabilidade desde a entrada</div>
          <div class="value">${
            fundo.pendenteCorrecao
              ? `${ICON_TRIANGLE_ALERT}<span class="pending">verificar entrada</span>`
              : `<span class="${fundo.rentabilidadePct >= 0 ? "ret-pos" : "ret-neg"}">${fmtPct(fundo.rentabilidadePct)}</span>`
          }</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Características da classe</h3>
      <p class="sub">${cadastro ? "Cadastro público da CVM" : "Cadastro ainda não sincronizado pra esse fundo"}</p>
      ${
        cadastro
          ? `<div class="char-grid">
              <div class="char-item"><div class="label">Status da classe</div><span class="char-tag plain">${textoOuTraco(cadastro.situacao)}</span></div>
              <div class="char-item"><div class="label">Primeira cota</div><span class="char-tag plain">${cadastro.primeiraCota ? fmtDateBR(cadastro.primeiraCota) : "—"}</span></div>
              <div class="char-item"><div class="label">Categoria CVM</div><span class="char-tag">${textoOuTraco(cadastro.classificacaoCvm)}</span></div>
              <div class="char-item"><div class="label">Categoria ANBIMA</div><span class="char-tag plain">${textoOuTraco(cadastro.classificacaoAnbima)}</span></div>
              <div class="char-item"><div class="label">Tipo de classe</div><span class="char-tag">${textoOuTraco(cadastro.tipoClasse)}</span></div>
              <div class="char-item"><div class="label">Benchmark declarado</div><span class="char-tag">${textoOuTraco(cadastro.indicadorDesempenho)}</span></div>
              <div class="char-item"><div class="label">Investe 100% Offshore</div><span class="char-tag">${simNaoOuTraco(cadastro.permiteOffshore)}</span></div>
              <div class="char-item"><div class="label">Forma de condomínio</div><span class="char-tag plain">${textoOuTraco(cadastro.formaCondominio)}</span></div>
              <div class="char-item"><div class="label">Tributação longo prazo</div><span class="char-tag">${simNaoOuTraco(cadastro.tributacaoLongoPrazo)}</span></div>
              <div class="char-item"><div class="label">Código CVM</div><span class="char-tag plain">${textoOuTraco(cadastro.codigoCvm)}</span></div>
              <div class="char-item"><div class="label">Tipo de investidor</div><span class="char-tag">${textoOuTraco(cadastro.publicoAlvo)}</span></div>
              <div class="char-item"><div class="label">Exclusivo</div><span class="char-tag">${simNaoOuTraco(cadastro.exclusivo)}</span></div>
            </div>`
          : `<p class="pending">Esse fundo ainda não teve o cadastro completo da CVM sincronizado (precisa de CNPJ cadastrado). Um administrador pode rodar a sincronização em "Editar dados do fundo".</p>`
      }
    </div>

    <div class="card">
      <h3>Resumo financeiro</h3>
      <div class="metric-cards">
        <div class="metric-card"><div class="label">Patrimônio líquido</div><div class="value">${cadastro?.patrimonioLiquido != null ? fmtBRL(cadastro.patrimonioLiquido) : "não disponível"}</div></div>
        <div class="metric-card"><div class="label">Data do patrimônio</div><div class="value">${cadastro?.dataPatrimonioLiquido ? fmtDateBR(cadastro.dataPatrimonioLiquido) : "não disponível"}</div></div>
        <div class="metric-card"><div class="label">Cotistas</div><div class="value">${cadastro?.numeroCotistas != null ? fmtNumber(cadastro.numeroCotistas, 0) : "não disponível"}</div></div>
      </div>
    </div>

    <div class="card">
      <h3>Diagnóstico da equipe</h3>
      <p class="sub">Nota interna, editável pelos administradores</p>
      <div class="diagnostico-box">
        ${
          editMode
            ? `<textarea id="detalheDiagText" placeholder="Pontos positivos e pontos de atenção sobre esse fundo...">${fundo.diagnostico || ""}</textarea>
               <button id="detalheDiagSalvar">Salvar diagnóstico</button>`
            : `<span class="${fundo.diagnostico ? "" : "pending"}">${fundo.diagnostico || "nenhum diagnóstico registrado ainda"}</span>`
        }
      </div>
    </div>
  `;
}

// ---- Aba 2: Rentabilidade --------------------------------------------------

function tabelaPeriodoHtml(dados) {
  const hasCdiPct = dados.benchmark === "CDI";
  return `
    <table class="bench-table">
      <thead><tr><th>Período</th><th>Fundo</th><th>${dados.benchmark}</th><th>Diferença</th>${hasCdiPct ? "<th>% do CDI</th>" : ""}</tr></thead>
      <tbody>
        ${dados.rows
          .map((r) =>
            r.insuficiente
              ? `<tr><td>${r.label}</td><td colspan="${hasCdiPct ? 4 : 3}"><span class="pending">sem histórico suficiente</span></td></tr>`
              : `<tr>
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
    ${dados.benchmark === "S&P 500" ? '<div class="bench-fx-note">S&P 500 em USD, sem ajuste cambial: o fundo é cotado em reais.</div>' : ""}
  `;
}

function tabelaMensalHtml(mensal) {
  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  if (!mensal.anos.length) return '<p class="pending">Sem histórico mensal suficiente ainda.</p>';
  const fmtCell = (par) => {
    if (!par) return "<td>—</td>";
    const [v, cdi] = par;
    const cls = v >= 0 ? "ret-pos" : "ret-neg";
    return `<td><span class="cell-main ${cls}">${fmtPct(v)}</span>${cdi != null ? `<span class="cell-sub">${cdi.toFixed(0)}% do CDI</span>` : ""}</td>`;
  };
  return `
    <div class="hist-table-wrap">
      <table class="bench-table hist-table">
        <thead><tr><th>Ano</th>${MESES.map((m) => `<th>${m}</th>`).join("")}<th>No ano</th><th>Acumulado</th></tr></thead>
        <tbody>
          ${mensal.anos
            .map((row) => `<tr><td>${row.ano}</td>${row.meses.map(fmtCell).join("")}${fmtCell(row.noAno)}${fmtCell(row.acumulado)}</tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAbaRentabilidade(fundo, historico, benchmarksCache) {
  const opcoes = BENCHMARKS_DISPONIVEIS.map((b) => `<option value="${b}" ${b === benchmarkSelecionado ? "selected" : ""}>${b}</option>`).join("");
  return `
    <div class="card">
      <div class="card-header-row">
        <div>
          <h3>Evolução da rentabilidade</h3>
          <p class="sub" id="rentTituloNota"></p>
        </div>
        <div class="sort-wrap">
          <label class="benchmark-label">Comparar com</label>
          <select id="benchmarkSelect">${opcoes}</select>
        </div>
      </div>
      <div class="evolucao-chart-wrap"><div class="evolucao-chart-canvas-box"><canvas id="detalheChart"></canvas></div></div>
      <div id="rentPeriodoTabela" style="margin-top:14px;"></div>
    </div>

    <div class="card">
      <h3>Rentabilidade histórica</h3>
      <p class="sub">Fundo (linha de cima) e % do CDI daquele mês (linha de baixo)</p>
      <div id="rentMensalTabela">Carregando…</div>
    </div>
  `;
}

async function carregarRentabilidade(fundo, historico) {
  const benchPontos = await buscarBenchmark(benchmarkSelecionado);
  const dados = historico.length >= 2 && benchPontos.length >= 2 ? calcularPeriodos(historico, benchPontos, benchmarkSelecionado) : null;

  const notaEl = document.getElementById("rentTituloNota");
  const tabelaEl = document.getElementById("rentPeriodoTabela");
  if (!notaEl || !tabelaEl) return; // trocou de aba/fundo antes de terminar

  if (!dados) {
    notaEl.textContent = "Sem histórico real suficiente ainda pra montar o gráfico.";
    tabelaEl.innerHTML = "";
  } else {
    notaEl.textContent = `Desde ${fmtDateBR(dados.fundoSerie[0].data)}`;
    tabelaEl.innerHTML = tabelaPeriodoHtml(dados);

    const canvas = document.getElementById("detalheChart");
    if (canvas) {
      if (chartInstances.detalhe) chartInstances.detalhe.destroy();
      const base = dados.fundoSerie[0].valor;
      const baseBench = dados.benchSerie[0].valor;
      const labels = dados.fundoSerie.map((p) => fmtDateBR(p.data));
      const valoresFundo = dados.fundoSerie.map((p) => ((p.valor - base) / base) * 100);
      let j = 0;
      const valoresBench = dados.fundoSerie.map((p) => {
        while (j < dados.benchSerie.length - 1 && dados.benchSerie[j + 1].data <= p.data) j++;
        return ((dados.benchSerie[j].valor - baseBench) / baseBench) * 100;
      });
      chartInstances.detalhe = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: fundo.nome, data: valoresFundo, borderColor: "#0D2A54", borderWidth: 2, pointRadius: 0, tension: 0.2 },
            { label: benchmarkSelecionado, data: valoresBench, borderColor: "#AA7D41", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.2 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "top", align: "start" }, tooltip: { mode: "index", intersect: false } },
          scales: { y: { ticks: { callback: (v) => v + "%" } } },
        },
      });
    }
  }

  const mensalEl = document.getElementById("rentMensalTabela");
  if (mensalEl) {
    const cdiPontos = benchmarkSelecionado === "CDI" ? benchPontos : await buscarBenchmark("CDI");
    const mensal = calcularRentabilidadeMensalAnual(historico, cdiPontos);
    mensalEl.innerHTML = tabelaMensalHtml(mensal);
  }
}

// ---- Aba 3: Índices ---------------------------------------------------

function tabelaIndicesHtml(indices) {
  if (!indices) return '<p class="pending">Sem histórico suficiente ainda.</p>';
  const linha = (nome, campo, formato) => `
    <tr>
      <td>${nome}</td>
      ${indices.janelas
        .map((j) => {
          if (j.insuficiente || j[campo] == null) return "<td>—</td>";
          const v = j[campo];
          const cls = campo !== "volatilidade" ? (v >= 0 ? "ret-pos" : "ret-neg") : "";
          return `<td class="${j.label === "Total" ? "total-col" : ""} ${cls}">${formato(v)}</td>`;
        })
        .join("")}
    </tr>`;
  return `
    <table class="bench-table indices-table">
      <thead><tr><th>Indicador</th>${indices.janelas.map((j) => `<th>${j.label}</th>`).join("")}</tr></thead>
      <tbody>
        ${linha("Rentabilidade", "rentabilidade", fmtPct)}
        ${linha("Volatilidade (anualizada)", "volatilidade", (v) => v.toFixed(2).replace(".", ",") + "%")}
        ${linha("Índice de Sharpe", "sharpe", (v) => v.toFixed(2).replace(".", ","))}
      </tbody>
    </table>
  `;
}

function renderAbaIndices() {
  return `
    <div class="card">
      <h3>Índices de rentabilidade e risco</h3>
      <p class="sub">Calculados a partir do histórico real de cota do fundo, contra o CDI como taxa livre de risco</p>
      <div id="indicesTabela">Carregando…</div>
    </div>
    <div class="card">
      <h3>Drawdown</h3>
      <p class="sub">Queda em relação ao pico anterior, série completa</p>
      <div class="evolucao-chart-wrap"><div class="evolucao-chart-canvas-box" style="height:220px;"><canvas id="drawdownChart"></canvas></div></div>
    </div>
    <div class="card">
      <h3>Volatilidade</h3>
      <p class="sub">Janela móvel de 21 pregões (~1 mês), anualizada</p>
      <div class="evolucao-chart-wrap"><div class="evolucao-chart-canvas-box" style="height:220px;"><canvas id="volatilidadeChart"></canvas></div></div>
    </div>
  `;
}

function graficoLinhaSimples(canvasId, chaveInstancia, pontos, cor, sufixo) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !pontos.length) return;
  if (chartInstances[chaveInstancia]) chartInstances[chaveInstancia].destroy();
  chartInstances[chaveInstancia] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: pontos.map((p) => fmtDateBR(p.data)),
      datasets: [{ data: pontos.map((p) => p.valor), borderColor: cor, borderWidth: 1.5, pointRadius: 0, fill: chaveInstancia === "drawdown", backgroundColor: cor + "22", tension: 0.15 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(2).replace(".", ",")}${sufixo}` } } },
      scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { ticks: { callback: (v) => v + sufixo } } },
    },
  });
}

function carregarIndices(historico) {
  const cdiPromise = buscarBenchmark("CDI");
  return cdiPromise.then((cdiPontos) => {
    const el = document.getElementById("indicesTabela");
    if (!el) return;
    const indices = historico.length >= 3 ? calcularIndicesRisco(historico, cdiPontos) : null;
    el.innerHTML = tabelaIndicesHtml(indices);

    graficoLinhaSimples("drawdownChart", "drawdown", calcularDrawdown(historico), "#B71313", "%");
    graficoLinhaSimples("volatilidadeChart", "volatilidade", calcularVolatilidadeSerie(historico), "#0D2A54", "%");
  });
}

// ---- Aba 4: Carteira -------------------------------------------------------
// Fonte: dataset CDA da CVM (Composição e Diversificação das Aplicações),
// sincronizado por api/sincronizar-composicao.js — ver adendo "estrutura-
// dados-completa", seção 6. ETFs não entram (não têm CNPJ nesse dataset).

const CORES_BLOCO = {
  1: "#0D2A54",
  2: "#2F6FA8",
  3: "#5FA3D0",
  4: "#AA7D41",
  5: "#C9A26A",
  6: "#1E7A4C",
  7: "#7A5FB0",
  8: "#8A97A6",
};

function linhaCarteiraHtml(b) {
  return `
    <tr>
      <td><span class="carteira-dot" style="color:${CORES_BLOCO[b.bloco]}">●</span>${b.nome}</td>
      <td class="num">${fmtBRL(b.valor)}</td>
      <td class="num">${b.percentual.toFixed(1).replace(".", ",")}%</td>
    </tr>`;
}

function renderAbaCarteira(composicao) {
  if (!composicao) {
    return `
      <div class="card">
        <h3>Composição da carteira</h3>
        <p class="pending">Ainda não disponível pra esse fundo — a composição vem do dataset CDA da CVM, sincronizado numa rotina separada (ver "Editar dados do fundo"). ETFs não têm esse dado (replicam um índice, não uma carteira discricionária).</p>
      </div>
    `;
  }
  const relevantes = [...composicao.blocos].sort((a, b) => b.valor - a.valor);
  return `
    <div class="card">
      <div class="card-header-row">
        <div>
          <h3>Composição da carteira</h3>
          <p class="sub">Competência ${fmtDateBR(composicao.competencia)} · dataset CDA da CVM</p>
        </div>
      </div>
      <div class="carteira-layout">
        <div class="evolucao-chart-wrap"><div class="evolucao-chart-canvas-box" style="height:260px;"><canvas id="carteiraChart"></canvas></div></div>
        <table class="bench-table carteira-table">
          <thead><tr><th>Categoria</th><th>Valor de mercado</th><th>% da carteira</th></tr></thead>
          <tbody>${relevantes.map(linhaCarteiraHtml).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function carregarCarteira(composicao) {
  const canvas = document.getElementById("carteiraChart");
  if (!canvas) return;
  if (chartInstances.carteira) chartInstances.carteira.destroy();
  const dados = [...composicao.blocos].filter((b) => b.valor > 0).sort((a, b) => b.valor - a.valor);
  chartInstances.carteira = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: dados.map((b) => b.nome),
      datasets: [{ data: dados.map((b) => b.percentual), backgroundColor: dados.map((b) => CORES_BLOCO[b.bloco]), borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toFixed(1).replace(".", ",")}%` } },
      },
    },
  });
}

// ---- Orquestração ---------------------------------------------------------

async function renderAbaAtiva() {
  const content = document.getElementById("detalheTabContent");
  if (!content || !dadosCarregados) return;
  const { fundo, cadastro, historico, composicao } = dadosCarregados;

  if (abaAtiva === "info") {
    content.innerHTML = renderAbaInfo(fundo, cadastro);
    document.getElementById("detalheDiagSalvar")?.addEventListener("click", async () => {
      const texto = document.getElementById("detalheDiagText").value.trim();
      try {
        await updateDiagnostico(fundo.id, texto);
        dadosCarregados.fundo = getState().fundos.find((f) => f.id === fundo.id) || fundo;
        renderAbaAtiva();
      } catch (err) {
        alert(`Não foi possível salvar o diagnóstico: ${err.message}`);
      }
    });
  } else if (abaAtiva === "rentabilidade") {
    content.innerHTML = renderAbaRentabilidade(fundo, historico);
    document.getElementById("benchmarkSelect").addEventListener("change", (e) => {
      benchmarkSelecionado = e.target.value;
      carregarRentabilidade(fundo, historico);
    });
    carregarRentabilidade(fundo, historico);
  } else if (abaAtiva === "indices") {
    content.innerHTML = renderAbaIndices();
    carregarIndices(historico);
  } else if (abaAtiva === "carteira") {
    content.innerHTML = renderAbaCarteira(composicao);
    if (composicao) carregarCarteira(composicao);
  }
}

export async function render(fundoId) {
  fundoAtualId = fundoId;
  abaAtiva = "info";
  destruirGraficos();

  const container = document.getElementById("detalheView");
  container.innerHTML = `<div class="topbar"><span class="topbar-brand-text">API Capital · Fundos Indicados</span></div><div class="detalhe-page"><p class="pending">Carregando…</p></div>`;

  const state = getState();
  let fundo = state.fundos.find((f) => f.id === fundoId);
  if (!fundo) {
    // Navegação direta por link, antes do hydrate() terminar: espera um
    // pouco e tenta de novo (renderAll chama esse render() de novo quando
    // os dados carregarem, ver app.js).
    return;
  }

  benchmarkSelecionado = BENCHMARK_POR_CATEGORIA[fundo.categoria] || "CDI";

  const [cadastro, historico, composicao] = await Promise.all([
    buscarCadastro(fundoId),
    buscarHistorico(fundoId),
    buscarComposicao(fundoId),
  ]);
  if (fundoAtualId !== fundoId) return; // usuário já navegou pra outro fundo

  dadosCarregados = { fundo, cadastro, historico, composicao };
  renderShell(fundo, cadastro);
  await renderAbaAtiva();
}

// Id do fundo já totalmente carregado (cadastro+histórico prontos), ou null
// — usado pelo roteador (app.js) pra saber se precisa chamar render() de
// novo (evita refazer o fetch a cada notificação da store).
export function fundoCarregadoId() {
  return dadosCarregados?.fundo.id ?? null;
}
