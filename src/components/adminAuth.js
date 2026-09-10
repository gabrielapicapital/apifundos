import { ADMIN_EMAILS_PLACEHOLDER, ADMIN_EMAILS_LOCAL_CONFIG_URL } from "../config.js";
import { setEditMode, setAdminEmail } from "../state/store.js";

let allowlist = [...ADMIN_EMAILS_PLACEHOLDER];

async function loadLocalAllowlist() {
  try {
    const res = await fetch(new URL(ADMIN_EMAILS_LOCAL_CONFIG_URL, document.baseURI));
    if (!res.ok) return;
    const extra = await res.json();
    if (Array.isArray(extra)) {
      allowlist = [...new Set([...allowlist, ...extra.map((e) => e.toLowerCase().trim())])];
    }
  } catch (e) {
    // arquivo opcional — ausência é o caso normal fora de configuração local
  }
}

export async function init() {
  await loadLocalAllowlist();

  const adminBtn = document.getElementById("adminBtn");
  const modal = document.getElementById("adminLoginModal");
  const emailInput = document.getElementById("adminEmailInput");
  const errorEl = document.getElementById("adminLoginError");
  const configHint = document.getElementById("adminConfigHint");

  adminBtn.addEventListener("click", () => {
    setEditMode(false);
    errorEl.style.display = "none";
    configHint.style.display = allowlist.length ? "none" : "block";
    emailInput.value = "";
    modal.classList.remove("hidden");
    emailInput.focus();
  });

  document.getElementById("cancelAdminLoginBtn").addEventListener("click", () => modal.classList.add("hidden"));

  function tryLogin() {
    const email = emailInput.value.trim().toLowerCase();
    if (email && allowlist.includes(email)) {
      setAdminEmail(email);
      setEditMode(true);
      modal.classList.add("hidden");
    } else {
      errorEl.style.display = "block";
    }
  }

  document.getElementById("confirmAdminLoginBtn").addEventListener("click", tryLogin);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryLogin();
  });

  document.getElementById("exitEditBtn").addEventListener("click", () => setEditMode(false));
}

export function render(state) {
  const adminBtn = document.getElementById("adminBtn");
  const editBanner = document.getElementById("editBanner");
  if (state.editMode) {
    adminBtn.textContent = "🔓 Administrador";
    adminBtn.classList.add("on");
    editBanner.style.display = "flex";
  } else {
    adminBtn.textContent = "🔒 Administrar";
    adminBtn.classList.remove("on");
    editBanner.style.display = "none";
  }
}
