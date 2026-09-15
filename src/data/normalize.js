// rentabilidade_desde_entrada = (preco_atual − preco_entrada) / preco_entrada
// (especificação seção 4). Nunca calculada para fundos pendentes de correção
// ou sem preço de entrada conhecido.
export function calcularRentabilidade(fundo) {
  if (fundo.pendenteCorrecao || fundo.precoEntrada == null || fundo.precoEntrada === 0) {
    return null;
  }
  return ((fundo.precoAtual - fundo.precoEntrada) / fundo.precoEntrada) * 100;
}
