import { updateFundo } from "../state/store.js";
import { toISODate } from "../lib/format.js";

const modal = () => document.getElementById("editFundModal");

export function init() {
  document.getElementById("cancelEditFundBtn").addEventListener("click", () => modal().classList.add("hidden"));

  document.getElementById("confirmEditFundBtn").addEventListener("click", () => {
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

    updateFundo(id, patch);
    modal().classList.add("hidden");
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
  document.getElementById("editFundFlag").checked = fundo.pendenteCorrecao;
  document.getElementById("editFundError").style.display = "none";
  modal().classList.remove("hidden");
}
