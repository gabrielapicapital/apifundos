// Confere o e-mail do administrador no servidor, contra a allowlist
// configurada em ADMIN_EMAILS (variável de ambiente da Vercel, lista de
// e-mails separados por vírgula). Isso é mais forte que a conferência só no
// navegador que já existia (ver src/config.js) — mas ainda não é OAuth de
// verdade: qualquer um que souber um e-mail da lista consegue chamar a API
// como se fosse aquele administrador. Login por OAuth continua sendo o
// próximo passo real (ver README).
export function isAdminAuthorized(req) {
  const raw = process.env.ADMIN_EMAILS || "";
  const allowlist = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const email = (req.headers["x-admin-email"] || "").toString().trim().toLowerCase();
  return email.length > 0 && allowlist.includes(email);
}

export function requireAdmin(req, res) {
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ error: "Não autorizado. E-mail de administrador ausente ou fora da allowlist." });
    return false;
  }
  return true;
}
