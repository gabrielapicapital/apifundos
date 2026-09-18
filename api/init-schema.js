import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";

// Rota de uso único (ou repetível sem risco: tudo "IF NOT EXISTS"). Cria as
// tabelas do zero. Protegida por e-mail de administrador.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  await sql`
    CREATE TABLE IF NOT EXISTS fundos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      instituicao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      cnpj_ou_ticker TEXT,
      data_adicao DATE,
      preco_entrada NUMERIC,
      preco_atual NUMERIC NOT NULL,
      quantidade_cotas NUMERIC NOT NULL,
      patrimonio NUMERIC NOT NULL,
      pendente_correcao BOOLEAN NOT NULL DEFAULT false,
      diagnostico TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS historico_precos (
      id SERIAL PRIMARY KEY,
      fundo_id TEXT NOT NULL REFERENCES fundos(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      preco NUMERIC NOT NULL,
      UNIQUE (fundo_id, data)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS historico_precos_fundo_id_idx ON historico_precos (fundo_id)`;

  // ETFs são identificados por ticker em cnpj_ou_ticker (usado pra buscar
  // cotação no Yahoo Finance, ver api/_lib/mercado.js) — mas também são
  // fundos regulados pela CVM, com CNPJ próprio, que não pode ir no mesmo
  // campo sem quebrar essa busca. cnpj_cvm guarda esse CNPJ (só quando
  // confirmado contra o cadastro oficial da CVM), pra ETFs também poderem
  // ter cadastro completo, cotistas e composição de carteira.
  await sql`ALTER TABLE fundos ADD COLUMN IF NOT EXISTS cnpj_cvm TEXT`;

  // Diagnóstico do time de Asset virou um histórico com autoria (adendo
  // "diagnostico-asset-e-admins"), não mais um campo único que se
  // sobrescreve — cada registro é {data, autorEmail, autorNome, texto},
  // empilhados em ordem cronológica. A coluna antiga "diagnostico" (TEXT)
  // fica pra trás, mas se já tinha algo escrito, vira o primeiro registro
  // do histórico em vez de simplesmente sumir.
  await sql`ALTER TABLE fundos ADD COLUMN IF NOT EXISTS diagnostico_historico JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`
    UPDATE fundos
    SET diagnostico_historico = jsonb_build_array(
      jsonb_build_object(
        'data', to_char(COALESCE(atualizado_em, criado_em, now()), 'YYYY-MM-DD'),
        'autorEmail', null,
        'autorNome', null,
        'texto', diagnostico
      )
    )
    WHERE diagnostico IS NOT NULL AND trim(diagnostico) != '' AND diagnostico_historico = '[]'::jsonb
  `;

  // Série histórica dos benchmarks (CDI, Ibovespa, S&P 500, IPCA) — "valor"
  // é sempre um número-índice comparável (nível acumulado), não uma taxa.
  // Para o CDI/IPCA isso é a taxa composta a partir de uma base 100.
  await sql`
    CREATE TABLE IF NOT EXISTS benchmark_historico (
      benchmark TEXT NOT NULL,
      data DATE NOT NULL,
      valor NUMERIC NOT NULL,
      PRIMARY KEY (benchmark, data)
    )
  `;

  // Cadastro completo da CVM (adendo "estrutura-dados-completa") — 1:1 com
  // fundos, atualizado por api/sincronizar-cadastro.js. Nunca inventa um
  // campo: fica NULL quando a CVM não publica aquele dado pro fundo.
  await sql`
    CREATE TABLE IF NOT EXISTS fundos_cadastro (
      fundo_id TEXT PRIMARY KEY REFERENCES fundos(id) ON DELETE CASCADE,
      codigo_cvm TEXT,
      data_registro DATE,
      data_constituicao DATE,
      primeira_cota DATE,
      situacao TEXT,
      classificacao_cvm TEXT,
      classificacao_anbima TEXT,
      tipo_classe TEXT,
      indicador_desempenho TEXT,
      permite_offshore BOOLEAN,
      forma_condominio TEXT,
      tributacao_longo_prazo BOOLEAN,
      publico_alvo TEXT,
      exclusivo BOOLEAN,
      administrador TEXT,
      gestor TEXT,
      patrimonio_liquido NUMERIC,
      data_patrimonio_liquido DATE,
      numero_cotistas INTEGER,
      data_numero_cotistas DATE,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Composição da carteira (dataset CDA da CVM, ver api/_lib/cda.js e adendo
  // "estrutura-dados-completa" seção 6) — 1:1 com fundos, atualizado por
  // api/sincronizar-composicao.js. "blocos" é o array [{bloco, nome, valor,
  // percentual}] já calculado; sem linha aqui = ainda não sincronizado.
  await sql`
    CREATE TABLE IF NOT EXISTS fundos_composicao (
      fundo_id TEXT PRIMARY KEY REFERENCES fundos(id) ON DELETE CASCADE,
      competencia DATE,
      total_geral NUMERIC,
      blocos JSONB NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  res.status(200).json({ ok: true });
}
