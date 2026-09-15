import AdmZip from "adm-zip";

// Fontes de dados públicos da CVM (ver especificação seção 6). Sem chave de
// API, mas sem CORS liberado para navegador — por isso essas funções só
// rodam no servidor (funções da Vercel), nunca no client.

const INFORME_DIARIO_BASE = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS";
// A CVM mantém dois cadastros em paralelo (reforma de 2023-24, fundos com
// estrutura de classes de cotas):
//  - registro_fundo_classe.zip: o atual. CNPJ_Classe é o mesmo CNPJ usado no
//    Informe Diário (CNPJ_FUNDO_CLASSE) — é por aqui que fundos novos entram.
//  - cad_fi.csv: cadastro legado, cobre fundos mais antigos que não migraram.
// Um fundo pode existir só num dos dois — por isso juntamos os dois.
const REGISTRO_CLASSE_ZIP_URL = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip";
const CADASTRO_LEGADO_URL = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv";

function normalizeCnpj(cnpj) {
  return (cnpj || "").replace(/\D/g, "");
}

function formatCnpj(digits) {
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

// Cache em memória do processo: sobrevive entre chamadas na mesma instância
// "quente" da função serverless, mas não é garantido (cold start limpa
// tudo). É só uma otimização best-effort, não uma fonte de verdade.
let cadastroCache = null;
let cadastroCacheAt = 0;
const CADASTRO_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function parseDelimited(text) {
  const lines = text.split("\n");
  const header = lines[0].replace(/\r$/, "").split(";");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line) continue;
    rows.push(line.split(";"));
  }
  return { header, rows };
}

async function fetchRegistroAtual() {
  const res = await fetch(REGISTRO_CLASSE_ZIP_URL);
  if (!res.ok) throw new Error(`Falha ao baixar registro CVM (classes): HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);

  const fundoEntry = zip.getEntries().find((e) => e.entryName === "registro_fundo.csv");
  const classeEntry = zip.getEntries().find((e) => e.entryName === "registro_classe.csv");
  if (!fundoEntry || !classeEntry) throw new Error("ZIP de registro CVM sem os CSVs esperados.");

  const { header: hFundo, rows: rFundo } = parseDelimited(fundoEntry.getData().toString("latin1"));
  const idxFundoId = hFundo.indexOf("ID_Registro_Fundo");
  const idxFundoAdmin = hFundo.indexOf("Administrador");
  const adminPorFundoId = new Map();
  for (const cols of rFundo) {
    adminPorFundoId.set(cols[idxFundoId], (cols[idxFundoAdmin] || "").trim());
  }

  const { header: hClasse, rows: rClasse } = parseDelimited(classeEntry.getData().toString("latin1"));
  const idxClasseCnpj = hClasse.indexOf("CNPJ_Classe");
  const idxClasseNome = hClasse.indexOf("Denominacao_Social");
  const idxClasseSit = hClasse.indexOf("Situacao");
  const idxClasseClassif = hClasse.indexOf("Classificacao");
  const idxClasseFundoId = hClasse.indexOf("ID_Registro_Fundo");

  const map = new Map();
  for (const cols of rClasse) {
    const cnpjDigits = normalizeCnpj(cols[idxClasseCnpj]);
    if (!cnpjDigits) continue;
    const existing = map.get(cnpjDigits);
    if (existing && existing.situacao === "Em Funcionamento Normal") continue;
    map.set(cnpjDigits, {
      cnpj: formatCnpj(cnpjDigits),
      nome: (cols[idxClasseNome] || "").trim(),
      instituicao: adminPorFundoId.get(cols[idxClasseFundoId]) || "",
      classeCvm: (cols[idxClasseClassif] || "").trim(),
      situacao: (cols[idxClasseSit] || "").trim(),
    });
  }
  return map;
}

async function fetchCadastroLegado() {
  const res = await fetch(CADASTRO_LEGADO_URL);
  if (!res.ok) throw new Error(`Falha ao baixar cadastro legado CVM: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { header, rows } = parseDelimited(buf.toString("latin1"));
  const idxCnpj = header.indexOf("CNPJ_FUNDO");
  const idxNome = header.indexOf("DENOM_SOCIAL");
  const idxAdmin = header.indexOf("ADMIN");
  const idxClasse = header.indexOf("CLASSE");
  const idxSit = header.indexOf("SIT");

  const map = new Map();
  for (const cols of rows) {
    const cnpjDigits = normalizeCnpj(cols[idxCnpj]);
    if (!cnpjDigits) continue;
    const existing = map.get(cnpjDigits);
    if (existing && existing.situacao === "EM FUNCIONAMENTO NORMAL") continue;
    map.set(cnpjDigits, {
      cnpj: formatCnpj(cnpjDigits),
      nome: (cols[idxNome] || "").trim(),
      instituicao: (cols[idxAdmin] || "").trim(),
      classeCvm: (cols[idxClasse] || "").trim(),
      situacao: (cols[idxSit] || "").trim(),
    });
  }
  return map;
}

export async function fetchCadastro() {
  if (cadastroCache && Date.now() - cadastroCacheAt < CADASTRO_TTL_MS) {
    return cadastroCache;
  }

  // Registro atual (por classe) primeiro — é o que cobre fundos novos, e o
  // CNPJ ali bate com o que aparece no Informe Diário. Cadastro legado
  // preenche o que faltar (fundos antigos que não migraram de sistema).
  const [atual, legado] = await Promise.all([
    fetchRegistroAtual().catch((e) => {
      console.error("Falha ao buscar registro atual da CVM:", e.message);
      return new Map();
    }),
    fetchCadastroLegado().catch((e) => {
      console.error("Falha ao buscar cadastro legado da CVM:", e.message);
      return new Map();
    }),
  ]);

  const map = new Map(legado);
  for (const [cnpj, registro] of atual) map.set(cnpj, registro);

  cadastroCache = map;
  cadastroCacheAt = Date.now();
  return map;
}

// Mapeia a classe oficial da CVM para as categorias usadas no app (seção 4
// da especificação). Aproximação: o app permite o administrador corrigir
// pelo "Editar dados do fundo" se a classe não bater exatamente.
export function classeCvmParaCategoria(classeCvm) {
  const c = (classeCvm || "").toUpperCase();
  if (c.includes("AÇÕES") || c.includes("ACOES")) return "Renda Variável Brasil";
  if (c.includes("MULTIMERCADO")) return "Multimercados";
  if (c.includes("CAMBIAL") || c.includes("EXTERIOR")) return "Global Renda Fixa";
  return "Renda Fixa Brasil";
}

function monthKey(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function adjacentMonth(key, delta) {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(4, 6)) + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}${String(m).padStart(2, "0")}`;
}

const informeCache = new Map(); // monthKey -> Map(cnpjDigits -> [{data, vlQuota}])
const informeCacheAt = new Map();
const INFORME_TTL_MS = 60 * 60 * 1000; // 1h (o arquivo do mês corrente muda todo dia útil)

async function fetchInformeMes(key) {
  const cached = informeCache.get(key);
  if (cached && Date.now() - (informeCacheAt.get(key) || 0) < INFORME_TTL_MS) {
    return cached;
  }

  const url = `${INFORME_DIARIO_BASE}/inf_diario_fi_${key}.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    // Mês sem arquivo publicado ainda (ex: mês corrente muito cedo) ou fora
    // do intervalo coberto pela CVM.
    const empty = new Map();
    informeCache.set(key, empty);
    informeCacheAt.set(key, Date.now());
    return empty;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(".csv"));
  if (!entry) throw new Error(`ZIP da CVM sem CSV dentro: ${key}`);
  const text = entry.getData().toString("utf8");

  const lines = text.split("\n");
  const header = lines[0].split(";");
  const idxCnpj = header.indexOf("CNPJ_FUNDO_CLASSE");
  const idxData = header.indexOf("DT_COMPTC");
  const idxQuota = header.indexOf("VL_QUOTA");
  const idxSubclasse = header.indexOf("ID_SUBCLASSE");

  const byCnpj = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(";");
    const cnpjDigits = normalizeCnpj(cols[idxCnpj]);
    if (!cnpjDigits) continue;
    if (cols[idxSubclasse]) continue; // fica só com a classe principal
    const entryData = { data: cols[idxData], vlQuota: parseFloat(cols[idxQuota]) };
    if (!byCnpj.has(cnpjDigits)) byCnpj.set(cnpjDigits, []);
    byCnpj.get(cnpjDigits).push(entryData);
  }

  informeCache.set(key, byCnpj);
  informeCacheAt.set(key, Date.now());
  return byCnpj;
}

// Busca a cota de um fundo o mais próxima possível da data pedida (exata
// quando existe pregão; senão a mais próxima dentro de +-10 dias, olhando
// também o mês anterior/seguinte perto da virada do mês).
export async function buscarCotaPorCnpjData(cnpj, dataISO) {
  const cnpjDigits = normalizeCnpj(cnpj);
  const alvo = new Date(dataISO);
  const key = monthKey(alvo);

  const linhas = [];
  for (const delta of [-1, 0, 1]) {
    const mapa = await fetchInformeMes(adjacentMonth(key, delta));
    const rows = mapa.get(cnpjDigits);
    if (rows) linhas.push(...rows);
  }
  if (!linhas.length) return null;

  let melhor = null;
  let melhorDiff = Infinity;
  for (const linha of linhas) {
    const d = new Date(linha.data);
    const diff = Math.abs(d.getTime() - alvo.getTime());
    if (diff < melhorDiff) {
      melhorDiff = diff;
      melhor = linha;
    }
  }
  const diffDias = melhorDiff / 86400000;
  if (diffDias > 10) return null;

  return { data: melhor.data, cota: melhor.vlQuota, aproximado: diffDias > 0.5, diffDias: Math.round(diffDias) };
}

// Busca a cota mais recente disponível (para atualizar preco_atual todo
// dia). Tenta o mês corrente; se não achar nada ainda (ex: começo do mês),
// cai pro mês anterior.
export async function buscarCotaMaisRecente(cnpj) {
  const cnpjDigits = normalizeCnpj(cnpj);
  const hoje = new Date();
  const key = monthKey(hoje);

  for (const delta of [0, -1]) {
    const mapa = await fetchInformeMes(adjacentMonth(key, delta));
    const rows = mapa.get(cnpjDigits);
    if (rows && rows.length) {
      const ultimo = rows.reduce((a, b) => (a.data > b.data ? a : b));
      return { data: ultimo.data, cota: ultimo.vlQuota };
    }
  }
  return null;
}

export { normalizeCnpj, formatCnpj };
