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

  // Série histórica dos benchmarks (CDI, Ibovespa, S&P 500) — "valor" é
  // sempre um número-índice comparável (nível acumulado), não uma taxa.
  // Para o CDI isso é (1 + taxa_diaria) composto a partir de uma base 100.
  await sql`
    CREATE TABLE IF NOT EXISTS benchmark_historico (
      benchmark TEXT NOT NULL,
      data DATE NOT NULL,
      valor NUMERIC NOT NULL,
      PRIMARY KEY (benchmark, data)
    )
  `;

  res.status(200).json({ ok: true });
}
