// Service Worker: Der Kodex startet auch ohne Internet.
// Immer zuerst das Netz fragen (damit Updates sofort ankommen), sonst die gespeicherte Fassung nehmen.
const CACHE = "zauberkodex-v3";
const DATEIEN = ["./", "./index.html", "./manifest.webmanifest", "./sync.js", "./firebase-config.js", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(namen => Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Tägliche Erinnerung: Die GitHub Action schickt nur Daten, die Nachricht baut der Service Worker selbst
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  const daten = d.data || {}, n = d.notification || {};
  e.waitUntil(self.registration.showNotification(daten.titel || n.title || "Zauberkodex", {
    body: daten.text || n.body || "Zeit für eine kurze Lektion.",
    icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: "erinnerung",
    data: { link: daten.link || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const ziel = new URL((e.notification.data && e.notification.data.link) || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(fenster => {
    for (const f of fenster) if (f.url.startsWith(self.registration.scope) && "focus" in f) return f.focus();
    return clients.openWindow(ziel);
  }));
});

self.addEventListener("fetch", e => {
  const anfrage = e.request;
  if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== location.origin) return;
  e.respondWith(
    // "no-cache": beim Server nachfragen, ob es eine neue Fassung gibt, statt den Browser-Zwischenspeicher zu nehmen
    fetch(anfrage.url, { cache: "no-cache", credentials: "same-origin" }).then(antwort => {
      if (antwort.ok) {
        const kopie = antwort.clone();
        caches.open(CACHE).then(c => c.put(anfrage.mode === "navigate" ? "./index.html" : anfrage, kopie));
      }
      return antwort;
    }).catch(() => caches.match(anfrage.mode === "navigate" ? "./index.html" : anfrage, { ignoreSearch: true }))
  );
});
