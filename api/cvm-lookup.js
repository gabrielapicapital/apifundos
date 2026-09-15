import { fetchCadastro, classeCvmParaCategoria, buscarCotaPorCnpjData, buscarPrimeiraCotaAposData, normalizeCnpj } from "./_lib/cvm.js";

// GET /api/cvm-lookup?cnpj=12345678000190&data=2026-09-10
// Usado pelo modal "Adicionar fundo": busca nome/instituição/categoria no
// cadastro da CVM e a cota na data informada. Só cobre fundos e FIDCs
// registrados na CVM — ETFs não têm CNPJ nesse cadastro (usam ticker; ver
// especificação seção 6) e não são cobertos aqui.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }

  const cnpjDigits = normalizeCnpj(req.query.cnpj);
  const data = req.query.data;
  if (cnpjDigits.length !== 14) {
    res.status(400).json({ error: "CNPJ incompleto — informe os 14 números." });
    return;
  }
  if (!data) {
    res.status(400).json({ error: "Informe a data da compra." });
    return;
  }

  try {
    // Cadastro (nome/instituição) e cota vêm de arquivos diferentes da CVM —
    // buscar os dois ao mesmo tempo em vez de um depois do outro.
    const [cadastro, cotaInfo] = await Promise.all([
      fetchCadastro(),
      buscarCotaPorCnpjData(cnpjDigits, data),
    ]);
    const registro = cadastro.get(cnpjDigits);
    if (!registro) {
      res.status(404).json({ error: "CNPJ não encontrado no cadastro de fundos da CVM." });
      return;
    }

    // Não achou cota perto da data pedida: pode ser só um buraco (feriado
    // prolongado) ou a data ser anterior ao início do fundo. Procura a
    // primeira cota disponível a partir dali pra diferenciar os dois casos e
    // já sugerir a data certa em vez de só dizer "não achei".
    let primeiraDisponivel = null;
    if (!cotaInfo) {
      primeiraDisponivel = await buscarPrimeiraCotaAposData(cnpjDigits, data);
    }

    res.status(200).json({
      nome: registro.nome,
      instituicao: registro.instituicao,
      categoria: classeCvmParaCategoria(registro.classeCvm),
      cota: cotaInfo ? cotaInfo.cota : null,
      dataCota: cotaInfo ? cotaInfo.data : null,
      aproximado: cotaInfo ? cotaInfo.aproximado : null,
      primeiraDisponivel,
    });
  } catch (err) {
    res.status(502).json({ error: `Falha ao consultar a CVM: ${err.message}` });
  }
}
