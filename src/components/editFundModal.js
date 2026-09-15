import { updateFundo } from "../state/store.js";
import { toISODate } from "../lib/format.js";

const modal = () => document.getElementById("editFundModal");

function syncPendenteFromEntry() {
  const entry = document.getElementById("editFundEntry").value;
  document.getElementById("editFundFlag").checked = entry === "";
}

export function init() {
  document.getElementById("cancelEditFundBtn").addEventListener("click", () => modal().classList.add("hidden"));

  // Digitar um preço de entrada já desmarca "pendente de correção" sozinho —
  // antes disso, quem preenchia a cota real esquecia de tirar a marcação
  // manualmente e o fundo continuava aparecendo como pendente.
  document.getElementById("editFundEntry").addEventListener("input", syncPendenteFromEntry);

  document.getElementById("confirmEditFundBtn").addEventListener("click", async () => {
    const id = modal().dataset.fundoId;
    const nome = document.getElementById("editFundName").value.trim();
    const instituicao = document.getElementById("editFundInst").value.trim();
    const tipo = document.getElementById("editFundTipo").value;
    const categoria = document.getElementById("editFundCat").value;
    const cnpjOuTicker = document.getElementById("editFundCnpj").value.trim() || null;
    const dataAdicao = document.getElementById("editFundDate").value || null;
    const precoEntradaRaw = document.getElementById("editFundEntry").value;
    const precoAtualRaw = document.getElementById("editFundCurrent").value;
    const valorInvestidoRaw = document.getElementById("editFundValue").value;
    const pendenteCorrecao = document.getElementById("editFundFlag").checked;
    const errBox = document.getElementById("editFundError");

    const precoEntrada = precoEntradaRaw !== "" ? parseFloat(precoEntradaRaw) : null;
    const precoAtual = parseFloat(precoAtualRaw);
    const valorInvestido = valorInvestidoRaw !== "" ? parseFloat(valorInvestidoRaw) : null;

    if (!nome || !precoAtual || precoAtual <= 0) {
      errBox.style.display = "block";
      return;
    }
    errBox.style.display = "none";

    const patch = { nome, instituicao, tipo, categoria, cnpjOuTicker, dataAdicao, precoEntrada, precoAtual, pendenteCorrecao };

    // Recalcula a quantidade de cotas só quando o admin informa o valor
    // investido de verdade (ex: ao corrigir um fundo pendente com a cota real
    // vinda da CVM). Sem isso, a quantidade de cotas existente é preservada.
    if (valorInvestido && precoEntrada) {
      patch.quantidadeCotas = valorInvestido / precoEntrada;
    }

    const confirmBtn = document.getElementById("confirmEditFundBtn");
    confirmBtn.disabled = true;
    try {
      await updateFundo(id, patch);
      modal().classList.add("hidden");
    } catch (err) {
      errBox.textContent = `Não foi possível salvar: ${err.message}`;
      errBox.style.display = "block";
    } finally {
      confirmBtn.disabled = false;
    }
  });
}

export function open(fundo) {
  modal().dataset.fundoId = fundo.id;
  document.getElementById("editFundName").value = fundo.nome;
  document.getElementById("editFundInst").value = fundo.instituicao;
  document.getElementById("editFundTipo").value = fundo.tipo;
  document.getElementById("editFundCat").value = fundo.categoria;
  document.getElementById("editFundCnpj").value = fundo.cnpjOuTicker || "";
  document.getElementById("editFundDate").value = toISODate(fundo.dataAdicao);
  document.getElementById("editFundEntry").value = fundo.precoEntrada ?? "";
  document.getElementById("editFundCurrent").value = fundo.precoAtual;
  document.getElementById("editFundValue").value = "";
  syncPendenteFromEntry();
  document.getElementById("editFundError").style.display = "none";
  modal().classList.remove("hidden");
}
