import { isAdminEmail } from "../../src/lib/admins.js";

// Confere o e-mail do administrador no servidor, contra a lista fixa de
// administradores autorizados (ver src/lib/admins.js — única fonte de
// verdade, adendo "diagnostico-asset-e-admins" seção 5). Isso é mais forte
// que a conferência só no navegador que já existia (client: components/
// adminAuth.js) — mas ainda não é OAuth de verdade: qualquer um que souber
// um e-mail da lista consegue chamar a API como se fosse aquele
// administrador. Login por OAuth continua sendo o próximo passo real (ver
// README).
export function isAdminAuthorized(req) {
  const email = (req.headers["x-admin-email"] || "").toString().trim().toLowerCase();
  return email.length > 0 && isAdminEmail(email);
}

export function requireAdmin(req, res) {
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ error: "Não autorizado. E-mail de administrador ausente ou fora da allowlist." });
    return false;
  }
  return true;
}
