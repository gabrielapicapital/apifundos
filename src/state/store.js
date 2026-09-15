import { calcularRentabilidade } from "../data/normalize.js";

// Store simples (estado + pub/sub), agora falando com o backend real
// (funções da Vercel + Postgres, ver pasta api/) em vez de localStorage.
// Dados de fundo passam a ser compartilhados entre todos os consultores.

let state = {
  fundos: [],
  loaded: false,
  loadError: null,
  adminEmail: null, // e-mail "autenticado" (ver TODO em config.js) — enviado
  // como header x-admin-email nas chamadas que exigem admin; o servidor
  // confere contra ADMIN_EMAILS (ver api/_lib/auth.js).
  filtro: {
    tipo: "Todos",
    categoria: "Todos",
    busca: "",
    ordenacao: "ret-desc",
  },
  expandedId: null,
  editMode: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

function recompute(fundos) {
  return fundos.map((f) => ({ ...f, rentabilidadePct: calcularRentabilidade(f) }));
}

async function adminFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.adminEmail) headers["x-admin-email"] = state.adminEmail;
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function hydrate() {
  try {
    const fundos = await adminFetch("/api/fundos");
    state = { ...state, fundos: recompute(fundos), loaded: true, loadError: null };
  } catch (e) {
    console.error("Falha ao carregar fundos do servidor:", e);
    state = { ...state, fundos: [], loaded: true, loadError: e.message };
  }
  notify();
}

export function setFiltro(patch) {
  state = { ...state, filtro: { ...state.filtro, ...patch }, expandedId: null };
  notify();
}

export function toggleExpanded(id) {
  state = { ...state, expandedId: state.expandedId === id ? null : id };
  notify();
}

export function setEditMode(on) {
  state = { ...state, editMode: on, adminEmail: on ? state.adminEmail : null };
  notify();
}

export function setAdminEmail(email) {
  state = { ...state, adminEmail: email };
}

export async function addFundo(fundo) {
  const novo = await adminFetch("/api/fundos", { method: "POST", body: JSON.stringify(fundo) });
  state = { ...state, fundos: recompute([...state.fundos, novo]) };
  notify();
}

export async function removeFundo(id) {
  await adminFetch(`/api/fundos/${id}`, { method: "DELETE" });
  state = {
    ...state,
    fundos: state.fundos.filter((f) => f.id !== id),
    expandedId: state.expandedId === id ? null : state.expandedId,
  };
  notify();
}

export async function updateFundo(id, patch) {
  const atualizado = await adminFetch(`/api/fundos/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  state = { ...state, fundos: recompute(state.fundos.map((f) => (f.id === id ? atualizado : f))) };
  notify();
}

export async function updateDiagnostico(id, texto) {
  await updateFundo(id, { diagnostico: texto });
}

// Histórico real de preços de um fundo (para o gráfico de evolução). Vazio
// quando ainda não há pontos suficientes — nesse caso o gráfico continua
// mostrando o exemplo ilustrativo (ver benchmarkChart.js).
export async function buscarHistorico(id) {
  try {
    return await adminFetch(`/api/fundos/${id}`, { method: "GET" });
  } catch (e) {
    console.error("Falha ao buscar histórico:", e);
    return [];
  }
}

export function fundosFiltrados() {
  const { tipo, categoria, busca, ordenacao } = state.filtro;
  const termo = busca.trim().toLowerCase();
  const termoDigits = termo.replace(/\D/g, "");

  let lista = state.fundos.filter((f) => {
    if (tipo !== "Todos" && f.tipo !== tipo) return false;
    if (categoria !== "Todos" && f.categoria !== categoria) return false;
    if (termo) {
      const matchNome = f.nome.toLowerCase().includes(termo);
      const matchCnpj = termoDigits && f.cnpjOuTicker && f.cnpjOuTicker.replace(/\D/g, "").includes(termoDigits);
      if (!matchNome && !matchCnpj) return false;
    }
    return true;
  });

  const rank = (f) => (f.pendenteCorrecao ? null : f.rentabilidadePct);

  if (ordenacao === "ret-desc") {
    lista = lista.sort((a, b) => (rank(b) ?? -Infinity) - (rank(a) ?? -Infinity));
  } else if (ordenacao === "ret-asc") {
    lista = lista.sort((a, b) => (rank(a) ?? Infinity) - (rank(b) ?? Infinity));
  } else if (ordenacao === "name-asc") {
    lista = lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } else if (ordenacao === "cat-asc") {
    lista = lista.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
  }

  return lista;
}
