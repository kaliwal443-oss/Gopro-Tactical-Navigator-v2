const STATIC_CACHE_NAME = 'gopro-static-cache-v3';
const MAP_TILES_CACHE_NAME = 'gopro-tiles-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/components/icons.tsx',
  '/components/MapView.tsx',
  '/components/SatellitesView.tsx',
  '/components/CompassView.tsx',
];

const TILE_URL_PATTERNS = [
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'server.arcgisonline.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Opened static cache');
        const cachePromises = urlsToCache.map(urlToCache => {
            return cache.add(urlToCache).catch(err => {
                console.warn(`Failed to cache ${urlToCache}:`, err);
            });
        });
        return Promise.all(cachePromises);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const isMapTileRequest = TILE_URL_PATTERNS.some(pattern => event.request.url.includes(pattern));
  const cacheName = isMapTileRequest ? MAP_TILES_CACHE_NAME : STATIC_CACHE_NAME;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Cache hit
        }

        // Not in cache, go to network
        return fetch(event.request).then(
          (response) => {
            if (!response || response.status !== 200) {
              return response;
            }
            if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(cacheName)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(err => {
            console.error('Fetch failed:', err);
            // For map tiles, we don't want to throw an error which would break the page.
            // We just fail silently, and the map will show a gray area for the missing tile.
            if (isMapTileRequest) {
                return new Response('', { status: 408, statusText: 'Request timed out.' });
            }
            throw err;
        });
      })
  );
});


self.addEventListener('activate', (event) => {
  const cacheWhitelist = [STATIC_CACHE_NAME, MAP_TILES_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});