import AdmZip from "adm-zip";
import { normalizeCnpj } from "./cvm.js";

// Composição da carteira — dataset CDA (Composição e Diversificação das
// Aplicações) da CVM, público: dados.cvm.gov.br/dataset/fi-doc-cda (ver
// adendo "estrutura-dados-completa", seção 6).
//
// O ZIP de uma competência tem dois grupos de arquivo, com colunas
// diferentes:
//  - cda_fi_BLC_1..8_AAAAMM.csv: fundos ICVM 555 "normais", um CSV por
//    bloco de tipo de ativo (Títulos Públicos, Cotas de Fundos, Swap...).
//  - cda_fie_AAAAMM.csv: fundos de índice (ETFs), FIDC e FIAGRO — não são
//    organizados em bloco fixo, a categoria do ativo vem na própria coluna
//    TP_APLIC de cada linha (nome CVM oficial, ex: "Investimento no
//    Exterior") — renomeado de cda_fiim_AAAAMM.csv em 15/11/2025, ver as
//    notas do dataset em dados.cvm.gov.br/dataset/fi-doc-cda.
// Em ambos, o que importa é CNPJ_FUNDO_CLASSE (pra filtrar) e
// VL_MERC_POS_FINAL (valor de mercado da posição final naquele ativo).
const CDA_BASE = "https://dados.cvm.gov.br/dados/FI/DOC/CDA/DADOS";

const NOME_BLOCO_FI = {
  1: "Títulos Públicos",
  2: "Cotas de Fundos",
  3: "Swap",
  4: "Demais ativos codificados",
  5: "Depósitos a prazo e outros títulos bancários",
  6: "Títulos do agronegócio e de crédito privado",
  7: "Investimento no exterior",
  8: "Demais ativos não codificados",
};

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

// A CVM publica a competência corrente com alguns dias de atraso — tenta o
// mês atual e recua até achar o primeiro ZIP que realmente existe.
export async function mesCompetenciaCdaMaisRecente() {
  let key = monthKey(new Date());
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${CDA_BASE}/cda_fi_${key}.zip`, { method: "HEAD" });
    if (res.ok) return key;
    key = adjacentMonth(key, -1);
  }
  return null;
}

function acumularArquivo({ zip, entryName, idxCnpjNome, idxValorNome, idxDataNome, categoriaDe, acumulado }) {
  const entry = zip.getEntries().find((e) => e.entryName === entryName);
  if (!entry) return;

  const texto = entry.getData().toString("latin1");
  const linhas = texto.split("\n");
  const header = linhas[0].replace(/\r$/, "").split(";");
  const idxCnpj = header.indexOf(idxCnpjNome);
  const idxData = header.indexOf(idxDataNome);
  const idxValor = header.indexOf(idxValorNome);
  const idxTpAplic = header.indexOf("TP_APLIC");

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha) continue;
    const cols = linha.split(";");
    const digits = normalizeCnpj(cols[idxCnpj]);
    const alvo = acumulado.get(digits);
    if (!alvo) continue; // fundo fora do conjunto pedido

    const valor = parseFloat(cols[idxValor]);
    if (!Number.isFinite(valor)) continue;
    const categoria = categoriaDe(cols, idxTpAplic);
    alvo.categorias.set(categoria, (alvo.categorias.get(categoria) || 0) + valor);
    if (!alvo.competencia) alvo.competencia = (cols[idxData] || "").trim() || null;
  }
}

// Baixa a competência mais recente do CDA (um ZIP só, ~20-30MB) e acumula
// o valor de mercado (VL_MERC_POS_FINAL) de cada CNPJ do conjunto pedido,
// por categoria de ativo — processa o ZIP inteiro de uma vez pra todos os
// fundos, bem mais barato que baixar 200MB+ descomprimidos por fundo.
//
// cnpjsDigits: Set de CNPJs (só dígitos) que interessam.
// Retorna: { competencia: "AAAAMM", porCnpj: Map<cnpjDigits, {competencia, totalGeral, blocos: [{nome,valor,percentual}]}> }
export async function buscarComposicaoLote(cnpjsDigits) {
  const key = await mesCompetenciaCdaMaisRecente();
  if (!key) return { competencia: null, porCnpj: new Map() };

  const res = await fetch(`${CDA_BASE}/cda_fi_${key}.zip`);
  if (!res.ok) throw new Error(`Falha ao baixar CDA ${key}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);

  const acumulado = new Map();
  for (const digits of cnpjsDigits) acumulado.set(digits, { categorias: new Map(), competencia: null });

  for (let bloco = 1; bloco <= 8; bloco++) {
    acumularArquivo({
      zip,
      entryName: `cda_fi_BLC_${bloco}_${key}.csv`,
      idxCnpjNome: "CNPJ_FUNDO_CLASSE",
      idxValorNome: "VL_MERC_POS_FINAL",
      idxDataNome: "DT_COMPTC",
      categoriaDe: () => NOME_BLOCO_FI[bloco],
      acumulado,
    });
  }

  // Fundos de índice (ETF), FIDC e FIAGRO: categoria vem da própria linha
  // (TP_APLIC), não é organizado em bloco por arquivo.
  acumularArquivo({
    zip,
    entryName: `cda_fie_${key}.csv`,
    idxCnpjNome: "CNPJ_FUNDO_CLASSE",
    idxValorNome: "VL_MERC_POS_FINAL",
    idxDataNome: "DT_COMPTC",
    categoriaDe: (cols, idxTpAplic) => (cols[idxTpAplic] || "").trim() || "Outros",
    acumulado,
  });

  const porCnpj = new Map();
  for (const [digits, { categorias, competencia }] of acumulado) {
    const totalGeral = [...categorias.values()].reduce((a, b) => a + b, 0);
    if (!categorias.size || totalGeral === 0) continue; // fundo não encontrado no CDA dessa competência

    const lista = [...categorias.entries()]
      .map(([nome, valor]) => ({ nome, valor, percentual: (valor / totalGeral) * 100 }))
      .sort((a, b) => b.valor - a.valor);
    porCnpj.set(digits, { competencia, totalGeral, blocos: lista });
  }

  return { competencia: key, porCnpj };
}
