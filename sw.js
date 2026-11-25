// Cache somente da interface. Nenhuma resposta do Firebase ou dado financeiro é armazenado aqui.
const CACHE='respiro-shell-v5';
const FILES=['./','./index.html','./style.css?v=4','./app.js?v=5','./engine.js?v=3','./sync.js?v=3','./firebase-config.js?v=3','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('respiro-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin||!FILES.some(f=>new URL(f,self.registration.scope).href===url.href))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request)));});
