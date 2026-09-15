import { sql } from "./db.js";
import { fetchInformeMes, mesesEntre, normalizeCnpj } from "./cvm.js";
import { buscarSerieYahoo, buscarCdiSerieIndice } from "./mercado.js";
import { buscarSerieFidcMensal } from "./cvmFidc.js";

// Lógica compartilhada entre o backfill em lote (api/backfill-historico.js,
// todos os fundos de uma vez) e o backfill de um fundo só, disparado na hora
// em que ele é cadastrado (api/fundos/[id]/backfill.js).

export const BENCHMARK_POR_CATEGORIA = {
  "Renda Fixa Brasil": "CDI",
  Multimercados: "CDI",
  "Global Renda Fixa": "CDI",
  "Renda Variável Brasil": "Ibovespa",
  "Global Renda Variável": "S&P 500",
};

export const TICKER_BENCHMARK = { CDI: null, Ibovespa: "^BVSP", "S&P 500": "^GSPC" };

// Profundidade máxima do backfill: os últimos 13 meses (ver adendo
// "rentabilidade-periodo-benchmark", seção 3 — cobre a janela de 12 meses +
// folga). Fundo adicionado há mais tempo que isso começa o gráfico nesse
// ponto, não na data de entrada real; ainda assim é dado 100% real, só que
// truncado — bem diferente do "exemplo ilustrativo" anterior.
export const PROFUNDIDADE_MESES = 13;
const LOTE = 300; // linhas por transação — reduz de "1 round-trip por linha" pra "1 a cada 300"

export function limitarInicio(dataAdicaoISO, hojeISO) {
  const hoje = new Date(hojeISO);
  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - PROFUNDIDADE_MESES);
  const entrada = new Date(dataAdicaoISO);
  return entrada > limite ? dataAdicaoISO : limite.toISOString().slice(0, 10);
}

export async function gravarHistoricoEmLotes(linhas) {
  // linhas: [{fundoId, data, preco}]
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await sql.transaction(
      lote.map(
        (l) => sql`
          INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${l.fundoId}, ${l.data}, ${l.preco})
          ON CONFLICT (fundo_id, data) DO UPDATE SET preco = EXCLUDED.preco
        `
      )
    );
    gravados += lote.length;
  }
  return gravados;
}

export async function gravarBenchmarkEmLotes(benchmark, pontos) {
  let gravados = 0;
  for (let i = 0; i < pontos.length; i += LOTE) {
    const lote = pontos.slice(i, i + LOTE);
    await sql.transaction(
      lote.map(
        (p) => sql`
          INSERT INTO benchmark_historico (benchmark, data, valor) VALUES (${benchmark}, ${p.data}, ${p.valor})
          ON CONFLICT (benchmark, data) DO UPDATE SET valor = EXCLUDED.valor
        `
      )
    );
    gravados += lote.length;
  }
  return gravados;
}

// Baixa os meses de Informe Diário necessários para cobrir `alvoCvm` (um ou
// vários fundos Fundo/FIDC), baixando cada mês uma única vez e distribuindo
// as linhas pra todos os fundos que precisam dele. Retorna as linhas prontas
// pra gravar + qual foi a cota mais recente de cada fundo (pra atualizar
// preco_atual) — não grava nada sozinho, quem chama decide quando gravar.
export async function coletarHistoricoCvm(alvoCvm, hoje, erros, concorrencia = 6) {
  const linhasParaGravar = [];
  const ultimaCotaPorFundo = new Map(); // fundoId -> {data, cota}
  if (!alvoCvm.length) return { linhasParaGravar, ultimaCotaPorFundo };

  const inicioMaisAntigo = alvoCvm.reduce((min, f) => (f.inicio < min ? f.inicio : min), alvoCvm[0].inicio);
  const meses = mesesEntre(inicioMaisAntigo, hoje);

  for (let i = 0; i < meses.length; i += concorrencia) {
    const lote = meses.slice(i, i + concorrencia);
    const mapas = await Promise.all(
      lote.map((mes) =>
        fetchInformeMes(mes)
          .then((m) => ({ mes, m }))
          .catch((err) => {
            erros.push({ mes, erro: err.message });
            return { mes, m: new Map() };
          })
      )
    );
    for (const { m: mapaMes } of mapas) {
      for (const f of alvoCvm) {
        const cnpjDigits = normalizeCnpj(f.cnpjOuTicker);
        const linhas = mapaMes.get(cnpjDigits);
        if (!linhas) continue;
        for (const l of linhas) {
          if (l.data >= f.inicio && l.data <= hoje) {
            linhasParaGravar.push({ fundoId: f.id, data: l.data, preco: l.vlQuota });
            const atual = ultimaCotaPorFundo.get(f.id);
            if (!atual || l.data > atual.data) ultimaCotaPorFundo.set(f.id, { data: l.data, cota: l.vlQuota });
          }
        }
      }
    }
  }

  // A maioria dos FIDCs não publica Informe Diário — pra esses, o Informe
  // Mensal (ver cvmFidc.js) é o último recurso: série mais esparsa (um ponto
  // por mês, com atraso de publicação de vários meses), mas ainda é dado
  // real, não ilustrativo.
  const fidcsSemDado = alvoCvm.filter((f) => f.tipo === "FIDC" && !ultimaCotaPorFundo.has(f.id));
  for (const f of fidcsSemDado) {
    try {
      const serie = await buscarSerieFidcMensal(f.cnpjOuTicker, f.inicio, hoje);
      for (const p of serie) {
        if (p.data >= f.inicio && p.data <= hoje) {
          linhasParaGravar.push({ fundoId: f.id, data: p.data, preco: p.valor });
          const atual = ultimaCotaPorFundo.get(f.id);
          if (!atual || p.data > atual.data) ultimaCotaPorFundo.set(f.id, { data: p.data, cota: p.valor });
        }
      }
    } catch (err) {
      erros.push({ fundo: f.id, erro: err.message });
    }
  }

  return { linhasParaGravar, ultimaCotaPorFundo };
}

// Mesma ideia para ETFs, via Yahoo Finance (uma chamada leve por ticker).
// buscarSerieYahoo já descarta o "patamar" inicial espúrio (ver comentário
// lá) quando a Yahoo não tem dado real desde a data pedida — por isso a
// série pode começar bem depois de `f.inicio`. `primeiraDataValidaPorFundo`
// devolve onde ela realmente começou, pra quem chamar poder limpar linhas
// antigas (do patamar) que já tinham sido gravadas por um backfill anterior.
export async function coletarHistoricoEtf(alvoEtf, hoje, erros) {
  const linhasParaGravar = [];
  const ultimaCotaPorFundo = new Map();
  const primeiraDataValidaPorFundo = new Map();

  const series = await Promise.all(
    alvoEtf.map((f) =>
      buscarSerieYahoo(f.cnpjOuTicker, f.inicio, hoje)
        .then((serie) => ({ f, serie }))
        .catch((err) => {
          erros.push({ fundo: f.id, erro: err.message });
          return { f, serie: [] };
        })
    )
  );
  for (const { f, serie } of series) {
    if (serie.length) primeiraDataValidaPorFundo.set(f.id, serie[0].data);
    for (const p of serie) {
      linhasParaGravar.push({ fundoId: f.id, data: p.data, preco: p.valor });
      const atual = ultimaCotaPorFundo.get(f.id);
      if (!atual || p.data > atual.data) ultimaCotaPorFundo.set(f.id, { data: p.data, cota: p.valor });
    }
  }

  return { linhasParaGravar, ultimaCotaPorFundo, primeiraDataValidaPorFundo };
}

// Remove linhas antigas de historico_precos que ficaram desatualizadas ou
// erradas de uma busca anterior (ex: o "patamar" espúrio da Yahoo, ver
// buscarSerieYahoo) — preserva o ponto na data de adição do fundo, que
// representa a cota real conhecida naquele dia mesmo quando é anterior ao
// início validado agora.
export async function limparHistoricoAntesDe(fundoId, dataLimiteISO, dataAdicaoISO) {
  await sql`
    DELETE FROM historico_precos
    WHERE fundo_id = ${fundoId} AND data < ${dataLimiteISO} AND data != ${dataAdicaoISO}
  `;
}

// Busca (e grava) o histórico de um benchmark só se ainda não tiver
// cobertura suficiente pro intervalo pedido — evita rebaixar a API do Banco
// Central/Yahoo de novo toda vez que um fundo novo é cadastrado.
export async function garantirBenchmark(benchmark, inicioISO, hoje, erros) {
  const cobertura = await sql`
    SELECT MIN(data) AS min_data, COUNT(*) AS total FROM benchmark_historico WHERE benchmark = ${benchmark}
  `;
  const minData = cobertura[0]?.min_data ? cobertura[0].min_data.toISOString().slice(0, 10) : null;
  if (minData && minData <= inicioISO && Number(cobertura[0].total) > 0) {
    return 0; // já cobre o período pedido, não precisa buscar de novo
  }

  try {
    const serie =
      benchmark === "CDI"
        ? await buscarCdiSerieIndice(inicioISO, hoje)
        : await buscarSerieYahoo(TICKER_BENCHMARK[benchmark], inicioISO, hoje);
    return await gravarBenchmarkEmLotes(benchmark, serie);
  } catch (err) {
    erros.push({ benchmark, erro: err.message });
    return 0;
  }
}
