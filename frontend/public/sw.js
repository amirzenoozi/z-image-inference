// Only makes the app installable on browsers that still ask for a service worker. It caches nothing: the app is no
// use without the Mac it runs on, and a cache would show an old version after an update.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
