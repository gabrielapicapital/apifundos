import AdmZip from "adm-zip";
import { normalizeCnpj } from "./cvm.js";

// Composição da carteira — dataset CDA (Composição e Diversificação das
// Aplicações) da CVM, público: dados.cvm.gov.br/dataset/fi-doc-cda (ver
// adendo "estrutura-dados-completa", seção 6). Um arquivo ZIP por
// competência (mês), com um CSV por "bloco" de tipo de ativo — mesmas 15
// primeiras colunas em todos os blocos, o que importa aqui é
// CNPJ_FUNDO_CLASSE (pra filtrar) e VL_MERC_POS_FINAL (valor de mercado da
// posição final naquele ativo).
const CDA_BASE = "https://dados.cvm.gov.br/dados/FI/DOC/CDA/DADOS";

export const BLOCOS_CDA = {
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

// Baixa a competência mais recente do CDA (um ZIP só, ~20-30MB) e acumula,
// bloco a bloco, o valor de mercado (VL_MERC_POS_FINAL) de cada CNPJ do
// conjunto pedido — processa os 8 blocos de uma vez pra todos os fundos,
// bem mais barato que baixar o ZIP inteiro (200MB+ descomprimido) por fundo.
//
// cnpjsDigits: Set de CNPJs (só dígitos) que interessam.
// Retorna: { competencia: "YYYY-MM-DD", porCnpj: Map<cnpjDigits, {blocos: [{bloco,nome,valor}], totalGeral}> }
export async function buscarComposicaoLote(cnpjsDigits) {
  const key = await mesCompetenciaCdaMaisRecente();
  if (!key) return { competencia: null, porCnpj: new Map() };

  const res = await fetch(`${CDA_BASE}/cda_fi_${key}.zip`);
  if (!res.ok) throw new Error(`Falha ao baixar CDA ${key}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);

  // cnpjDigits -> { bloco(num) -> valor, competencia }
  const acumulado = new Map();
  for (const digits of cnpjsDigits) acumulado.set(digits, { blocos: new Map(), competencia: null });

  for (let bloco = 1; bloco <= 8; bloco++) {
    const entry = zip.getEntries().find((e) => e.entryName === `cda_fi_BLC_${bloco}_${key}.csv`);
    if (!entry) continue;

    const texto = entry.getData().toString("latin1");
    const linhas = texto.split("\n");
    const header = linhas[0].replace(/\r$/, "").split(";");
    const idxCnpj = header.indexOf("CNPJ_FUNDO_CLASSE");
    const idxData = header.indexOf("DT_COMPTC");
    const idxValor = header.indexOf("VL_MERC_POS_FINAL");

    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i];
      if (!linha) continue;
      const cols = linha.split(";");
      const digits = normalizeCnpj(cols[idxCnpj]);
      const alvo = acumulado.get(digits);
      if (!alvo) continue; // fundo fora do conjunto pedido

      const valor = parseFloat(cols[idxValor]);
      if (!Number.isFinite(valor)) continue;
      alvo.blocos.set(bloco, (alvo.blocos.get(bloco) || 0) + valor);
      if (!alvo.competencia) alvo.competencia = (cols[idxData] || "").trim() || null;
    }
  }

  const porCnpj = new Map();
  for (const [digits, { blocos, competencia }] of acumulado) {
    const totalGeral = [...blocos.values()].reduce((a, b) => a + b, 0);
    if (!blocos.size || totalGeral === 0) continue; // fundo não encontrado no CDA dessa competência

    const lista = Object.entries(BLOCOS_CDA).map(([num, nome]) => {
      const valor = blocos.get(Number(num)) || 0;
      return { bloco: Number(num), nome, valor, percentual: (valor / totalGeral) * 100 };
    });
    porCnpj.set(digits, { competencia, totalGeral, blocos: lista });
  }

  return { competencia: key, porCnpj };
}
