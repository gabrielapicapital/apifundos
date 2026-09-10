import { ADMIN_EMAILS_PLACEHOLDER, ADMIN_EMAILS_LOCAL_CONFIG_URL } from "../config.js";
import { setEditMode, setAdminEmail } from "../state/store.js";

let allowlist = [...ADMIN_EMAILS_PLACEHOLDER];

const ICON_LOCKED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
const ICON_UNLOCKED =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.6-2.2"></path></svg>';

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
    adminBtn.innerHTML = ICON_UNLOCKED + "<span>Administrador</span>";
    adminBtn.classList.add("on");
    editBanner.style.display = "flex";
  } else {
    adminBtn.innerHTML = ICON_LOCKED + "<span>Administrar</span>";
    adminBtn.classList.remove("on");
    editBanner.style.display = "none";
  }
}
