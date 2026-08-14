const CACHE_NAME = "family-os-bb-ipad-v6";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/assets/icon.svg",
  "/assets/icons-flat-v2/bottle.png",
  "/assets/icons-flat-v2/calendar.png",
  "/assets/icons-flat-v2/chart.png",
  "/assets/icons-flat-v2/check.png",
  "/assets/icons-flat-v2/diaper.png",
  "/assets/icons-flat-v2/home.png",
  "/assets/icons-flat-v2/medicine.png",
  "/assets/icons-flat-v2/pee.png",
  "/assets/icons-flat-v2/pee-none.png",
  "/assets/icons-flat-v2/pee-small.png",
  "/assets/icons-flat-v2/pee-medium.png",
  "/assets/icons-flat-v2/pee-large.png",
  "/assets/icons-flat-v2/poo.png",
  "/assets/icons-flat-v2/poo-none.png",
  "/assets/icons-flat-v2/poo-small.png",
  "/assets/icons-flat-v2/poo-medium.png",
  "/assets/icons-flat-v2/poo-large.png",
  "/assets/icons-flat-v2/refresh.png",
  "/assets/icons-flat-v2/settings.png",
  "/assets/icons-flat-v2/temp.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })),
  );
});
