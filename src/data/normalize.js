// Formato interno de um fundo (ver especificação seção 4). O seed.json traz
// os campos em português já no formato definido pela especificação; aqui só
// adicionamos os campos que a versão inicial de dados não tinha ainda
// (cnpjOuTicker, diagnostico, historicoPrecos) e um id estável.

function slugify(nome, index) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "fundo"}-${index}`;
}

export function normalizeFundo(raw, index) {
  const historicoPrecos = [];
  if (raw.preco_entrada != null && raw.data_adicao) {
    historicoPrecos.push({ data: raw.data_adicao, preco: raw.preco_entrada });
  }

  return {
    id: slugify(raw.nome, index),
    nome: raw.nome,
    tipo: raw.tipo,
    instituicao: raw.instituicao,
    categoria: raw.categoria,
    // TODO(cvm): preencher via busca por CNPJ (fundos/FIDCs) ou ticker (ETFs)
    // quando a integração com CVM/B3 estiver pronta (ver README).
    cnpjOuTicker: raw.tipo === "ETF" ? raw.nome : null,
    dataAdicao: raw.data_adicao,
    precoEntrada: raw.preco_entrada,
    precoAtual: raw.preco_atual,
    quantidadeCotas: raw.quantidade_cotas,
    patrimonio: raw.patrimonio,
    pendenteCorrecao: raw.pendente_correcao,
    diagnostico: null,
    historicoPrecos,
  };
}

export async function loadSeedFundos() {
  const res = await fetch(new URL("./seed.json", import.meta.url));
  const seed = await res.json();
  return seed.map(normalizeFundo);
}

// rentabilidade_desde_entrada = (preco_atual − preco_entrada) / preco_entrada
// (especificação seção 4). Nunca calculada para fundos pendentes de correção
// ou sem preço de entrada conhecido.
export function calcularRentabilidade(fundo) {
  if (fundo.pendenteCorrecao || fundo.precoEntrada == null || fundo.precoEntrada === 0) {
    return null;
  }
  return ((fundo.precoAtual - fundo.precoEntrada) / fundo.precoEntrada) * 100;
}
