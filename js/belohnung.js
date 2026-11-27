// Punkte, Lernserie, Abzeichen
import * as db from './db.js';

export const PUNKTE = { richtig: 10, fast: 7, falsch: 1, sitzung: 20 };

export const ABZEICHEN = [
  { id: 'erste_uebung', icon: '🌱', name: 'Erste Schritte', text: 'Die erste Übung beendet.' },
  { id: 'eigene_seite', icon: '📸', name: 'Selbst gemacht', text: 'Die erste eigene Buchseite eingelesen.' },
  { id: 'richtig_50', icon: '⭐', name: '50 richtig', text: '50 richtige Antworten insgesamt.' },
  { id: 'richtig_500', icon: '🌟', name: '500 richtig', text: '500 richtige Antworten insgesamt.' },
  { id: 'zehner', icon: '🔥', name: 'Zehnerserie', text: '10 richtige Antworten hintereinander in einer Übung.' },
  { id: 'serie_3', icon: '📆', name: '3 Tage am Stück', text: 'An 3 Tagen hintereinander gelernt.' },
  { id: 'serie_7', icon: '🗓️', name: 'Eine Woche', text: 'An 7 Tagen hintereinander gelernt.' },
  { id: 'serie_30', icon: '🏅', name: 'Ein Monat', text: 'An 30 Tagen hintereinander gelernt.' },
  { id: 'sicher_50', icon: '🧠', name: 'Wortschatz-Profi', text: '50 Vokabeln sicher (Kasten 4 oder 5).' },
  { id: 'test_bestanden', icon: '✅', name: 'Bestanden', text: 'Einen Abschlusstest mit mindestens 75 % geschafft.' },
  { id: 'test_perfekt', icon: '🏆', name: 'Perfekt', text: 'Einen Abschlusstest mit 100 % geschafft.' },
  { id: 'satzbauer', icon: '🧱', name: 'Satzbauer', text: '10 Sätze richtig gebaut.' },
  { id: 'formen', icon: '🏛️', name: 'Formen-Meister', text: '25 lateinische Formen richtig.' }
];

function isoHeute() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function isoGestern() { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

export async function hole(profilId) {
  const b = (await db.get('belohnungen', profilId)) || { profilId, punkte: 0, serie: { aktuell: 0, rekord: 0 }, abzeichen: [] };
  b.zaehler = { richtig: 0, satzbau: 0, formen: 0, sitzungen: 0, tests: 0, lerntage: 0, ...(b.zaehler || {}) };
  b.serie = { aktuell: 0, rekord: 0, ...(b.serie || {}) };
  b.abzeichen ||= [];
  b.punkteTag ||= {};
  return b;
}

/** Serie, wie sie heute gilt: wer gestern und heute nicht gelernt hat, steht wieder bei 0 */
export function serieJetzt(b) {
  const l = b.serie?.letzterLerntag;
  return l === isoHeute() || l === isoGestern() ? (b.serie.aktuell || 0) : 0;
}

function serieAktualisieren(b) {
  const h = isoHeute();
  const letzter = b.serie.letzterLerntag;
  if (letzter === h) return;
  b.zaehler.lerntage = (b.zaehler.lerntage || 0) + 1;   // für Gutscheine „Lerntage“
  b.serie.aktuell = letzter === isoGestern() ? b.serie.aktuell + 1 : 1;
  b.serie.rekord = Math.max(b.serie.rekord, b.serie.aktuell);
  b.serie.letzterLerntag = h;
}

function vergib(b, id, neu) {
  if (b.abzeichen.some((a) => a.id === id)) return;
  b.abzeichen.push({ id, erhaltenAm: new Date().toISOString() });
  neu.push(ABZEICHEN.find((a) => a.id === id));
}

function pruefeEinfache(b, neu) {
  if (b.zaehler.richtig >= 50) vergib(b, 'richtig_50', neu);
  if (b.zaehler.richtig >= 500) vergib(b, 'richtig_500', neu);
  if (b.zaehler.satzbau >= 10) vergib(b, 'satzbauer', neu);
  if (b.zaehler.formen >= 25) vergib(b, 'formen', neu);
  if (b.serie.aktuell >= 3) vergib(b, 'serie_3', neu);
  if (b.serie.aktuell >= 7) vergib(b, 'serie_7', neu);
  if (b.serie.aktuell >= 30) vergib(b, 'serie_30', neu);
}

function addPunkte(b, n) {
  b.punkte += n;
  const h = isoHeute();
  b.punkteTag[h] = (b.punkteTag[h] || 0) + n;
}

export async function nachAntwort(profilId, ergebnis, modus) {
  const b = await hole(profilId);
  const neu = [];
  const p = PUNKTE[ergebnis] ?? 0;
  addPunkte(b, p);
  serieAktualisieren(b);
  if (ergebnis !== 'falsch') {
    b.zaehler.richtig++;
    if (modus === 'satzbau') b.zaehler.satzbau++;
    if (modus === 'formen') b.zaehler.formen++;
  }
  pruefeEinfache(b, neu);
  await db.put('belohnungen', b);
  return { punkte: p, neueAbzeichen: neu };
}

export async function nachSitzung(profilId, { maxSerie = 0 } = {}) {
  const b = await hole(profilId);
  const neu = [];
  addPunkte(b, PUNKTE.sitzung);
  b.zaehler.sitzungen++;
  vergib(b, 'erste_uebung', neu);
  if (maxSerie >= 10) vergib(b, 'zehner', neu);
  // sichere Vokabeln zählen
  const ls = await db.byIndex('lernstand', 'profilId', profilId);
  if (ls.filter((l) => l.richtung === 'fd' && l.box >= 4).length >= 50) vergib(b, 'sicher_50', neu);
  const importe = await db.all('importe');
  if (importe.some((i) => i.rohtext && i.rohtext !== '(Beispiel)')) vergib(b, 'eigene_seite', neu);
  pruefeEinfache(b, neu);
  await db.put('belohnungen', b);
  return { punkte: PUNKTE.sitzung, neueAbzeichen: neu };
}

export async function nachTest(profilId, prozent) {
  const b = await hole(profilId);
  const neu = [];
  const p = Math.round(prozent / 2);
  addPunkte(b, p);
  b.zaehler.tests++;
  serieAktualisieren(b);
  if (prozent >= 75) vergib(b, 'test_bestanden', neu);
  if (prozent >= 100) vergib(b, 'test_perfekt', neu);
  pruefeEinfache(b, neu);
  await db.put('belohnungen', b);
  return { punkte: p, neueAbzeichen: neu };
}
