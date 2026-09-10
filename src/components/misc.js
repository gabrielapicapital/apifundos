import { WHATSAPP_NUMBER, WHATSAPP_DISPLAY } from "../config.js";

export function init() {
  const link = document.getElementById("whatsappBtn");
  link.href = `https://wa.me/${WHATSAPP_NUMBER}`;
  document.getElementById("whatsappLabel").textContent = WHATSAPP_DISPLAY;

  // Onboarding mínimo para iOS (especificação seção 2): Safari não expõe o
  // evento beforeinstallprompt, então o único jeito de "instalar" é o passo
  // manual Compartilhar > Adicionar à Tela de Início. Mostramos a dica só
  // quando faz sentido: iOS, em Safari, ainda não rodando como app instalado,
  // e o consultor não dispensou a dica antes.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const dismissed = localStorage.getItem("api-capital-ios-hint-dismissed") === "1";

  if (isIOS && !isStandalone && !dismissed) {
    document.getElementById("iosInstallHint").classList.add("visible");
  }
  document.getElementById("dismissInstallHint").addEventListener("click", () => {
    document.getElementById("iosInstallHint").classList.remove("visible");
    localStorage.setItem("api-capital-ios-hint-dismissed", "1");
  });
}
