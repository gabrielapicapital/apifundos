// Service worker "network-first": em produção, cada deploy deve trocar
// CACHE_VERSION (ex: para a data/hash do build) para forçar a invalidação do
// cache antigo — sem isso, consultores continuariam vendo um cache obsoleto
// depois de ficarem offline uma vez.
const CACHE_VERSION = "v3";
const CACHE_NAME = `api-capital-fundos-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/main.js",
  "./src/app.js",
  "./src/config.js",
  "./src/data/seed.json",
  "./src/data/normalize.js",
  "./src/state/store.js",
  "./src/lib/format.js",
  "./src/lib/analytics.js",
  "./src/lib/illustrative.js",
  "./src/components/tabsChips.js",
  "./src/components/summary.js",
  "./src/components/comparator.js",
  "./src/components/table.js",
  "./src/components/adminAuth.js",
  "./src/components/addFundModal.js",
  "./src/components/editFundModal.js",
  "./src/components/benchmarkChart.js",
  "./src/components/misc.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "./public/icons/icon-192.png",
  "./public/icons/icon-512.png",
  "./public/icons/apple-touch-icon.png",
  "./public/icons/favicon-32.png",
  "./public/icons/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
  );
});
