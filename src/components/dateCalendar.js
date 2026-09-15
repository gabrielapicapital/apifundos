const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];

// Calendário customizado pra substituir <input type="date"> nativo (não dá
// pra estilizar e foge do padrão visual do app). O input hidden continua
// sendo a fonte da verdade em formato ISO (mesmo id/valor de antes), então
// nenhum outro código precisa mudar — só passa a existir um input de texto
// visível (dd/mm/aaaa) + um painel de navegação por dia/mês/ano por cima.
//
// setDate() (usado pelos cliques dentro do próprio calendário) dispara
// "change" no hidden, pra código externo que escuta esse evento (ex: nova
// busca de cota ao trocar a data) continuar funcionando. setValueSilently()
// é pra quando o CÓDIGO QUE CHAMA já sabe o valor certo e só quer refletir
// na tela sem disparar esse efeito de novo (ex: preencher a data de hoje ao
// abrir o modal, ou aplicar uma data já sugerida pela API).
export function attachCalendar({ hiddenInputId, displayInputId, btnId, panelId }) {
  const hiddenInput = document.getElementById(hiddenInputId);
  const displayInput = document.getElementById(displayInputId);
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);

  let viewYear, viewMonth, selectedISO = null, mode = "days", yearsRangeStart = null;

  function isoToBr(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function setValueSilently(iso) {
    selectedISO = iso;
    hiddenInput.value = iso;
    displayInput.value = isoToBr(iso);
  }

  function setDate(iso) {
    setValueSilently(iso);
    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function render() {
    if (mode === "years") {
      if (yearsRangeStart === null) yearsRangeStart = viewYear - (viewYear % 12);
      let cells = "";
      for (let y = yearsRangeStart; y < yearsRangeStart + 12; y++) {
        const cls = ["cdp-day", "cdp-year-cell"];
        if (y === viewYear) cls.push("selected");
        cells += `<button type="button" class="${cls.join(" ")}" data-year="${y}">${y}</button>`;
      }
      panel.innerHTML = `
        <div class="cdp-header">
          <button type="button" id="cdpPrev">‹</button>
          <span class="cdp-month-label">${yearsRangeStart}–${yearsRangeStart + 11}</span>
          <button type="button" id="cdpNext">›</button>
        </div>
        <div class="cdp-grid-12">${cells}</div>
      `;
      panel.querySelectorAll("[data-year]").forEach((b) => {
        b.addEventListener("click", () => {
          viewYear = parseInt(b.dataset.year, 10);
          mode = "months";
          render();
        });
      });
      document.getElementById("cdpPrev").addEventListener("click", () => { yearsRangeStart -= 12; render(); });
      document.getElementById("cdpNext").addEventListener("click", () => { yearsRangeStart += 12; render(); });
      return;
    }

    if (mode === "months") {
      let cells = "";
      MESES_PT.forEach((nome, idx) => {
        const cls = ["cdp-day", "cdp-month-cell"];
        if (idx === viewMonth) cls.push("selected");
        cells += `<button type="button" class="${cls.join(" ")}" data-month="${idx}">${nome.slice(0, 3)}</button>`;
      });
      panel.innerHTML = `
        <div class="cdp-header">
          <button type="button" id="cdpPrev">‹</button>
          <span class="cdp-month-label cdp-clickable" id="cdpYearLabel">${viewYear}</span>
          <button type="button" id="cdpNext">›</button>
        </div>
        <div class="cdp-grid-12">${cells}</div>
      `;
      panel.querySelectorAll("[data-month]").forEach((b) => {
        b.addEventListener("click", () => {
          viewMonth = parseInt(b.dataset.month, 10);
          mode = "days";
          render();
        });
      });
      document.getElementById("cdpYearLabel").addEventListener("click", () => {
        yearsRangeStart = viewYear - (viewYear % 12);
        mode = "years";
        render();
      });
      document.getElementById("cdpPrev").addEventListener("click", () => { viewYear--; render(); });
      document.getElementById("cdpNext").addEventListener("click", () => { viewYear++; render(); });
      return;
    }

    // mode === "days"
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const todayISO = new Date().toISOString().slice(0, 10);

    let cells = "";
    for (let i = 0; i < startWeekday; i++) {
      const d = daysInPrevMonth - startWeekday + 1 + i;
      cells += `<button type="button" class="cdp-day other-month" disabled>${d}</button>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cls = ["cdp-day"];
      if (iso === todayISO) cls.push("today");
      if (iso === selectedISO) cls.push("selected");
      cells += `<button type="button" class="${cls.join(" ")}" data-iso="${iso}">${d}</button>`;
    }
    const totalCells = startWeekday + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= trailing; d++) {
      cells += `<button type="button" class="cdp-day other-month" disabled>${d}</button>`;
    }

    panel.innerHTML = `
      <div class="cdp-header">
        <button type="button" id="cdpPrev">‹</button>
        <span class="cdp-month-label cdp-clickable" id="cdpMonthLabel">${MESES_PT[viewMonth]} de ${viewYear}</span>
        <button type="button" id="cdpNext">›</button>
      </div>
      <div class="cdp-weekdays">${DIAS_PT.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="cdp-days">${cells}</div>
      <div class="cdp-footer"><button type="button" class="cdp-today-link" id="cdpToday">Hoje</button></div>
    `;

    panel.querySelectorAll(".cdp-day[data-iso]").forEach((b) => {
      b.addEventListener("click", () => {
        setDate(b.dataset.iso);
        panel.classList.add("hidden");
      });
    });
    document.getElementById("cdpMonthLabel").addEventListener("click", () => {
      mode = "months";
      render();
    });
    document.getElementById("cdpPrev").addEventListener("click", () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });
    document.getElementById("cdpNext").addEventListener("click", () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });
    document.getElementById("cdpToday").addEventListener("click", () => {
      const iso = new Date().toISOString().slice(0, 10);
      const [y, m] = iso.split("-").map(Number);
      viewYear = y;
      viewMonth = m - 1;
      mode = "days";
      setDate(iso);
      render();
    });
  }

  function open() {
    const iso = hiddenInput.value || new Date().toISOString().slice(0, 10);
    const [y, m] = iso.split("-").map(Number);
    viewYear = y;
    viewMonth = m - 1;
    mode = "days";
    selectedISO = hiddenInput.value || null;
    render();
    panel.classList.remove("hidden");
  }

  function close() {
    panel.classList.add("hidden");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.contains("hidden") ? open() : close();
  });
  displayInput.addEventListener("click", open);
  document.addEventListener("click", (e) => {
    const wrap = displayInput.closest(".custom-date-wrap");
    if (wrap && !e.composedPath().includes(wrap)) close();
  });

  return { setValueSilently, close };
}
