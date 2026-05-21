const CACHE = 'whispr-v24';
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
