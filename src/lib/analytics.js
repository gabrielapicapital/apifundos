// Cálculos derivados da lista filtrada atual (cartões de resumo + comparador).
// Espelha exatamente a lógica validada no protótipo (seção 5 da especificação).

export function resumo(lista) {
  const validos = lista.filter((f) => !f.pendenteCorrecao);
  const positivos = validos.filter((f) => f.rentabilidadePct >= 0).length;
  const negativos = validos.filter((f) => f.rentabilidadePct < 0).length;
  const pendentes = lista.filter((f) => f.pendenteCorrecao).length;
  const rentabilidadeMedia = validos.length
    ? validos.reduce((soma, f) => soma + f.rentabilidadePct, 0) / validos.length
    : null;

  return { total: lista.length, rentabilidadeMedia, positivos, negativos, pendentes, validos };
}

export function comparador(validos, n = 5) {
  const ranked = [...validos].sort((a, b) => b.rentabilidadePct - a.rentabilidadePct);
  return {
    melhores: ranked.slice(0, n),
    piores: ranked.slice(-n).reverse(),
    maxAbs: Math.max(1, ...validos.map((f) => Math.abs(f.rentabilidadePct))),
  };
}
