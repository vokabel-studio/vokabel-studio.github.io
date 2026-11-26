// Backup als JSON-Datei: Export und Import.
import * as db from './db.js';

export const FORMAT = 'vokabel-studio-backup';
export const VERSION = 1;

export async function erstelleBackup() {
  const inhalte = {};
  for (const s of db.INHALT_STORES) inhalte[s] = await db.all(s);
  const lerndaten = {};
  for (const s of db.LERN_STORES) lerndaten[s] = await db.all(s);
  return {
    format: FORMAT, schemaVersion: VERSION, exportiertAm: new Date().toISOString(), umfang: 'alles',
    inhalte, profile: await db.all('profile'), lerndaten, geloescht: await db.all('geloescht')
  };
}

export function backupDateiname() {
  return `vokabel-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

// Teilen (iOS) oder Download (Desktop)
export async function speichereDatei(name, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'geteilt';
    } catch (e) {
      if (e.name === 'AbortError') return 'abgebrochen';
      // sonst auf Download ausweichen
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'heruntergeladen';
}

export function pruefeBackup(obj) {
  if (!obj || obj.format !== FORMAT) return 'Das ist keine Vokabel-Studio-Sicherung.';
  if (obj.schemaVersion > VERSION) return 'Diese Sicherung stammt aus einer neueren App-Version. Bitte die App aktualisieren.';
  return null;
}

export function zusammenfassung(obj) {
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  return {
    datum: obj.exportiertAm, profile: n(obj.profile), units: n(obj.inhalte?.units),
    vokabeln: n(obj.inhalte?.vokabeln), lernstand: n(obj.lerndaten?.lernstand)
  };
}

// Sicherung laden: Inhalte der Sicherung übernehmen (sie gewinnt gegenüber diesem Gerät), alles andere bleibt.
export async function spieleEin(obj) {
  const S = await import('./sync.js');
  const r = await S.fuehreZusammen(S.ausSicherung(obj), { wiederherstellen: true });
  return r.neu + r.geaendert;
}
