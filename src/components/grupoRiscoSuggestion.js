// Sugestão automática de grupo de risco por CNPJ (adendo "grupos-de-risco",
// seção 5) — reaproveitado pelos modais de adicionar e editar fundo.
// Dispara na perda de foco do campo CNPJ (não precisa esperar o resto do
// formulário), mostra um aviso inline (nunca um popup de navegador) com
// "Usar este grupo"/"Ignorar", e nunca sobrepõe uma escolha manual.
import { buscarGrupoPorCnpj } from "../state/store.js";

export function ligarSugestaoGrupoPorCnpj({ inputCnpjId, selectGrupoId, suggestionBoxId }) {
  document.getElementById(inputCnpjId).addEventListener("blur", async () => {
    const cnpjInput = document.getElementById(inputCnpjId);
    const grupoSelect = document.getElementById(selectGrupoId);
    const box = document.getElementById(suggestionBoxId);
    if (grupoSelect.value) return; // administrador já escolheu manualmente — não sobrepõe

    const digits = cnpjInput.value.replace(/\D/g, "");
    if (digits.length !== 14) {
      box.classList.remove("visible");
      return;
    }
    const detectado = await buscarGrupoPorCnpj(digits);
    // Reconfere depois do await: o admin pode ter escolhido um grupo (ou
    // saído do campo de novo) enquanto a busca estava em voo.
    if (!detectado || grupoSelect.value) {
      box.classList.remove("visible");
      return;
    }

    box.classList.add("visible");
    box.innerHTML = `
      <span>📍 Detectamos, pelo CNPJ, que este fundo se encaixa em <b>"${detectado}"</b>.</span>
      <span class="grupo-suggestion-actions">
        <button type="button" class="grupo-suggestion-accept">Usar este grupo</button>
        <button type="button" class="grupo-suggestion-dismiss">Ignorar</button>
      </span>
    `;
    box.querySelector(".grupo-suggestion-accept").addEventListener("click", () => {
      grupoSelect.value = detectado;
      box.classList.remove("visible");
    });
    box.querySelector(".grupo-suggestion-dismiss").addEventListener("click", () => {
      box.classList.remove("visible");
    });
  });
}

export function resetarSugestaoGrupo(suggestionBoxId) {
  const box = document.getElementById(suggestionBoxId);
  box.classList.remove("visible");
  box.innerHTML = "";
}
