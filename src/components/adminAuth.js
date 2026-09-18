import { isAdminEmail } from "../lib/admins.js";
import { setEditMode, setAdminEmail } from "../state/store.js";
import { ICON_LOCK, ICON_LOCK_OPEN } from "../lib/icons.js";

export async function init() {
  const adminBtn = document.getElementById("adminBtn");
  const modal = document.getElementById("adminLoginModal");
  const emailInput = document.getElementById("adminEmailInput");
  const errorEl = document.getElementById("adminLoginError");

  adminBtn.addEventListener("click", () => {
    setEditMode(false);
    errorEl.style.display = "none";
    emailInput.value = "";
    modal.classList.remove("hidden");
    emailInput.focus();
  });

  document.getElementById("cancelAdminLoginBtn").addEventListener("click", () => modal.classList.add("hidden"));

  function tryLogin() {
    const email = emailInput.value.trim().toLowerCase();
    if (email && isAdminEmail(email)) {
      setAdminEmail(email);
      setEditMode(true);
      modal.classList.add("hidden");
    } else {
      errorEl.textContent = "Este e-mail não tem permissão de administrador.";
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
    adminBtn.innerHTML = ICON_LOCK_OPEN + "<span>Administrador</span>";
    adminBtn.classList.add("on");
    editBanner.style.display = "flex";
  } else {
    adminBtn.innerHTML = ICON_LOCK + "<span>Administrar</span>";
    adminBtn.classList.remove("on");
    editBanner.style.display = "none";
  }
}
