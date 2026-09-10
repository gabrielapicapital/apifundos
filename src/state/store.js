import { STORAGE_KEY } from "../config.js";
import { loadSeedFundos, calcularRentabilidade } from "../data/normalize.js";

// Store simples (estado + pub/sub) com persistência em localStorage.
//
// TODO(backend): isto é um substituto temporário para a API + Postgres
// descritos na especificação (seção 9). Quando o backend existir, trocar
// `persist()`/`hydrate()` por chamadas HTTP e manter a mesma interface
// pública (getState/subscribe/actions) para não precisar reescrever a UI.
// Enquanto isso, dados adicionados/removidos/editados por um admin só ficam
// salvos no navegador daquele admin — não sincronizam entre consultores.

let state = {
  fundos: [],
  loaded: false,
  adminEmail: null, // e-mail "autenticado" (ver TODO em config.js)
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

function persist() {
  try {
    const payload = {
      fundos: state.fundos,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Falha ao salvar fundos localmente:", e);
  }
}

export async function hydrate() {
  let fundos;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    fundos = raw ? JSON.parse(raw).fundos : null;
  } catch (e) {
    fundos = null;
  }
  if (!fundos || !fundos.length) {
    fundos = await loadSeedFundos();
  }
  state = { ...state, fundos: recompute(fundos), loaded: true };
  notify();
}

function recompute(fundos) {
  return fundos.map((f) => ({ ...f, rentabilidadePct: calcularRentabilidade(f) }));
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

export function addFundo(fundo) {
  const novo = {
    id: `${fundo.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    diagnostico: null,
    historicoPrecos: [{ data: fundo.dataAdicao, preco: fundo.precoEntrada }],
    ...fundo,
  };
  state = { ...state, fundos: recompute([...state.fundos, novo]) };
  persist();
  notify();
}

export function removeFundo(id) {
  state = {
    ...state,
    fundos: state.fundos.filter((f) => f.id !== id),
    expandedId: state.expandedId === id ? null : state.expandedId,
  };
  persist();
  notify();
}

export function updateFundo(id, patch) {
  state = {
    ...state,
    fundos: recompute(
      state.fundos.map((f) => {
        if (f.id !== id) return f;
        const merged = { ...f, ...patch };
        // Se a correção acabou de fornecer preço de entrada + data e ainda não
        // havia nenhum ponto de histórico, este é o primeiro (ver seção 8).
        if (patch.precoEntrada != null && merged.dataAdicao && !(f.historicoPrecos && f.historicoPrecos.length)) {
          merged.historicoPrecos = [{ data: merged.dataAdicao, preco: patch.precoEntrada }];
        }
        // patrimonio = quantidade_cotas × preco_atual (especificação seção 4).
        merged.patrimonio = merged.quantidadeCotas * merged.precoAtual;
        return merged;
      })
    ),
  };
  persist();
  notify();
}

export function updateDiagnostico(id, texto) {
  state = {
    ...state,
    fundos: state.fundos.map((f) => (f.id === id ? { ...f, diagnostico: texto } : f)),
  };
  persist();
  notify();
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
