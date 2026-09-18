// Os 20 grupos de risco da planilha original "Fundos Recomendados" (adendo
// "grupos-de-risco"), do mais seguro pro mais arriscado, mais "Sem grupo"
// (fundo que não se encaixa em nenhum dos 20) sempre por último. Fica em
// src/ (não em api/_lib/) pelo mesmo motivo de src/lib/admins.js: sem etapa
// de build, é o único jeito do cliente E do servidor importarem a mesma
// lista sem duplicar.
export const SEM_GRUPO = "Sem grupo";

export const GRUPOS_RISCO_ORDEM = [
  "RF - CDI LIQ DIÁRIA",
  "RF - SELIC LIQ DIÁRIA",
  "RF - CDI BANCÁRIOS",
  "RF - CDI HIGH GRADE",
  "RF - HIGH GRADE ISENTO CDI",
  "RF - HIGH GRADE",
  "RF - PRE ISENTO",
  "RF - PRE",
  "RF - IPCA+ ISENTO",
  "RF - IPCA+",
  "RF - EXTERIOR",
  "ALTERNATIVOS - FIDCS S/ COME COTAS",
  "MULTIMERCADO MACRO",
  "AÇÕES BR - LONG/SHORT",
  "AÇÕES BR - LONG ONLY",
  "AÇÕES BR - LONG BIASED",
  "AÇÕES BR - SMALL CAPS",
  "AÇÕES EUA",
  "ALTERNATIVOS",
  "CRIPTOMOEDAS",
  SEM_GRUPO,
];
