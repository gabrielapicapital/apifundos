import { calcularRentabilidade } from "../data/normalize.js";
import { GRUPOS_RISCO_ORDEM, SEM_GRUPO } from "../lib/gruposRisco.js";

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
    // Adendo "grupos-de-risco": "Por grupo de risco" é o padrão ao abrir o
    // app (substitui o ranking como visão inicial, seção 3 do adendo).
    modoVisualizacao: "grupo", // "grupo" | "ranking"
    gruposVisiveis: new Set(GRUPOS_RISCO_ORDEM), // todos marcados por padrão
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

// Edita o texto de um registro já existente (por id) — qualquer
// administrador pode editar/remover qualquer registro, mesmo modelo de
// permissão já usado no resto do app.
export async function editarDiagnostico(id, diagnosticoId, texto) {
  await updateFundo(id, { editarDiagnostico: { id: diagnosticoId, texto } });
}

export async function removerDiagnostico(id, diagnosticoId) {
  await updateFundo(id, { removerDiagnostico: { id: diagnosticoId } });
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

// Sugestão de grupo de risco por CNPJ (adendo "grupos-de-risco", seção 5) —
// leitura pública e rápida (não passa pela CVM), disparada na perda de
// foco do campo CNPJ em "Adicionar fundo"/"Editar dados do fundo". null
// quando o CNPJ não é de 14 dígitos ou não está na tabela.
export async function buscarGrupoPorCnpj(cnpjOuTicker) {
  try {
    const resultado = await adminFetch(`/api/fundos?grupoPorCnpj=${encodeURIComponent(cnpjOuTicker)}`, { method: "GET" });
    return resultado.grupoRisco;
  } catch (e) {
    console.error("Falha ao buscar grupo de risco por CNPJ:", e);
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

// Filtros em comum entre os dois modos de visualização (tipo/categoria/
// busca) — NÃO inclui grupo de risco nem ordenação, que cada modo trata do
// seu jeito (ver fundosFiltrados/fundosAgrupados abaixo).
function fundosNaBaseFiltrada() {
  const { tipo, categoria, busca } = state.filtro;
  const termo = busca.trim().toLowerCase();
  const termoDigits = termo.replace(/\D/g, "");

  return state.fundos.filter((f) => {
    if (tipo !== "Todos" && f.tipo !== tipo) return false;
    if (categoria !== "Todos" && f.categoria !== categoria) return false;
    if (termo) {
      const matchNome = f.nome.toLowerCase().includes(termo);
      const matchCnpj = termoDigits && f.cnpjOuTicker && f.cnpjOuTicker.replace(/\D/g, "").includes(termoDigits);
      if (!matchNome && !matchCnpj) return false;
    }
    return true;
  });
}

const rankRentabilidade = (f) => (f.pendenteCorrecao ? null : f.rentabilidadePct);

// Modo "Ranking por rentabilidade" — lista única, ordenada por
// state.filtro.ordenacao (comportamento de sempre, anterior ao adendo
// "grupos-de-risco").
export function fundosFiltrados() {
  const { ordenacao } = state.filtro;
  let lista = fundosNaBaseFiltrada();

  if (ordenacao === "ret-desc") {
    lista = lista.sort((a, b) => (rankRentabilidade(b) ?? -Infinity) - (rankRentabilidade(a) ?? -Infinity));
  } else if (ordenacao === "ret-asc") {
    lista = lista.sort((a, b) => (rankRentabilidade(a) ?? Infinity) - (rankRentabilidade(b) ?? Infinity));
  } else if (ordenacao === "name-asc") {
    lista = lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } else if (ordenacao === "cat-asc") {
    lista = lista.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
  }

  return lista;
}

// Modo "Por grupo de risco" (adendo "grupos-de-risco", seções 3 e 4) — uma
// seção por grupo, na ordem oficial (mais seguro primeiro), só os grupos
// marcados como visíveis, cada um ordenado por rentabilidade desc por
// dentro, e omitindo grupo sem nenhum fundo na seleção atual. Devolve
// {grupo, fundos}[] — não uma lista achatada, pra table.js desenhar o
// cabeçalho de cada seção.
export function fundosAgrupados() {
  const { gruposVisiveis } = state.filtro;
  const base = fundosNaBaseFiltrada();

  return GRUPOS_RISCO_ORDEM.filter((grupo) => gruposVisiveis.has(grupo))
    .map((grupo) => ({
      grupo,
      fundos: base
        .filter((f) => (f.grupoRisco || SEM_GRUPO) === grupo)
        .sort((a, b) => (rankRentabilidade(b) ?? -Infinity) - (rankRentabilidade(a) ?? -Infinity)),
    }))
    .filter((secao) => secao.fundos.length > 0);
}

// Achatada, só pros cartões de resumo/comparador no modo "grupo" (mesma
// base filtrada + só os grupos visíveis, sem quebrar em seções) — seção 4
// do adendo: "os cartões de resumo devem refletir só os grupos marcados
// como visíveis".
export function fundosNosGruposVisiveis() {
  const { gruposVisiveis } = state.filtro;
  return fundosNaBaseFiltrada().filter((f) => gruposVisiveis.has(f.grupoRisco || SEM_GRUPO));
}
