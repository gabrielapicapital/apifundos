import { calcularRentabilidade } from "../data/normalize.js";

// Store simples (estado + pub/sub), agora falando com o backend real
// (funções da Vercel + Postgres, ver pasta api/) em vez de localStorage.
// Dados de fundo passam a ser compartilhados entre todos os consultores.

// O e-mail de admin (e o modo administrador) só vivia na memória da página —
// qualquer recarregamento (ex: o próprio service worker se atualizando
// sozinho depois de um novo deploy, ver service-worker.js) derrubava o
// administrador sem nenhum aviso, parecendo que o botão de editar tinha
// sumido. Persistir no localStorage não piora a segurança (que já é só uma
// allowlist conferida no servidor, ver TODO em config.js) — só evita esse
// logout silencioso.
const ADMIN_EMAIL_STORAGE_KEY = "apiCapitalAdminEmail";

function lerAdminEmailSalvo() {
  try {
    return localStorage.getItem(ADMIN_EMAIL_STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function salvarAdminEmail(email) {
  try {
    if (email) localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, email);
    else localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
  } catch (e) {
    // localStorage bloqueado (navegação privada, storage desabilitado etc.)
    // — segue funcionando, só sem persistir entre recarregamentos.
  }
}

const adminEmailSalvo = lerAdminEmailSalvo();

let state = {
  fundos: [],
  loaded: false,
  loadError: null,
  adminEmail: adminEmailSalvo, // e-mail "autenticado" (ver TODO em config.js) — enviado
  // como header x-admin-email nas chamadas que exigem admin; o servidor
  // confere contra ADMIN_EMAILS (ver api/_lib/auth.js).
  filtro: {
    tipo: "Todos",
    categoria: "Todos",
    busca: "",
    ordenacao: "ret-desc",
  },
  editMode: Boolean(adminEmailSalvo),
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
  state = { ...state, filtro: { ...state.filtro, ...patch } };
  notify();
}

export function setEditMode(on) {
  const adminEmail = on ? state.adminEmail : null;
  salvarAdminEmail(adminEmail);
  state = { ...state, editMode: on, adminEmail };
  notify();
}

export function setAdminEmail(email) {
  salvarAdminEmail(email);
  state = { ...state, adminEmail: email };
}

export async function addFundo(fundo) {
  const novo = await adminFetch("/api/fundos", { method: "POST", body: JSON.stringify(fundo) });
  state = { ...state, fundos: recompute([...state.fundos, novo]) };
  notify();
  return novo;
}

// Dispara o backfill retroativo de UM fundo (api/fundos/[id]/backfill.js):
// busca de uma vez a cota real desde a data de compra até hoje, em vez de
// esperar a rotina diária acumular um ponto por dia. Chamado logo depois de
// addFundo() no modal "Adicionar fundo" — silencioso, não bloqueia a UI; se
// falhar (ex: fundo sem CNPJ), o fundo continua cadastrado normalmente, só
// sem o histórico completo ainda.
export async function backfillFundo(id) {
  try {
    await adminFetch(`/api/fundos/${id}/backfill`, { method: "POST" });
    await hydrate();
  } catch (e) {
    console.error("Falha ao buscar histórico completo do fundo novo:", e);
  }
}

export async function removeFundo(id) {
  await adminFetch(`/api/fundos/${id}`, { method: "DELETE" });
  state = { ...state, fundos: state.fundos.filter((f) => f.id !== id) };
  notify();
}

export async function updateFundo(id, patch) {
  const atualizado = await adminFetch(`/api/fundos/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  state = { ...state, fundos: recompute(state.fundos.map((f) => (f.id === id ? atualizado : f))) };
  notify();
  return atualizado;
}

// Acrescenta um novo registro ao histórico de diagnóstico do time de Asset
// (adendo "diagnostico-asset-e-admins") — nunca sobrescreve os anteriores.
// O autor é identificado no servidor pelo e-mail já autenticado (header
// x-admin-email, enviado por adminFetch), não por nada que viaje no body.
export async function addDiagnostico(id, texto) {
  await updateFundo(id, { novoDiagnostico: { texto } });
}

// Histórico real de preços de um fundo (para o gráfico de evolução). Vazio
// quando ainda não há pontos suficientes (ver src/components/fundoDetalhe.js).
export async function buscarHistorico(id) {
  try {
    return await adminFetch(`/api/fundos/${id}`, { method: "GET" });
  } catch (e) {
    console.error("Falha ao buscar histórico:", e);
    return [];
  }
}

// Série histórica de um benchmark (CDI, Ibovespa ou S&P 500), gravada pelo
// backfill (ver api/backfill-historico.js).
export async function buscarBenchmark(nome) {
  try {
    return await adminFetch(`/api/benchmark?nome=${encodeURIComponent(nome)}`, { method: "GET" });
  } catch (e) {
    console.error("Falha ao buscar benchmark:", e);
    return [];
  }
}

// Cadastro completo da CVM (adendo "estrutura-dados-completa") — null se
// ainda não foi sincronizado pra esse fundo (ver api/sincronizar-cadastro.js).
export async function buscarCadastro(id) {
  try {
    return await adminFetch(`/api/fundos/${id}/cadastro`, { method: "GET" });
  } catch (e) {
    console.error("Falha ao buscar cadastro completo:", e);
    return null;
  }
}

// Composição da carteira (dataset CDA da CVM) — null se ainda não foi
// sincronizada pra esse fundo (ver api/sincronizar-composicao.js).
export async function buscarComposicao(id) {
  try {
    return await adminFetch(`/api/fundos/${id}/composicao`, { method: "GET" });
  } catch (e) {
    console.error("Falha ao buscar composição da carteira:", e);
    return null;
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
