import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "apps/web/dist";
function list(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(dir + "/" + e.name) : [dir + "/" + e.name],
  );
}
const files = list(root).filter((f) => !f.endsWith("/sw.js"));
const version = createHash("sha256")
  .update(files.map((f) => readFileSync(f)).join(""))
  .digest("hex")
  .slice(0, 16);
const urls = files.map((f) => f.slice(root.length));
writeFileSync(
  root + "/sw.js",
  `const CACHE='pulso-shell-${version}';const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_REVIEWED_UPDATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
if(/^\\/administracion(?:\\/|$)/.test(url.pathname))return;
if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')));return;}
if(FILES.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))??fetch(event.request)));
});`,
);
console.log(
  "Versioned public shell prepared: " +
    version +
    " (" +
    urls.length +
    " resources). Private API responses are never cached.",
);
