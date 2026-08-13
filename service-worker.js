/**
 * service-worker.js
 * Compendium: Codex do Engenheiro de Dados
 *
 * Estratégia NETWORK-FIRST: toda vez que há conexão, busca a versão mais
 * nova dos arquivos e atualiza o cache — só usa o cache se a rede falhar
 * (offline). Isso evita o problema clássico de PWA "grudar" numa versão
 * antiga enquanto o app ainda está em desenvolvimento ativo.
 *
 * Bump o CACHE_NAME (ex: v1 -> v2) se algum dia quiser forçar todo mundo
 * a descartar o cache antigo de uma vez — como fiz agora (v1 -> v2), pra
 * garantir versão limpa em quem já tinha testado várias versões seguidas
 * na mesma origem.
 */
const CACHE_NAME = 'compendium-cache-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './theme.css',
  './theme-light.css',
  './script.js',
  './data-embedded.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // cache.addAll() é tudo-ou-nada: se UM arquivo falhar ao buscar (rede
      // instável, hiccup pontual), a instalação inteira falha em silêncio e
      // o service worker nunca ativa — o app fica sem ficar instalável, sem
      // nenhum aviso do porquê. Buscando um por um com Promise.allSettled,
      // um arquivo com problema não derruba os outros nove.
      return Promise.allSettled(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[service-worker] não consegui pré-cachear', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return response;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
