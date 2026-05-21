const CACHE = 'whispr-v23';
const FILES = ['./', './index.html', './css/style.css', './js/app.js', './manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
