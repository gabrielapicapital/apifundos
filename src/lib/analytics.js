// Cálculos derivados da lista filtrada atual (cartões de resumo).
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
