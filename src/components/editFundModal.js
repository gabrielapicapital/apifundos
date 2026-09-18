import { updateFundo, backfillFundo } from "../state/store.js";
import { toISODate } from "../lib/format.js";
import * as fundoDetalhe from "./fundoDetalhe.js";
import { ligarSugestaoGrupoPorCnpj, resetarSugestaoGrupo } from "./grupoRiscoSuggestion.js";
import { SEM_GRUPO } from "../lib/gruposRisco.js";

const modal = () => document.getElementById("editFundModal");

// CNPJ do fundo no momento em que o modal foi aberto — usado só pra saber
// se o admin corrigiu o CNPJ nessa edição (ver listener de "input" em
// init()), disparando a sugestão de grupo de novo mesmo com um grupo já
// escolhido antes (adendo "grupos-de-risco", seção 5: "essa mesma lógica
// de sugestão deve valer... se o CNPJ for corrigido depois").
let cnpjAoAbrir = "";

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

  // Corrigir o CNPJ nessa edição volta o seletor de grupo pro estado "não
  // escolhido", pra sugestão automática (ligada logo abaixo) poder disparar
  // de novo — sem isso, o grupo já preenchido (o que o fundo já tinha)
  // impediria a sugestão de aparecer mesmo com um CNPJ novo.
  document.getElementById("editFundCnpj").addEventListener("input", () => {
    const atual = document.getElementById("editFundCnpj").value.trim();
    if (atual !== cnpjAoAbrir) document.getElementById("editFundGrupo").value = "";
  });

  ligarSugestaoGrupoPorCnpj({
    inputCnpjId: "editFundCnpj",
    selectGrupoId: "editFundGrupo",
    suggestionBoxId: "editFundGrupoSuggestion",
  });

  document.getElementById("confirmEditFundBtn").addEventListener("click", async () => {
    const id = modal().dataset.fundoId;
    const nome = document.getElementById("editFundName").value.trim();
    const instituicao = document.getElementById("editFundInst").value.trim();
    const tipo = document.getElementById("editFundTipo").value;
    const categoria = document.getElementById("editFundCat").value;
    const cnpjOuTicker = document.getElementById("editFundCnpj").value.trim() || null;
    const grupoRisco = document.getElementById("editFundGrupo").value || SEM_GRUPO;
    const cnpjCvm = document.getElementById("editFundCnpjCvm").value.trim() || null;
    const dataAdicao = document.getElementById("editFundDate").value || null;
    const precoEntradaRaw = document.getElementById("editFundEntry").value;
    const precoAtualRaw = document.getElementById("editFundCurrent").value;
    const valorInvestidoRaw = document.getElementById("editFundValue").value;
    const pendenteCorrecao = document.getElementById("editFundFlag").checked;
    const errBox = document.getElementById("editFundError");

    const precoEntrada = precoEntradaRaw !== "" ? parseFloat(precoEntradaRaw) : null;
    // Em branco = "busca sozinho" (ver hint no modal e auto-busca no
    // servidor, api/fundos/[id].js) — null é o sinal de "não informado",
    // igual já funciona pra precoEntrada; nunca bloqueia o salvamento.
    const precoAtual = precoAtualRaw !== "" ? parseFloat(precoAtualRaw) : null;
    const valorInvestido = valorInvestidoRaw !== "" ? parseFloat(valorInvestidoRaw) : null;

    if (!nome) {
      errBox.style.display = "block";
      return;
    }
    errBox.style.display = "none";

    const patch = { nome, instituicao, tipo, categoria, grupoRisco, cnpjOuTicker, cnpjCvm, dataAdicao, precoEntrada, precoAtual, pendenteCorrecao };

    // Recalcula a quantidade de cotas só quando o admin informa o valor
    // investido de verdade (ex: ao corrigir um fundo pendente com a cota real
    // vinda da CVM). Sem isso, a quantidade de cotas existente é preservada.
    if (valorInvestido && precoEntrada) {
      patch.quantidadeCotas = valorInvestido / precoEntrada;
    }

    const confirmBtn = document.getElementById("confirmEditFundBtn");
    confirmBtn.disabled = true;
    try {
      const atualizado = await updateFundo(id, patch);
      modal().classList.add("hidden");
      // Editando com a página de detalhe desse mesmo fundo já aberta (ver
      // botão de administrador direto nela): sem isso, os valores editados
      // só apareciam depois de sair e voltar pra página.
      if (fundoDetalhe.fundoCarregadoId() === id) fundoDetalhe.atualizarDadosFundo();
      // Data de compra ou CNPJ/ticker mudaram: o servidor já buscou a cota
      // da nova data sozinho (ver api/fundos/[id].js), mas o histórico
      // completo pro gráfico/índices só vem buscando de novo desde essa
      // data até hoje — mesma chamada disparada ao adicionar um fundo novo.
      if (atualizado.precisaBackfill) backfillFundo(id);
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
  cnpjAoAbrir = fundo.cnpjOuTicker || "";
  document.getElementById("editFundGrupo").value = fundo.grupoRisco && fundo.grupoRisco !== SEM_GRUPO ? fundo.grupoRisco : "";
  resetarSugestaoGrupo("editFundGrupoSuggestion");
  document.getElementById("editFundCnpjCvm").value = fundo.cnpjCvm || "";
  document.getElementById("editFundDate").value = toISODate(fundo.dataAdicao);
  document.getElementById("editFundEntry").value = fundo.precoEntrada ?? "";
  // "0" nunca é um preço atual de verdade (fundo cujo CNPJ ainda não
  // resolveu, ver auto-busca no PATCH) — abre em branco pra já convidar a
  // busca automática, em vez de bloquear o salvamento com um "0" inválido.
  document.getElementById("editFundCurrent").value = fundo.precoAtual > 0 ? fundo.precoAtual : "";
  document.getElementById("editFundValue").value = "";
  syncPendenteFromEntry();
  document.getElementById("editFundError").style.display = "none";
  modal().classList.remove("hidden");
}
