export function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + "%";
}

export function fmtBRL(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(v, maxFractionDigits = 4) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: maxFractionDigits });
}

// Aceita "DD/MM/AAAA" ou "AAAA-MM-DD" e sempre devolve "DD/MM/AAAA".
export function fmtDateBR(dateStr) {
  if (!dateStr) return "—";
  if (dateStr.includes("/")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Converte "DD/MM/AAAA" -> "AAAA-MM-DD" (formato usado por <input type="date">).
export function toISODate(dateBR) {
  if (!dateBR) return "";
  if (dateBR.includes("-")) return dateBR;
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}
