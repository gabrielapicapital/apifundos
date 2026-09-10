import { addFundo } from "../state/store.js";

export function init() {
  const modal = document.getElementById("addFundModal");

  document.getElementById("openAddFund").addEventListener("click", () => {
    ["newFundName", "newFundValue", "newFundQuota", "newFundCnpj"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    document.getElementById("newFundInst").value = "Banco BTG Pactual";
    document.getElementById("newFundDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("addFundError").style.display = "none";
    document.getElementById("cnpjStatus").style.display = "none";
    modal.classList.remove("hidden");
  });

  document.getElementById("cancelAddFundBtn").addEventListener("click", () => modal.classList.add("hidden"));

  // TODO(cvm): plugar a busca real por CNPJ/ticker (CVM para fundos/FIDCs,
  // B3/provedor de cotação para ETFs — ver README > "Fontes de dados"). Por
  // enquanto isso é apenas um lembrete visual; os campos continuam
  // preenchíveis manualmente, como o fluxo já funciona hoje.
  document.getElementById("lookupCnpjBtn").addEventListener("click", () => {
    const statusEl = document.getElementById("cnpjStatus");
    statusEl.style.display = "block";
    statusEl.style.color = "var(--muted)";
    statusEl.textContent =
      "Integração com CVM/B3 ainda não conectada — preencha nome, instituição, categoria e cota manualmente (ver README).";
  });

  document.getElementById("confirmAddFundBtn").addEventListener("click", () => {
    const nome = document.getElementById("newFundName").value.trim();
    const instituicao = document.getElementById("newFundInst").value.trim() || "Banco BTG Pactual";
    const tipo = document.getElementById("newFundTipo").value;
    const categoria = document.getElementById("newFundCat").value;
    const dataVal = document.getElementById("newFundDate").value;
    const valor = parseFloat(document.getElementById("newFundValue").value);
    const cota = parseFloat(document.getElementById("newFundQuota").value);
    const errBox = document.getElementById("addFundError");

    if (!nome || !dataVal || !valor || !cota || valor <= 0 || cota <= 0) {
      errBox.style.display = "block";
      return;
    }
    errBox.style.display = "none";

    addFundo({
      nome,
      instituicao,
      tipo,
      categoria,
      cnpjOuTicker: document.getElementById("newFundCnpj").value.trim() || null,
      dataAdicao: dataVal,
      precoEntrada: cota,
      precoAtual: cota,
      quantidadeCotas: valor / cota,
      patrimonio: valor,
      pendenteCorrecao: false,
    });

    modal.classList.add("hidden");
  });
}
