import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "./_lib/db.js";
import { requireAdmin } from "./_lib/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// seed.json guarda data_adicao como "DD/MM/AAAA" (formato brasileiro); o
// Postgres precisa de "AAAA-MM-DD".
function paraDataISO(dataBR) {
  if (!dataBR) return null;
  const [d, m, y] = dataBR.split("/");
  return `${y}-${m}-${d}`;
}

function slugify(nome, index) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "fundo"}-${index}`;
}

// Rota de uso único: carrega os 84 ativos de src/data/seed.json pro banco.
// Protegida por e-mail de administrador. Não sobrescreve nada que já exista
// (ON CONFLICT DO NOTHING) — rodar de novo depois de já ter migrado não
// duplica nem apaga edições feitas via app.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" });
    return;
  }
  if (!requireAdmin(req, res)) return;

  const seedPath = join(__dirname, "..", "src", "data", "seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));

  let inseridos = 0;
  for (let i = 0; i < seed.length; i++) {
    const raw = seed[i];
    const id = slugify(raw.nome, i);
    const cnpjOuTicker = raw.tipo === "ETF" ? raw.nome : null;
    const dataAdicaoISO = paraDataISO(raw.data_adicao);

    const r = await sql`
      INSERT INTO fundos (id, nome, tipo, instituicao, categoria, cnpj_ou_ticker, data_adicao, preco_entrada, preco_atual, quantidade_cotas, patrimonio, pendente_correcao)
      VALUES (${id}, ${raw.nome}, ${raw.tipo}, ${raw.instituicao}, ${raw.categoria}, ${cnpjOuTicker}, ${dataAdicaoISO}, ${raw.preco_entrada}, ${raw.preco_atual}, ${raw.quantidade_cotas}, ${raw.patrimonio}, ${raw.pendente_correcao})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (r.length) {
      inseridos++;
      if (raw.preco_entrada != null && dataAdicaoISO) {
        await sql`INSERT INTO historico_precos (fundo_id, data, preco) VALUES (${id}, ${dataAdicaoISO}, ${raw.preco_entrada}) ON CONFLICT DO NOTHING`;
      }
    }
  }

  res.status(200).json({ totalNoSeed: seed.length, inseridos });
}
