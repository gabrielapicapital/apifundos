import { addFundo, backfillFundo } from "../state/store.js";
import { fmtDateBR, fmtNumber } from "../lib/format.js";
import { attachCalendar } from "./dateCalendar.js";

export function init() {
  const modal = document.getElementById("addFundModal");

  // O calendário só controla a UI (texto dd/mm/aaaa + painel de navegação):
  // #newFundDate continua sendo o input hidden em ISO que todo o resto do
  // código já lia/escrevia antes — nenhuma lógica de busca/salvamento muda.
  const calendar = attachCalendar({
    hiddenInputId: "newFundDate",
    displayInputId: "newFundDateDisplay",
    btnId: "newFundDateBtn",
    panelId: "newFundDatePanel",
  });

  document.getElementById("openAddFund").addEventListener("click", () => {
    ["newFundName", "newFundValue", "newFundQuota", "newFundCnpj"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    document.getElementById("newFundInst").value = "Banco BTG Pactual";
    calendar.setValueSilently(new Date().toISOString().slice(0, 10));
    calendar.close();
    document.getElementById("addFundError").style.display = "none";
    document.getElementById("cnpjStatus").style.display = "none";
    buscaJaIniciada = false;
    modal.classList.remove("hidden");
  });

  document.getElementById("cancelAddFundBtn").addEventListener("click", () => modal.classList.add("hidden"));

  // Busca real na CVM (cadastro + cota na data da compra). Só cobre
  // fundos/FIDCs com CNPJ — ETFs usam ticker e não têm cadastro na CVM (ver
  // especificação seção 6), então o campo de busca não faz nada por eles.
  // Um mesmo fundo pode ter a cota buscada de novo (troca de data depois de
  // já ter buscado, por exemplo) — por isso fica numa função à parte, chamada
  // tanto pelo clique em "Buscar" quanto automaticamente quando a data muda.
  let buscaEmAndamento = false;
  let buscaJaIniciada = false;
  async function buscarCota() {
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

    buscaEmAndamento = true;
    buscaJaIniciada = true;
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
        document.getElementById("newFundQuota").value = "";
        statusEl.style.color = "var(--api-erro)";
        if (dados.primeiraDisponivel) {
          // A data escolhida é anterior à primeira cota que a CVM tem
          // registrada pra esse fundo — provavelmente o fundo ainda nem
          // existia, ou a data foi digitada errada. Em vez de só reclamar,
          // já mostra a primeira data real com cota disponível.
          const dataFmt = fmtDateBR(dados.primeiraDisponivel.data);
          const cotaFmt = fmtNumber(dados.primeiraDisponivel.cota, 6);
          statusEl.innerHTML = `Esse fundo só tem cota registrada na CVM a partir de ${dataFmt} (R$ ${cotaFmt}). A data escolhida é anterior ao início do fundo.<br><button type="button" id="usarPrimeiraDataBtn" class="api-botao-utilidade" style="margin-top:6px;">Usar ${dataFmt}</button>`;
          document.getElementById("usarPrimeiraDataBtn").addEventListener("click", () => {
            calendar.setValueSilently(dados.primeiraDisponivel.data);
            document.getElementById("newFundQuota").value = dados.primeiraDisponivel.cota;
            statusEl.style.color = "var(--api-ok)";
            statusEl.textContent = `Fundo encontrado. Cota de ${dados.primeiraDisponivel.data} preenchida.`;
          });
        } else {
          statusEl.textContent = "Fundo encontrado, mas não achei cota perto dessa data. Confirme manualmente.";
        }
      }
    } catch (err) {
      document.getElementById("newFundQuota").value = "";
      statusEl.style.color = "var(--api-erro)";
      statusEl.textContent = `Não encontrei: ${err.message}`;
    } finally {
      buscaEmAndamento = false;
    }
  }

  document.getElementById("lookupCnpjBtn").addEventListener("click", buscarCota);

  // Se já tinha sido feita uma busca (com sucesso ou não) e a data da compra
  // muda, busca de novo sozinho — senão a cota preenchida fica "grudada" na
  // primeira data pesquisada, mesmo depois de trocar a data no campo.
  document.getElementById("newFundDate").addEventListener("change", () => {
    const cnpjRaw = document.getElementById("newFundCnpj").value.replace(/\D/g, "");
    if (cnpjRaw.length === 14 && buscaJaIniciada && !buscaEmAndamento) {
      buscarCota();
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
