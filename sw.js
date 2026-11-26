// Service Worker: App offline verfügbar machen.
// Bei jeder Änderung an App-Dateien VERSION erhöhen (und APP_VERSION in js/config.js gleich setzen).
// Cache-Name enthält den Pfad, damit Live- und Beta-Version sich nicht gegenseitig löschen
const PREFIX = 'vs-' + new URL(self.registration.scope).pathname + '-';
const VERSION = PREFIX + '2.13.0';
const NETZ_WARTEN = 3000;   // so lange aufs Netz warten, danach (falls vorhanden) die gespeicherte Datei nehmen
const DATEIEN = [
  './', 'index.html', 'diagnose.html', 'manifest.webmanifest',
  'css/app.css',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/faecher.js', 'js/import.js',
  'js/prompt.js', 'js/backup.js', 'js/speech.js', 'js/views.js', 'js/import-view.js',
  'js/config.js', 'js/lernen.js', 'js/belohnung.js', 'js/latein.js', 'js/lern-views.js', 'js/plan-views.js', 'js/sicherung.js', 'js/design.js', 'js/avatare.js', 'js/effekte.js', 'js/ki.js', 'js/pakete.js', 'js/teilen-views.js', 'js/styles.js', 'js/gutscheine.js', 'js/hoerquiz.js',
  'js/frueh.js', 'js/datenschutz-views.js', 'js/sync.js', 'js/qr.js', 'js/cloud.js', 'js/cloud-onedrive.js', 'js/abgleich-views.js', 'js/lib/uqr.mjs', 'js/lib/jsQR.js',
  'demo/demo-englisch.json', 'demo/demo-latein.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/logo-96.png', 'icons/logo-256.png', 'icons/styles/rock-96.png', 'icons/styles/pop-96.png', 'icons/styles/hiphop-96.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = am Browser-Zwischenspeicher vorbei, damit wirklich die neue Version gespeichert wird
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== VERSION) || /^vs-\d/.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst (damit Updates ankommen) – aber höchstens NETZ_WARTEN ms. Bei schlechtem Empfang (Bus, Schule)
// kommt dann sofort die gespeicherte Datei; die Netz-Antwort aktualisiert den Speicher im Hintergrund.
// Nur erfolgreiche Antworten werden gespeichert (keine Fehlerseiten).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const ausSpeicher = () => caches.match(e.request, { ignoreSearch: true });
  // cache: 'no-cache' = beim Server nachfragen, ob es eine neuere Datei gibt (sonst liefert der Browser bis zu 10 Min. alte Dateien)
  const netz = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok && res.type === 'basic') {
      const kopie = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, kopie));
    }
    return res;
  });
  e.waitUntil(netz.catch(() => {}));
  e.respondWith(new Promise((resolve) => {
    let fertig = false;
    const nimm = (r) => { if (!fertig && r) { fertig = true; resolve(r); } };
    const ersatz = () => ausSpeicher().then((r) => r || caches.match('index.html'));
    const t = setTimeout(() => ausSpeicher().then(nimm), NETZ_WARTEN);
    netz.then((res) => { clearTimeout(t); if (res.ok) nimm(res); else ausSpeicher().then((r) => nimm(r || res)); })
      .catch(() => { clearTimeout(t); ersatz().then((r) => nimm(r || Response.error())); });
  }));
});
