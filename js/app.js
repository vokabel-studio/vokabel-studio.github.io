// Vokabel-Studio – Start, Router, Grundgerüst
import * as db from './db.js';
import { FAECHER, LEHRWERKE } from './faecher.js';
import { esc, toast } from './util.js';
import * as V from './views.js';
import { importView } from './import-view.js';
import { lernenView, uebungView } from './lern-views.js';
import * as P from './plan-views.js';
import * as T from './teilen-views.js';
import { hoerquizView } from './hoerquiz.js';
import { qrSendenView, qrEmpfangenView } from './abgleich-views.js';
import { datenschutzView } from './datenschutz-views.js';
import { BETA, LS_PREFIX } from './config.js';
import { setzeDesign, setzeTextgroesse } from './design.js';
import { setzeStyle, style } from './styles.js';
import { setzeAnimationen } from './effekte.js';
import { avatarHtml } from './avatare.js';

const ROUTES = [
  ['', V.startView],
  ['profile', V.profileView],
  ['profil-neu', V.profilFormView],
  ['profil/:id', V.profilFormView],
  ['home', V.homeView],
  ['bibliothek', V.bibliothekView],
  ['lehrwerk/:id', V.lehrwerkView],
  ['lehrwerk-neu/:fachId', V.lehrwerkFormView],
  ['unit/:id', V.unitView],
  ['vokabel/:id', V.vokabelView],
  ['vokabel-bearbeiten/:id', V.vokabelFormView],
  ['vokabel-neu/:unitId', V.vokabelFormView],
  ['unit-bearbeiten/:id', V.unitFormView],
  ['unit-neu/:lwId', V.unitFormView],
  ['import', importView],
  ['backup', V.backupView],
  ['einstellungen', V.einstellungenView],
  ['lernen', lernenView],
  ['uebung', uebungView],
  ['hoerquiz', hoerquizView],
  ['plan', P.planView],
  ['termin-neu', P.terminFormView],
  ['termin/:id', P.terminView],
  ['druck', P.druckView],
  ['erfolge', P.erfolgeView],
  ['eltern', P.elternView],
  ['teilen', T.teilenView],
  ['paket-laden', T.paketLadenView],
  ['qr-senden', qrSendenView],
  ['qr-empfangen', qrEmpfangenView],
  ['datenschutz', datenschutzView]
];

function match(path) {
  const teile = path.split('/').filter(Boolean);
  for (const [muster, view] of ROUTES) {
    const m = muster.split('/').filter(Boolean);
    if (m.length !== teile.length) continue;
    const params = {};
    if (m.every((s, i) => (s.startsWith(':') ? ((params[s.slice(1)] = decodeURIComponent(teile[i])), true) : s === teile[i]))) {
      return { view, params };
    }
  }
  return null;
}

// --- aktives Profil (nur Komfort: localStorage, mit Absicherung) ---
const PROFIL_KEY = LS_PREFIX + 'aktives-profil';
export function aktivesProfilId() { try { return localStorage.getItem(PROFIL_KEY); } catch { return null; } }
export function setzeAktivesProfil(id) { try { id ? localStorage.setItem(PROFIL_KEY, id) : localStorage.removeItem(PROFIL_KEY); } catch { /* privat */ } }

export function go(path) { location.hash = '#/' + path; }

const ctx = { go, profil: null, rerender: () => render(), setzeAktivesProfil };

// Jeder Seitenaufbau bekommt eine Nummer. Wird beim schnellen Wechseln eine ältere Seite erst später fertig,
// darf sie die neuere nicht mehr überschreiben.
let renderNr = 0;

async function render() {
  const nr = ++renderNr;
  const roh = location.hash.replace(/^#\/?/, '');
  const [path, qs] = roh.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const treffer = match(path) || match('');
  if (!path.startsWith('eltern')) P.elternSperren();   // Eltern-Bereich beim Verlassen wieder sperren
  const id = aktivesProfilId();
  ctx.profil = id ? await db.get('profile', id) : null;
  if (!ctx.profil && id) setzeAktivesProfil(null);
  setzeDesign(ctx.profil?.einstellungen?.design || 'auto');
  setzeTextgroesse(ctx.profil?.einstellungen?.textgroesse || 'normal');
  setzeStyle(ctx.profil?.einstellungen?.style || 'standard');
  setzeAnimationen(ctx.profil?.einstellungen?.animationen);

  const main = document.getElementById('app');
  try {
    const r = await treffer.view({ ...treffer.params, query }, ctx);
    if (!r) return;   // View hat umgeleitet
    if (nr !== renderNr) return;   // inzwischen wurde eine andere Seite aufgerufen
    document.getElementById('title').textContent = r.title || 'Vokabel-Studio';
    if (r.logo) document.getElementById('title').insertAdjacentHTML('afterbegin', `<img src="${style().logo}" class="titel-logo" alt="">`);
    document.title = r.title && r.title !== 'Vokabel-Studio' ? `${r.title} – Vokabel-Studio` : 'Vokabel-Studio';
    const back = document.getElementById('btn-back');
    back.hidden = !r.back;
    back.onclick = () => (r.back === 'history' ? history.back() : go(r.back));
    const pb = document.getElementById('btn-profile');
    pb.hidden = !ctx.profil || r.hideProfile;
    pb.innerHTML = ctx.profil ? avatarHtml(ctx.profil.avatar, 24) : '';
    pb.title = ctx.profil ? `${ctx.profil.name} – Profil wechseln` : '';
    main.innerHTML = r.html;
    if (r.bind) await r.bind(main);
    if (!r.keepScroll) window.scrollTo(0, 0);
    if (BETA) document.getElementById('title').insertAdjacentHTML('beforeend', ' <span class="badge warn">BETA</span>');
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="msg err"><strong>Da ist etwas schiefgelaufen.</strong><br>${esc(e.message || e)}</div>
      <a class="btn secondary block" href="#/home">Zur Startseite</a>`;
  }
}

async function seed() {
  if ((await db.getMeta('seed', 0)) >= 1) return;
  const ops = [
    ...FAECHER.map((f) => ({ store: 'faecher', op: 'put', value: { ...f } })),
    ...LEHRWERKE.map((l) => ({ store: 'lehrwerke', op: 'put', value: { ...l, vorinstalliert: true } }))
  ];
  await db.batch(ops, { roh: true });   // ohne Zeitstempel: Löschungen von anderen Geräten gewinnen
  await db.setMeta('seed', 1);
}

async function start() {
  document.getElementById('btn-profile').onclick = () => go('profile');
  if (BETA) document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'Vokabeln Beta');
  try {
    await db.openDb();
    await seed();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="msg err"><strong>Der Speicher auf diesem Gerät ist nicht verfügbar.</strong><br>
      ${esc(e.message || e)}<br><br>Mögliche Ursache: privater Modus in Safari. Bitte die App normal öffnen.</div>`;
    return;
  }
  // Rückkehr von der Anmeldung bei einem Cloud-Anbieter (OneDrive)?
  const OD = await import('./cloud-onedrive.js');
  if (OD.istRueckkehr()) {
    try { await OD.anmeldungAbschliessen(); toast('Mit OneDrive verbunden ✓ Gleiche ab …', 4000); }
    catch (e) { toast(e.message || 'Anmeldung hat nicht geklappt.', 6000); }
  }
  window.addEventListener('hashchange', render);
  render();
  import('./sicherung.js').then((m) => m.autoSicherung()).catch(() => {});
  cloudAbgleich();
  import('./lernen.js').then((m) => m.archiviereEreignisse()).catch((e) => console.warn('Aufräumen:', e));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => toast('App wurde aktualisiert.'));
  }
}

// Automatischer Cloud-Abgleich (falls verbunden). Neue Daten vom anderen Gerät: Übersichtsseiten neu zeichnen,
// auf allen anderen Seiten (Formulare, Übungen) nicht stören – dort sieht man es beim nächsten Seitenwechsel.
export async function cloudAbgleich() {
  try {
    const C = await import('./cloud.js');
    const s = await C.autoAbgleich();
    if (!s) return;
    const seite = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    if (seite === 'backup') { render(); return; }   // Status „Zuletzt abgeglichen“ sofort zeigen
    if (!(s.neu + s.geaendert + s.geloescht)) return;
    if (['', 'home', 'bibliothek', 'plan', 'erfolge', 'backup', 'profile'].includes(seite)) render();
    else toast('🔄 Neue Daten vom anderen Gerät übernommen.');
  } catch { /* Status steht unter Sicherung */ }
}

start();
