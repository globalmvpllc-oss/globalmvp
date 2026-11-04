/*
 * Avc KolayStok service worker — just enough to make the web app installable
 * ("Add to Home Screen"). It does not cache stock data: numbers must always
 * be live, so every request goes to the network as usual.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Network as normal (a fetch handler is required for installability).
});
