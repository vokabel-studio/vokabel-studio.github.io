// Gutscheine: Eltern legen Belohnungen mit eigenem Text an (z. B. „Cheeseburger“, „15 Minuten extra Gaming“).
// Das Kind schaltet sie durch Lernen frei; eingelöst werden sie nur mit der Eltern-PIN.
// Gespeichert je Profil im Datensatz „belohnungen“ (kommt damit auch in die Sicherung):
//   b.gutscheine    = [{ id, gruppe, text, emoji, art, anzahl, minProzent, wiederholen, startWert, erstelltAm, erreicht, erledigt }]
//   b.freigeschaltet = [{ id, gutscheinId, text, emoji, am, eingeloestAm }]
import * as db from './db.js';
import { uid, esc } from './util.js';
import { hole } from './belohnung.js';
import * as fx from './effekte.js';

export const ARTEN = {
  tests: { name: 'Bestandene Abschlusstests', einheit: ['bestandener Test', 'bestandene Tests'] },
  uebungen: { name: 'Abgeschlossene Übungen (Tests zählen mit)', einheit: ['Übung', 'Übungen'] },
  lerntage: { name: 'Lerntage (Tage, an denen gelernt wurde)', einheit: ['Lerntag', 'Lerntage'] },
  serie: { name: 'Tage am Stück gelernt (nur einmalig)', einheit: ['Tag am Stück', 'Tage am Stück'], nurEinmalig: true },
  punkte: { name: 'Gesammelte Punkte', einheit: ['Punkt', 'Punkte'] }
};
export const EMOJIS = ['🍔', '🍦', '🍟', '🍕', '🍫', '🎮', '📺', '🎬', '⚽', '🏊', '🛝', '🧸', '📚', '💶', '🎁', '⭐'];

export const einheit = (art, n) => `${n} ${ARTEN[art].einheit[n === 1 ? 0 : 1]}`;
/** z. B. „10 bestandene Tests (ab 75 %) · immer wieder“ */
export const bedingung = (g) => `${einheit(g.art, g.anzahl)}${g.art === 'tests' ? ` (ab ${g.minProzent ?? 75} %)` : ''} · ${g.wiederholen ? 'immer wieder' : 'einmalig'}`;

export function fortschrittHtml(g, b, tests) {
  const f = fortschritt(g, b, tests);
  return `<div class="gs-zeile"><span class="gs-emoji-klein">${esc(g.emoji || '🎁')}</span>
    <span class="grow"><strong>${esc(g.text)}</strong><br><span class="small muted">${esc(bedingung(g))}</span>
    <span class="bar gs-bar"><span style="width:${Math.round(f.wert / f.ziel * 100)}%"></span></span>
    <span class="small"><strong>${f.wert}</strong> von ${f.ziel}${f.ziel - f.wert > 0 ? ` – noch ${f.ziel - f.wert}!` : ''}</span></span></div>`;
}

// Ein Test zählt höchstens einmal pro Tag und Unit-Auswahl (sonst könnte man denselben leichten Test 10× hintereinander machen)
function testsBestanden(tests, g) {
  const gesehen = new Set();
  for (const t of tests) {
    if (t.zeitpunkt < g.erstelltAm || t.prozent < (g.minProzent ?? 75)) continue;
    gesehen.add(`${[...(t.unitIds || [t.unitId])].sort().join(',')}|${t.zeitpunkt.slice(0, 10)}`);
  }
  return gesehen.size;
}

function rohwert(art, b) {
  if (art === 'uebungen') return (b.zaehler.sitzungen || 0) + (b.zaehler.tests || 0);
  if (art === 'lerntage') return b.zaehler.lerntage || 0;
  if (art === 'punkte') return b.punkte || 0;
  if (art === 'serie') return b.serie.aktuell || 0;
  return 0;
}

/** Wie weit ist das Kind seit dem Anlegen des Gutscheins gekommen? */
function stand(g, b, tests) {
  if (g.art === 'tests') return testsBestanden(tests, g);
  if (g.art === 'serie') return rohwert('serie', b);
  return Math.max(0, rohwert(g.art, b) - (g.startWert || 0));
}

/** Fortschritt bis zum nächsten Freischalten: { wert, ziel } */
export function fortschritt(g, b, tests) {
  const s = stand(g, b, tests);
  if (!g.wiederholen || g.art === 'serie') return { wert: Math.min(s, g.anzahl), ziel: g.anzahl };
  return { wert: Math.max(0, s - g.erreicht * g.anzahl), ziel: g.anzahl };
}

export async function daten(profilId) {
  const [b, tests] = await Promise.all([hole(profilId), db.byIndex('tests', 'profilId', profilId)]);
  b.gutscheine ||= [];
  b.freigeschaltet ||= [];
  return { b, tests };
}

/** Gutschein für ein oder mehrere Profile anlegen */
export async function erstelle(profilIds, { text, emoji, art, anzahl, minProzent, wiederholen }) {
  const gruppe = uid('gg');
  for (const pid of profilIds) {
    const { b } = await daten(pid);
    b.gutscheine.push({
      id: uid('g'), gruppe, text, emoji, art, anzahl, minProzent: art === 'tests' ? minProzent : null,
      wiederholen: ARTEN[art].nurEinmalig ? false : !!wiederholen,
      startWert: rohwert(art, b), erstelltAm: new Date().toISOString(), erreicht: 0, erledigt: false
    });
    await db.put('belohnungen', b);
  }
}

export async function loesche(profilId, gutscheinId) {
  const { b } = await daten(profilId);
  b.gutscheine = b.gutscheine.filter((g) => g.id !== gutscheinId);
  b.gutscheineWeg = [...new Set([...(b.gutscheineWeg || []), gutscheinId])];   // damit ein Abgleich ihn nicht zurückholt
  await db.put('belohnungen', b);
}

export async function einloesen(profilId, freiId) {
  const { b } = await daten(profilId);
  const f = b.freigeschaltet.find((x) => x.id === freiId);
  if (f && !f.eingeloestAm) { f.eingeloestAm = new Date().toISOString(); await db.put('belohnungen', b); }
}

/** Nach einer Übung/einem Test: neu erreichte Gutscheine freischalten. Gibt die neuen zurück. */
export async function pruefe(profilId) {
  const { b, tests } = await daten(profilId);
  const neu = [];
  for (const g of b.gutscheine) {
    if (g.erledigt) continue;
    const s = stand(g, b, tests);
    const soll = g.wiederholen ? Math.floor(s / g.anzahl) : (s >= g.anzahl ? 1 : 0);
    while (g.erreicht < soll) {
      const f = { id: uid('gf'), gutscheinId: g.id, text: g.text, emoji: g.emoji, am: new Date().toISOString(), eingeloestAm: null };
      b.freigeschaltet.push(f); neu.push(f);
      g.erreicht++;
    }
    if (!g.wiederholen && g.erreicht >= 1) g.erledigt = true;
  }
  if (neu.length) await db.put('belohnungen', b);
  return neu;
}

export async function offene(profilId) {
  const { b } = await daten(profilId);
  return b.freigeschaltet.filter((f) => !f.eingeloestAm);
}

export function gutscheinHtml(f, extra = '') {
  return `<div class="gutschein"><div class="gs-emoji">${esc(f.emoji || '🎁')}</div>
    <div class="grow"><div class="gs-titel">Gutschein</div><div class="gs-text">${esc(f.text)}</div>${extra}</div></div>`;
}

/** Große Einblendung „Gutschein freigeschaltet!“ – immer, auch wenn Animationen aus sind (es ist ja eine echte Belohnung) */
export function feiere(liste) {
  if (!liste.length) return;
  const f = liste[0];
  const box = document.createElement('div');
  box.className = 'gs-overlay';
  box.innerHTML = `<div class="gs-overlay-karte" role="dialog" aria-label="Gutschein freigeschaltet">
    <div class="gs-overlay-kopf">🎟️ Gutschein freigeschaltet!</div>
    ${gutscheinHtml(f)}
    <p class="small muted">Zeig ihn deinen Eltern – du findest ihn unter „Erfolge“.</p>
    <button class="btn block">Super! 🎉</button></div>`;
  document.body.appendChild(box);
  fx.konfetti(3, { erzwingen: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
  box.querySelector('button').onclick = () => { box.remove(); feiere(liste.slice(1)); };
}
