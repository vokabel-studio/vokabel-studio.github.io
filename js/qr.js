// QR-Übertragung: Daten packen, in viele kleine QR-Codes aufteilen, mit der Kamera wieder einsammeln.
// Ein QR-Code fasst nur wenige hundert Zeichen. Der Sender zeigt die Teile in einer Schleife; der Empfänger
// sammelt, bis alle da sind – verpasste Bilder kommen in der nächsten Runde wieder. Alles offline.
import { encode } from './lib/uqr.mjs';

const KENNUNG = 'VS1';
export const TEIL_LAENGE = 500;   // Zeichen je QR-Code: klein genug, dass Handykameras ihn vom Bildschirm sicher lesen

// ---------- Packen ----------
function zuBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function ausBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function strom(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

/** Objekt → Liste von QR-Texten */
export async function inTeile(obj) {
  const roh = new TextEncoder().encode(JSON.stringify(obj));
  let art = 'r', bytes = roh;
  if (typeof CompressionStream !== 'undefined') { bytes = await strom(roh, new CompressionStream('deflate-raw')); art = 'z'; }
  const b64 = zuBase64(bytes);
  const n = Math.max(1, Math.ceil(b64.length / TEIL_LAENGE));
  const id = Math.random().toString(36).slice(2, 6);
  const teile = [];
  for (let i = 0; i < n; i++) teile.push(`${KENNUNG}|${id}|${i}|${n}|${art}|${b64.slice(i * TEIL_LAENGE, (i + 1) * TEIL_LAENGE)}`);
  return { teile, bytes: bytes.length, rohBytes: roh.length };
}

/** Sammelt eingescannte Teile. hinzu(text) → { neu, anzahl, gesamt, fertig } */
export class Sammler {
  constructor() { this.id = null; this.n = 0; this.art = 'r'; this.teile = new Map(); }
  hinzu(text) {
    const m = /^VS1\|(\w+)\|(\d+)\|(\d+)\|([rz])\|(.*)$/s.exec(text || '');
    if (!m) return { fremd: true, anzahl: this.teile.size, gesamt: this.n, fertig: false };
    const [, id, i, n, art, daten] = m;
    if (this.id !== id) { this.id = id; this.n = +n; this.art = art; this.teile = new Map(); }   // neue Übertragung
    const neu = !this.teile.has(+i);
    this.teile.set(+i, daten);
    return { neu, anzahl: this.teile.size, gesamt: this.n, fertig: this.teile.size === this.n };
  }
  async ergebnis() {
    let b64 = '';
    for (let i = 0; i < this.n; i++) b64 += this.teile.get(i);
    let bytes = ausBase64(b64);
    if (this.art === 'z') bytes = await strom(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
}

// ---------- Anzeigen ----------
/** QR-Code eines Textes in ein Canvas zeichnen (füllt die Canvas-Breite) */
export function zeichne(canvas, text) {
  const qr = encode(text, { ecc: 'L', border: 3 });
  const px = Math.max(2, Math.floor(canvas.width / qr.size));
  const rand = Math.floor((canvas.width - px * qr.size) / 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  qr.data.forEach((zeile, y) => zeile.forEach((an, x) => { if (an) ctx.fillRect(rand + x * px, rand + y * px, px, px); }));
}

// ---------- Kamera ----------
let jsqrLaden = null;
function ladeJsQR() {
  jsqrLaden ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('js/lib/jsQR.js', document.baseURI).href;
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error('Der QR-Leser konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
  return jsqrLaden;
}

/** Liest QR-Codes aus einem Bild/Canvas/Video – mit dem eingebauten Leser (Android/Chrome) oder jsQR (iPhone) */
export async function leser() {
  if ('BarcodeDetector' in window) {
    try {
      if ((await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (quelle) => (await bd.detect(quelle)).map((c) => c.rawValue);
      }
    } catch { /* weiter mit jsQR */ }
  }
  const jsQR = await ladeJsQR();
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return async (quelle) => {
    const w = quelle.videoWidth || quelle.width, h = quelle.videoHeight || quelle.height;
    if (!w || !h) return [];
    const f = Math.min(1, 900 / Math.max(w, h));
    c.width = Math.round(w * f); c.height = Math.round(h * f);
    ctx.drawImage(quelle, 0, 0, c.width, c.height);
    const r = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
    return r ? [r.data] : [];
  };
}

/** Kamera starten und laufend QR-Codes melden. Gibt { stopp() } zurück. */
export async function scanne(video, beiText) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieser Browser kann die Kamera nicht öffnen.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  const lies = await leser();
  let aktiv = true;
  (async function schleife() {
    while (aktiv) {
      try { for (const t of await lies(video)) beiText(t); } catch { /* einzelnes Bild nicht lesbar */ }
      await new Promise((r) => setTimeout(r, 80));
    }
  })();
  return { stopp() { aktiv = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; } };
}
