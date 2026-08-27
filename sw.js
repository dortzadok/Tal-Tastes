const CACHE = "tal-tastes-v5-2";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=5.2",
  "./app.js?v=5.2",
  "./config.js?v=5.2",
  "./manifest.json?v=5.2",
  "./icon-192.png",
  "./icon-512.png"
];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    if(response && response.ok && new URL(event.request.url).origin === self.location.origin){
      const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    }
    return response;
  }).catch(()=>caches.match(event.request)));
});
