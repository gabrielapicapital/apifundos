import AdmZip from "adm-zip";
import { normalizeCnpj } from "./cvm.js";

// FIDCs não têm Informe Diário na CVM (ver api/_lib/cvm.js) — só um relatório
// MENSAL (Informe Mensal, tabela "X_2": cota por classe/série), publicado com
// atraso de vários meses (bem mais que o D-2/D-3 dos fundos comuns). Serve só
// como último recurso, quando o Informe Diário não tem nada pro CNPJ.
const INF_MENSAL_BASE = "https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS";

function monthKey(y, m) {
  return `${y}${String(m).padStart(2, "0")}`;
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
  return monthKey(y, m);
}

const informeMensalCache = new Map(); // monthKey -> Map(cnpjDigits -> {data, cota})
const informeMensalCacheAt = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — muda bem menos que o diário

async function fetchInformeMensalFidc(key) {
  const cached = informeMensalCache.get(key);
  if (cached && Date.now() - (informeMensalCacheAt.get(key) || 0) < CACHE_TTL_MS) {
    return cached;
  }

  const url = `${INF_MENSAL_BASE}/inf_mensal_fidc_${key}.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    const vazio = new Map();
    informeMensalCache.set(key, vazio);
    informeMensalCacheAt.set(key, Date.now());
    return vazio;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName === `inf_mensal_fidc_tab_X_2_${key}.csv`);
  if (!entry) {
    const vazio = new Map();
    informeMensalCache.set(key, vazio);
    informeMensalCacheAt.set(key, Date.now());
    return vazio;
  }
  const text = entry.getData().toString("latin1");
  const lines = text.split("\n");
  const header = lines[0].replace(/\r$/, "").split(";");
  const idxCnpj = header.indexOf("CNPJ_FUNDO_CLASSE");
  const idxData = header.indexOf("DT_COMPTC");
  const idxCota = header.indexOf("TAB_X_VL_COTA");

  // Um FIDC pode ter várias classes/séries (sênior, subordinada...) sob o
  // mesmo CNPJ, e é comum uma delas aparecer zerada (não é a que o
  // consultor de fato recomenda/segue) — fica com a de maior cota > 0.
  const byCnpj = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.replace(/\r$/, "").split(";");
    const cnpjDigits = normalizeCnpj(cols[idxCnpj]);
    if (!cnpjDigits) continue;
    const cota = parseFloat(cols[idxCota]);
    if (!cota || cota <= 0) continue;
    const atual = byCnpj.get(cnpjDigits);
    if (!atual || cota > atual.cota) {
      byCnpj.set(cnpjDigits, { data: cols[idxData], cota });
    }
  }

  informeMensalCache.set(key, byCnpj);
  informeMensalCacheAt.set(key, Date.now());
  return byCnpj;
}

// Cota mensal mais recente disponível — tenta vários meses pra trás porque o
// atraso de publicação de um FIDC pode passar de meia dúzia de meses.
export async function buscarCotaFidcMaisRecente(cnpj, limiteMeses = 12) {
  const cnpjDigits = normalizeCnpj(cnpj);
  let key = monthKey(new Date().getFullYear(), new Date().getMonth() + 1);
  for (let i = 0; i < limiteMeses; i++) {
    const mapa = await fetchInformeMensalFidc(key);
    const row = mapa.get(cnpjDigits);
    if (row) return row;
    key = adjacentMonth(key, -1);
  }
  return null;
}

// Cota mensal mais próxima de uma data (pra quando o admin sabe a data real
// de compra) — tenta o mês da data, depois vai alternando pra trás/frente.
export async function buscarCotaFidcPorData(cnpj, dataISO, folgaMeses = 6) {
  const cnpjDigits = normalizeCnpj(cnpj);
  const alvo = monthKey(Number(dataISO.slice(0, 4)), Number(dataISO.slice(5, 7)));
  const deltas = [0];
  for (let i = 1; i <= folgaMeses; i++) deltas.push(-i, i);

  for (const delta of deltas) {
    const key = adjacentMonth(alvo, delta);
    const mapa = await fetchInformeMensalFidc(key);
    const row = mapa.get(cnpjDigits);
    if (row) return row;
  }
  return null;
}

// Série de cotas mensais num intervalo — usada pelo backfill pra montar um
// gráfico (esparso, um ponto por mês) quando o FIDC não tem Informe Diário.
export async function buscarSerieFidcMensal(cnpj, dataInicialISO, dataFinalISO) {
  const cnpjDigits = normalizeCnpj(cnpj);
  const inicio = monthKey(Number(dataInicialISO.slice(0, 4)), Number(dataInicialISO.slice(5, 7)));
  const fim = monthKey(Number(dataFinalISO.slice(0, 4)), Number(dataFinalISO.slice(5, 7)));

  const pontos = [];
  let atual = inicio;
  let guard = 0;
  while (atual <= fim && guard < 60) {
    const mapa = await fetchInformeMensalFidc(atual);
    const row = mapa.get(cnpjDigits);
    if (row) pontos.push({ data: row.data, valor: row.cota });
    atual = adjacentMonth(atual, 1);
    guard++;
  }
  return pontos;
}
