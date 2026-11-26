// Sync-Kern: Datenstand exportieren und mit einem fremden Stand zusammenführen.
// Genutzt von: Sicherung laden, QR-Übertragung (Handy zu Handy), Cloud-Abgleich (OneDrive …).
//
// Regeln:
// - Jeder Eintrag trägt _g (Zeitpunkt der letzten Änderung). Der neuere gewinnt; bei Gleichstand der fremde.
// - Gelöschtes steht in der Gelöscht-Liste („Grabsteine“). Ist ein Grabstein neuer als der Eintrag, bleibt er gelöscht.
// - Antworten (ereignisse) werden nur gesammelt; ältere als 60 Tage sind ohnehin zusammengefasst und werden ignoriert.
// - Belohnungen je Profil werden feldweise zusammengeführt (Punkte/Zähler: Maximum, Abzeichen/Gutscheine: vereinigt),
//   damit beim Lernen auf zwei Geräten nichts verloren geht.
import * as db from './db.js';
import { uid } from './util.js';
import { LS_PREFIX } from './config.js';

export const FORMAT = 'vokabel-studio-sync';
export const VERSION = 1;
const PROTOKOLL_TAGE = 60;
const PROFIL_BEZUG = new Set(['lernstand', 'ereignisse', 'termine', 'tests', 'belohnungen']);

/** Eine zufällige, gleichbleibende Kennung dieses Geräts (nur zur Anzeige „von welchem Gerät“) */
export function geraetId() {
  try {
    let id = localStorage.getItem(LS_PREFIX + 'geraet');
    if (!id) { id = uid('g'); localStorage.setItem(LS_PREFIX + 'geraet', id); }
    return id;
  } catch { return 'unbekannt'; }
}

function grenzeAntworten() {
  const d = new Date(); d.setDate(d.getDate() - PROTOKOLL_TAGE);
  return d.toISOString();
}

/**
 * Den Datenstand dieses Geräts als Paket.
 * profilIds: nur diese Profile samt Lerndaten (Inhalte immer vollständig); null = alle
 */
export async function exportiere({ profilIds = null } = {}) {
  const daten = {};
  const grenze = grenzeAntworten();
  for (const s of db.SYNC_STORES) {
    let liste = await db.all(s);
    if (profilIds && s === 'profile') liste = liste.filter((p) => profilIds.includes(p.id));
    if (profilIds && PROFIL_BEZUG.has(s)) liste = liste.filter((x) => profilIds.includes(x.profilId));
    if (s === 'ereignisse') liste = liste.filter((e) => (e.zeitpunkt || '') >= grenze);
    daten[s] = liste;
  }
  let geloescht = await db.all('geloescht');
  if (profilIds) geloescht = geloescht.filter((g) => !PROFIL_BEZUG.has(g.store) && g.store !== 'profile');
  return { format: FORMAT, schemaVersion: VERSION, stand: new Date().toISOString(), geraet: geraetId(), daten, geloescht };
}

/** Kurze Übersicht eines Pakets für die Anzeige vor dem Übernehmen */
export function uebersicht(p) {
  const n = (s) => (p.daten?.[s] || []).length;
  return { profile: (p.daten?.profile || []).map((x) => x.name), units: n('units'), vokabeln: n('vokabeln'), lernstand: n('lernstand'), stand: p.stand };
}

export function istPaket(obj) { return obj?.format === FORMAT && obj.schemaVersion <= VERSION && obj.daten; }

/** Sicherungsdatei (vokabel-studio-backup) in ein Sync-Paket umwandeln */
export function ausSicherung(obj) {
  return {
    format: FORMAT, schemaVersion: VERSION, stand: obj.exportiertAm, geraet: 'sicherung',
    daten: { ...(obj.inhalte || {}), profile: obj.profile || [], ...(obj.lerndaten || {}) },
    geloescht: obj.geloescht || []
  };
}

const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v || 0);
  return out;
};
const vereinige = (a = [], b = [], key, waehle) => {
  const m = new Map(a.map((x) => [x[key], x]));
  for (const x of b) m.set(x[key], m.has(x[key]) ? waehle(m.get(x[key]), x) : x);
  return [...m.values()];
};

/** Belohnungen eines Profils von zwei Geräten zusammenführen */
export function belohnungZusammen(a, b) {
  const neuer = (b._g || '') >= (a._g || '') ? b : a;
  const weg = [...new Set([...(a.gutscheineWeg || []), ...(b.gutscheineWeg || [])])];
  const out = {
    ...neuer,
    punkte: Math.max(a.punkte || 0, b.punkte || 0),
    zaehler: maxMap(a.zaehler, b.zaehler),
    punkteTag: maxMap(a.punkteTag, b.punkteTag),
    serie: { ...(neuer.serie || {}), rekord: Math.max(a.serie?.rekord || 0, b.serie?.rekord || 0) },
    abzeichen: vereinige(a.abzeichen, b.abzeichen, 'id', (x, y) => ((x.erhaltenAm || '') <= (y.erhaltenAm || '') ? x : y)),
    gutscheineWeg: weg,
    gutscheine: vereinige(a.gutscheine, b.gutscheine, 'id', (x, y) => ((y.erreicht || 0) > (x.erreicht || 0) ? y : x)).filter((g) => !weg.includes(g.id)),
    freigeschaltet: vereinige(a.freigeschaltet, b.freigeschaltet, 'id', (x, y) => ({ ...x, eingeloestAm: x.eingeloestAm || y.eingeloestAm })),
    _g: (a._g || '') > (b._g || '') ? a._g : b._g
  };
  if (a.archiv || b.archiv) {
    const x = a.archiv || {}, y = b.archiv || {};
    out.archiv = {
      antworten: Math.max(x.antworten || 0, y.antworten || 0), richtig: Math.max(x.richtig || 0, y.richtig || 0),
      falschJeVokabel: maxMap(x.falschJeVokabel, y.falschJeVokabel), letzte: (x.letzte || '') > (y.letzte || '') ? x.letzte : y.letzte
    };
  }
  return out;
}

/**
 * Fremden Stand in die Daten dieses Geräts übernehmen.
 * Gibt { neu, geaendert, geloescht } zurück (Anzahl Einträge).
 */
export async function fuehreZusammen(paket, { wiederherstellen = false } = {}) {
  // wiederherstellen (Sicherung laden): Die Sicherung gewinnt immer – auch gegen spätere Änderungen und Löschungen
  // auf diesem Gerät. So lässt sich versehentlich Gelöschtes zurückholen. Alte Antworten werden mit übernommen.
  const stat = { neu: 0, geaendert: 0, geloescht: 0 };
  const ops = [];
  const grab = new Map((await db.all('geloescht')).map((g) => [g.key, g]));
  const neueGrabsteine = [];
  for (const g of paket.geloescht || []) {
    if (!g?.key) continue;
    const alt = grab.get(g.key);
    if (!alt || (alt.am || '') < (g.am || '')) { grab.set(g.key, g); neueGrabsteine.push(g); ops.push({ store: 'geloescht', op: 'put', value: g }); }
  }
  const grenze = grenzeAntworten();
  for (const s of db.SYNC_STORES) {
    const key = db.SCHLUESSEL[s];
    const lokal = new Map((await db.all(s)).map((x) => [x[key], x]));
    for (const rec of paket.daten?.[s] || []) {
      if (!rec || rec[key] === undefined) continue;
      if (s === 'ereignisse' && !wiederherstellen && (rec.zeitpunkt || '') < grenze) continue;
      const k = rec[key];
      const g = grab.get(`${s}|${k}`);
      if (g && wiederherstellen) { ops.push({ store: 'geloescht', op: 'del', key: g.key }); grab.delete(g.key); }
      else if (g && (rec._g || '') <= (g.am || '')) continue;     // später gelöscht worden
      const l = lokal.get(k);
      let neu;
      if (!l || wiederherstellen) neu = rec;
      else if (s === 'belohnungen') neu = belohnungZusammen(l, rec);
      else if ((rec._g || '') >= (l._g || '')) neu = rec;
      else continue;
      if (l && JSON.stringify(l) === JSON.stringify(neu)) continue;
      ops.push({ store: s, op: 'put', value: neu });
      l ? stat.geaendert++ : stat.neu++;
      lokal.set(k, neu);
    }
    // Hier noch vorhandene Einträge, die das andere Gerät inzwischen gelöscht hat
    for (const g of neueGrabsteine.filter((x) => x.store === s)) {
      const l = lokal.get(g.id);
      if (l && (l._g || '') <= (g.am || '')) { ops.push({ store: s, op: 'del', key: g.id }); stat.geloescht++; }
    }
  }
  if (ops.length) await db.batch(ops, { roh: true });
  return stat;
}
