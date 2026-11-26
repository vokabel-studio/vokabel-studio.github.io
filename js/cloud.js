// Cloud-Abgleich: gemeinsamer Ablauf für alle Anbieter. Jeder Anbieter ist ein kleiner Anschluss mit
//   info() → null | { etag, lade() }   speichere(paket, etag) → { etag } (wirft { konflikt: true } bei 412)
//   anmelden(), anmeldungAbschliessen(), abmelden(), eingerichtet()
// Die Zugangsdaten liegen nur auf diesem Gerät (meta) und kommen nicht in die Sicherungsdatei.
import * as db from './db.js';
import * as S from './sync.js';

export const ANBIETER = {
  onedrive: { name: 'OneDrive', icon: '☁️', text: 'Microsoft-Konto (privat). Daten im Ordner „Apps/Vokabel-Studio“.', modul: () => import('./cloud-onedrive.js') },
  googledrive: { name: 'Google Drive', icon: '🟩', text: 'kommt als Nächstes', bald: true },
  dropbox: { name: 'Dropbox', icon: '📦', text: 'geplant', bald: true },
  webdav: { name: 'WebDAV (Nextcloud, NAS …)', icon: '🗄️', text: 'geplant – offene Möglichkeit für eigene Cloud', bald: true }
};

export async function status() { return db.getMeta('cloud'); }

async function setze(aenderung) {
  const c = { ...((await db.getMeta('cloud')) || {}), ...aenderung };
  await db.setMeta('cloud', c);
  return c;
}

/** Nach erfolgreicher Anmeldung (vom Anschluss aufgerufen) */
export async function verbunden(anbieter, konto) {
  await db.setMeta('cloud', { anbieter, konto, seit: new Date().toISOString(), status: 'ok' });
}

export async function trennen() {
  const c = await status();
  if (c?.anbieter && ANBIETER[c.anbieter]?.modul) await (await ANBIETER[c.anbieter].modul()).abmelden();
  await db.del('meta', 'cloud');
}

async function fingerabdruck(paket) {
  const text = JSON.stringify({ d: paket.daten, g: paket.geloescht });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Jetzt abgleichen: fremden Stand holen (nur wenn er sich geändert hat), zusammenführen, eigenen Stand hochladen.
 * Gibt { neu, geaendert, geloescht, hochgeladen } zurück.
 */
export async function abgleichen() {
  let c = await status();
  if (!c?.anbieter) return null;
  const A = await ANBIETER[c.anbieter].modul();
  const stat = { neu: 0, geaendert: 0, geloescht: 0, hochgeladen: false };
  try {
    for (let versuch = 0; versuch < 3; versuch++) {
      const info = await A.info();
      let fpFremd = null;
      if (info && info.etag !== c.etag) {
        const fremd = await info.lade();
        if (S.istPaket(fremd)) {
          const r = await S.fuehreZusammen(fremd);
          stat.neu += r.neu; stat.geaendert += r.geaendert; stat.geloescht += r.geloescht;
          fpFremd = await fingerabdruck(fremd);
        }
      }
      const paket = await S.exportiere();
      const fp = await fingerabdruck(paket);
      if (info && info.etag === c.etag && fp === c.fingerabdruck) break;      // nichts Neues auf beiden Seiten
      if (info && fpFremd === fp) { c = await setze({ etag: info.etag, fingerabdruck: fp }); break; }   // Cloud hat schon genau diesen Stand
      try {
        const r = await A.speichere(paket, info?.etag || null);
        c = await setze({ etag: r.etag, fingerabdruck: fp });
        stat.hochgeladen = true;
        break;
      } catch (e) {
        if (e.konflikt && versuch < 2) continue;      // ein anderes Gerät war schneller → neu holen und zusammenführen
        throw e;
      }
    }
    await setze({ zuletzt: new Date().toISOString(), status: 'ok', fehler: null, letzte: stat });
    return stat;
  } catch (e) {
    await setze({ status: e.anmelden ? 'anmelden' : 'fehler', fehler: e.message || String(e) });
    throw e;
  }
}

let letzterAuto = 0;
/** Automatischer Abgleich (App-Start, nach dem Lernen) – höchstens einmal pro Minute, Fehler nur im Status */
export async function autoAbgleich() {
  const c = await status();
  if (!c?.anbieter || c.status === 'anmelden') return null;
  if (Date.now() - letzterAuto < 60_000) return null;
  letzterAuto = Date.now();
  try { return await abgleichen(); } catch { return null; }
}
