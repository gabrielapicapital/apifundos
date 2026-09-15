import { addFundo, backfillFundo } from "../state/store.js";

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

  // Busca real na CVM (cadastro + cota na data da compra). Só cobre
  // fundos/FIDCs com CNPJ — ETFs usam ticker e não têm cadastro na CVM (ver
  // especificação seção 6), então o campo de busca não faz nada por eles.
  document.getElementById("lookupCnpjBtn").addEventListener("click", async () => {
    const statusEl = document.getElementById("cnpjStatus");
    const cnpjRaw = document.getElementById("newFundCnpj").value.replace(/\D/g, "");
    const dataVal = document.getElementById("newFundDate").value;
    statusEl.style.display = "block";

    if (cnpjRaw.length !== 14) {
      statusEl.style.color = "var(--api-erro)";
      statusEl.textContent = "CNPJ incompleto: digite os 14 números (ETFs não têm CNPJ na CVM, use os campos manuais).";
      return;
    }
    if (!dataVal) {
      statusEl.style.color = "var(--api-erro)";
      statusEl.textContent = "Preencha a data da compra antes de buscar.";
      return;
    }

    statusEl.style.color = "var(--api-texto-fraco)";
    statusEl.textContent = "Buscando na CVM...";
    try {
      const res = await fetch(`/api/cvm-lookup?cnpj=${cnpjRaw}&data=${dataVal}`);
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || `Erro ${res.status}`);

      document.getElementById("newFundName").value = dados.nome;
      document.getElementById("newFundInst").value = dados.instituicao;
      document.getElementById("newFundCat").value = dados.categoria;
      document.getElementById("newFundTipo").value = "Fundo";

      if (dados.cota != null) {
        document.getElementById("newFundQuota").value = dados.cota;
        statusEl.style.color = "var(--api-ok)";
        statusEl.textContent = dados.aproximado
          ? `Fundo encontrado. Cota de ${dados.dataCota} preenchida (data exata não tinha pregão).`
          : `Fundo encontrado. Cota de ${dados.dataCota} preenchida.`;
      } else {
        statusEl.style.color = "var(--api-erro)";
        statusEl.textContent = "Fundo encontrado, mas não achei cota perto dessa data. Confirme manualmente.";
      }
    } catch (err) {
      statusEl.style.color = "var(--api-erro)";
      statusEl.textContent = `Não encontrei: ${err.message}`;
    }
  });

  document.getElementById("confirmAddFundBtn").addEventListener("click", async () => {
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

    const confirmBtn = document.getElementById("confirmAddFundBtn");
    confirmBtn.disabled = true;
    try {
      const cnpjOuTicker = document.getElementById("newFundCnpj").value.trim() || null;
      const novo = await addFundo({
        nome,
        instituicao,
        tipo,
        categoria,
        cnpjOuTicker,
        dataAdicao: dataVal,
        precoEntrada: cota,
        precoAtual: cota,
        quantidadeCotas: valor / cota,
        pendenteCorrecao: false,
      });
      modal.classList.add("hidden");

      // Com CNPJ/ticker + data, já dá pra buscar de uma vez o histórico real
      // desde a compra até hoje (em vez de esperar a rotina diária acumular
      // um ponto por dia) — dispara em segundo plano, não trava a UI.
      if (cnpjOuTicker) backfillFundo(novo.id);
    } catch (err) {
      errBox.textContent = `Não foi possível adicionar: ${err.message}`;
      errBox.style.display = "block";
    } finally {
      confirmBtn.disabled = false;
    }
  });
}
