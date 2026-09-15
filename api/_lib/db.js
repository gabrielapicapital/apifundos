import { neon } from "@neondatabase/serverless";

// process.env.DATABASE_URL vem da integração Neon conectada no painel da
// Vercel (Storage). Nunca commitar essa string — ela só existe como variável
// de ambiente na Vercel (e localmente em .env, git-ignorado).
export const sql = neon(process.env.DATABASE_URL);
