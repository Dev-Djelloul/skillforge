// Service worker minimal — condition technique requise par les navigateurs
// pour qu'une PWA soit installable. Stratégie "stale-while-revalidate" sur
// les fichiers statiques du même domaine (HTML/JS/CSS/icônes) : chargement
// instantané depuis le cache au retour, mise à jour silencieuse en arrière-
// plan. Les appels à l'API du Worker (autre domaine) ne sont jamais mis en
// cache — les réponses d'entretien doivent toujours être fraîches.
const CACHE_NAME = 'skillforge-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
