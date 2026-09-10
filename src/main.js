import { initApp } from "./app.js";
import { hydrate } from "./state/store.js";

async function start() {
  await initApp();
  await hydrate();
}

start();

// Service worker: network-first para HTML/JS/CSS (sempre busca a versão mais
// nova quando há rede; cai para o cache só quando offline), e avisa quando
// uma versão nova terminou de instalar para recarregar sem depender do
// consultor limpar o cache manualmente (especificação seção 2).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            // Já havia um service worker ativo antes: isto é uma atualização,
            // não a primeira instalação. Assume o controle e recarrega.
            installing.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
