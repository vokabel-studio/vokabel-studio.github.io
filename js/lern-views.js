// Lernbereich: Auswahl (Hub) und Übungs-Sitzung mit allen Modi
import * as db from './db.js';
import { fach as getFach, lehrwerkName, WORTART_NAMEN } from './faecher.js';
import { esc, $, $$, toast, copyText, plural, uid, isIOS } from './util.js';
import { sprich, hoere, sttKlasse, mikroVerbraucht } from './speech.js';
import * as L from './lernen.js';
import { formenAufgaben, tabelleHtml } from './latein.js';
import { nachSitzung, nachTest } from './belohnung.js';
import { formenHtml } from './views.js';
import * as fx from './effekte.js';
import { E as emo } from './styles.js';
import { LS_PREFIX } from './config.js';

// ---------- gemeinsame Daten ----------
export async function unitKontext() {
  const [units, lehrwerke] = await Promise.all([db.all('units'), db.all('lehrwerke')]);
  const lw = new Map(lehrwerke.map((l) => [l.id, l]));
  const fachVonUnit = new Map(units.map((u) => [u.id, getFach(lw.get(u.lehrwerkId)?.fachId) || getFach('englisch')]));
  return { units, lw, fachVonUnit };
}

// ================= HUB =================
let H = null;   // Auswahl im Hub

export async function lernenView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const { units, lw, fachVonUnit } = await unitKontext();
  // nur zählen, nicht alle Vokabeln laden
  const nVok = new Map(), nSb = new Map();
  await Promise.all(units.map(async (u) => {
    const [a, b] = await Promise.all([db.countByIndex('vokabeln', 'unitId', u.id), db.countByIndex('satzbau', 'unitId', u.id)]);
    nVok.set(u.id, a); nSb.set(u.id, b);
  }));
  const offen = offeneSitzung(ctx.profil.id);
  const erlaubt = units.filter((u) => nVok.get(u.id) && (!ctx.profil.fachIds?.length || ctx.profil.fachIds.includes(fachVonUnit.get(u.id).id)));
  erlaubt.sort((a, b) => lehrwerkName(lw.get(a.lehrwerkId)).localeCompare(lehrwerkName(lw.get(b.lehrwerkId))) || a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));

  const key = JSON.stringify(query);
  if (!H || H.key !== key) {
    H = { key, auswahl: new Set(query.unit ? [query.unit] : erlaubt.slice(-1).map((u) => u.id)), richtung: '', anzahl: 20 };
  }
  if (!erlaubt.length) {
    return { title: 'Lernen', back: 'home', html: `<div class="card empty"><div class="big">📭</div><p>Noch keine Vokabeln zum Lernen. Lies zuerst eine Seite ein.</p><a class="btn" href="#/import">📸 Seite einlesen</a></div>` };
  }

  const gruppen = new Map();
  erlaubt.forEach((u) => { const k = u.lehrwerkId; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(u); });
  const html = `
    ${offen ? fortsetzenKarte(offen) : ''}
    <div class="card" style="text-align:center">
      <button class="btn block" id="h-faellig" style="min-height:72px;font-size:20px">🔁 Fällige wiederholen</button>
      <p class="muted small" id="h-info" style="margin-bottom:0"></p>
    </div>
    <h2 data-h="3">Welche Units?</h2>
    ${[...gruppen].map(([lwId, us]) => `
      <div class="card" style="padding:6px 14px">
        <div class="muted small" style="margin:6px 0">${esc(lehrwerkName(lw.get(lwId)))}</div>
        ${us.map((u) => `<label class="switch" style="display:flex;min-height:48px">
          <input type="checkbox" class="h-unit" value="${esc(u.id)}" ${H.auswahl.has(u.id) ? 'checked' : ''}>
          <span class="grow">${fachVonUnit.get(u.id).formenTyp === 'latein' ? 'Lektion' : 'Unit'} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span>
          <span class="badge">${nVok.get(u.id)}</span></label>`).join('')}
      </div>`).join('')}
    <div class="field-row">
      <div><label for="h-richtung">Richtung</label><select id="h-richtung">
        <option value="">wie in Einstellungen</option><option value="fd">Fremdsprache → Deutsch</option>
        <option value="df">Deutsch → Fremdsprache</option><option value="beide">beide</option></select></div>
      <div><label for="h-anzahl">Wie viele?</label><select id="h-anzahl">
        ${[10, 20, 30, 0].map((n) => `<option value="${n}" ${H.anzahl === n ? 'selected' : ''}>${n || 'alle'}</option>`).join('')}</select></div>
    </div>
    <h2 data-h="3">Wie willst du üben?</h2>
    <div class="grid">
      ${modusKachel('karten', '🃏', 'Lernkarten', 'umdrehen & selbst bewerten')}
      ${modusKachel('abfrage', '⌨️', 'Abfrage', 'tippen oder sprechen')}
      ${modusKachel('mc', '🔘', 'Auswahl', '4 Antworten, eine stimmt')}
      ${modusKachel('satzbau', '🧱', 'Satzbau', 'Sätze aus Bausteinen', 'h-sb')}
      ${modusKachel('frei', '✍️', 'Eigene Sätze', 'vom Chatbot prüfen lassen')}
      ${modusKachel('formen', '🏛️', 'Latein-Formen', 'Deklination, Konjugation, Stammformen', 'h-formen')}
      ${modusKachel('test', '📝', 'Abschlusstest', 'mit Prozent & Einschätzung')}
      <button class="tile" id="h-auto"><span class="tile-icon">🚗</span><span class="tile-title">Hör-Quiz</span><span class="tile-sub">fürs Auto: hören & laut antworten</span></button>
      <button class="tile" id="h-druck"><span class="tile-icon">🖨️</span><span class="tile-title">Test drucken</span><span class="tile-sub">als PDF oder Papier</span></button>
    </div>`;
  return {
    title: 'Lernen', back: 'home', html,
    bind(root) {
      const aktualisiere = async () => {
        const ids = [...H.auswahl];
        const latein = ids.some((id) => fachVonUnit.get(id)?.formenTyp === 'latein');
        const sb = ids.reduce((s, id) => s + (nSb.get(id) || 0), 0);
        $('#h-formen', root).hidden = !latein;
        $('#h-sb', root).hidden = !sb;
        $$('.tile[data-modus]', root).forEach((t) => t.toggleAttribute('disabled', !ids.length));
        $('#h-faellig', root).disabled = !ids.length;
        $('#h-auto', root).toggleAttribute('disabled', !ids.length);
        if (!ids.length) { $('#h-info', root).textContent = 'Wähle mindestens eine Unit.'; return; }
        const z = await L.faelligZahlen(ctx.profil, { unitIds: ids, richtungOverride: H.richtung || null });
        $('#h-info', root).textContent = `${plural(z.faellig, 'Vokabel', 'Vokabeln')} fällig · ${z.neuHeute} neue für heute`
          + (z.neu > z.neuHeute ? ` (${z.neu} noch nie geübt, Tagesziel ${ctx.profil.einstellungen?.tagesziel || 20})` : '');
      };
      $$('.h-unit', root).forEach((c) => c.onchange = () => { c.checked ? H.auswahl.add(c.value) : H.auswahl.delete(c.value); aktualisiere(); });
      $('#h-richtung', root).value = H.richtung;
      $('#h-richtung', root).onchange = (e) => { H.richtung = e.target.value; aktualisiere(); };
      $('#h-anzahl', root).onchange = (e) => { H.anzahl = +e.target.value; };
      $('#h-faellig', root).onclick = () => starte({ modus: 'faellig' }, ctx);
      $$('.tile[data-modus]', root).forEach((t) => t.onclick = () => starte({ modus: t.dataset.modus }, ctx));
      bindFortsetzen(root, ctx);
      $('#h-auto', root).onclick = () => { if (H.auswahl.size) ctx.go(`hoerquiz?units=${[...H.auswahl].join(',')}&richtung=${H.richtung || ''}&anzahl=${H.anzahl}`); };
      $('#h-druck', root).onclick = () => ctx.go(`druck?units=${[...H.auswahl].join(',')}&n=${H.anzahl || 0}&richtung=${H.richtung || 'beide'}`);
      aktualisiere();
    }
  };

  async function starte({ modus }, ctx2) {
    const ids = [...H.auswahl];
    if (!ids.length) return;
    const r = await starteSitzung({ modus, unitIds: ids, anzahl: H.anzahl, richtung: H.richtung || null, zurueck: 'lernen' }, ctx2.profil);
    if (r.leer) { toast(r.leer); return; }
    ctx2.go('uebung');
  }
}

const modusKachel = (modus, icon, titel, sub, id = '') =>
  `<button class="tile" data-modus="${modus}" ${id ? `id="${id}"` : ''}><span class="tile-icon">${icon}</span><span class="tile-title">${titel}</span><span class="tile-sub">${sub}</span></button>`;

// ================= SITZUNG =================
let S = null;

// Angefangene Übung merken: Android/iOS beenden die App im Hintergrund gern – dann kann man weitermachen.
const SITZ_KEY = LS_PREFIX + 'sitzung';
const SITZ_MAX_ALTER = 48 * 3600 * 1000;
function merkeSitzung() {
  try {
    if (!S || S.ende || S.i >= S.items.length) { localStorage.removeItem(SITZ_KEY); return; }
    const { autoTimer, ...rest } = S;
    localStorage.setItem(SITZ_KEY, JSON.stringify({ ...rest, gemerktAm: Date.now() }));
  } catch { /* Speicher voll oder privat – dann eben ohne */ }
}
export function vergissSitzung() { S = null; try { localStorage.removeItem(SITZ_KEY); } catch { /* egal */ } }
/** Angefangene Übung dieses Profils (aus dem Speicher oder vom Gerät gemerkt) */
export function offeneSitzung(profilId) {
  if (S && S.profilId === profilId && !S.ende && S.i < S.items.length) return S;
  if (S && !S.ende && S.i < S.items.length) return null;   // gehört einem anderen Profil
  try {
    const x = JSON.parse(localStorage.getItem(SITZ_KEY) || 'null');
    if (x && x.profilId === profilId && x.i < x.items.length && Date.now() - x.gemerktAm < SITZ_MAX_ALTER) { S = x; return S; }
  } catch { /* egal */ }
  return null;
}
export function fortsetzenKarte(o) {
  return `<div class="card heute">
    <div class="check-head"><strong class="grow">▶️ Angefangene Übung</strong><span class="badge">${o.i} von ${o.items.length} geschafft</span></div>
    <p class="small" style="margin:6px 0">${esc(o.titel)} – du kannst genau da weitermachen, wo du aufgehört hast.</p>
    <div class="btn-row" style="margin-bottom:0"><a class="btn" href="#/uebung">Weitermachen</a><button class="btn secondary" id="sitz-weg">Verwerfen</button></div>
  </div>`;
}
export function bindFortsetzen(root, ctx) {
  const b = $('#sitz-weg', root);
  if (b) b.onclick = () => { if (confirm('Angefangene Übung verwerfen? Was du schon beantwortet hast, bleibt gespeichert.')) { vergissSitzung(); ctx.rerender(); } };
}

/**
 * cfg: { modus, unitIds, anzahl, richtung, zurueck, vokabelIds?, titel?, terminRef? }
 * modus: faellig | karten | abfrage | mc | neu | satzbau | frei | formen | test | schwach
 */
export async function starteSitzung(cfg, profil) {
  const { fachVonUnit } = await unitKontext();
  const pool = await L.vokabelnFuerUnits(cfg.unitIds);
  const rs = L.richtungen(profil, cfg.richtung);
  const anz = cfg.anzahl || 0;
  const begrenze = (arr, n = anz) => (n ? arr.slice(0, n) : arr);
  const zufallR = () => rs[Math.floor(Math.random() * rs.length)];
  let auswahl = cfg.vokabelIds ? pool.filter((v) => cfg.vokabelIds.includes(v.id)) : pool;
  let items = [];
  let titel = cfg.titel;

  switch (cfg.modus) {
    case 'faellig': {
      const f = await L.faelligePaare(profil, { unitIds: cfg.unitIds, richtungOverride: cfg.richtung });
      const paare = begrenze([...f.faellig, ...L.mische(f.neu)], anz || 25);
      if (!paare.length) {
        return { leer: f.neuGesamt && !f.tagesRest
          ? 'Für heute hast du genug neue Vokabeln gelernt! 🎉 Morgen kommen neue. Üben kannst du trotzdem – z. B. mit Lernkarten.'
          : 'Super – gerade ist nichts fällig! 🎉' };
      }
      items = paare.map((p, i) => ({ typ: p.box === 0 ? 'karte' : (i % 2 ? 'mc' : 'tippen'), v: p.v, richtung: p.richtung }));
      // neue Wörter: erst Karte, später zusätzlich abfragen
      items = [...items, ...paare.filter((p) => p.box === 0).map((p) => ({ typ: 'mc', v: p.v, richtung: p.richtung }))];
      titel ||= 'Fällige Vokabeln';
      break;
    }
    case 'karten': case 'abfrage': case 'mc': case 'schwach': {
      const typ = { karten: 'karte', abfrage: 'tippen', mc: 'mc', schwach: 'tippen' }[cfg.modus];
      items = begrenze(L.mische(auswahl)).map((v) => ({ typ, v, richtung: zufallR() }));
      titel ||= { karten: 'Lernkarten', abfrage: 'Abfrage', mc: 'Auswahl', schwach: 'Schwache Vokabeln' }[cfg.modus];
      break;
    }
    case 'neu': {
      const sel = begrenze(auswahl);
      items = [...sel.map((v) => ({ typ: 'karte', v, richtung: 'fd' })), ...L.mische(sel).map((v) => ({ typ: 'mc', v, richtung: zufallR() }))];
      titel ||= 'Neue Vokabeln';
      break;
    }
    case 'satzbau': {
      const alle = (await Promise.all(cfg.unitIds.map((id) => db.byIndex('satzbau', 'unitId', id)))).flat();
      items = begrenze(L.mische(alle), anz || 10).map((a) => ({ typ: 'satzbau', a, fach: fachVonUnit.get(a.unitId) }));
      titel = 'Satzbau';
      break;
    }
    case 'frei': {
      items = begrenze(L.mische(auswahl), Math.min(anz || 5, 5)).map((v) => ({ typ: 'frei', v }));
      titel = 'Eigene Sätze';
      break;
    }
    case 'formen': {
      const latein = auswahl.filter((v) => fachVonUnit.get(v.unitId)?.formenTyp === 'latein');
      items = begrenze(L.mische(latein.flatMap((v) => formenAufgaben(v).map((f) => ({ typ: 'formen', v, f })))), anz || 15);
      titel = 'Latein-Formen';
      break;
    }
    case 'test': {
      items = begrenze(L.mische(auswahl), anz || 20).map((v) => ({ typ: 'tippen', v, richtung: zufallR(), test: true }));
      titel = 'Abschlusstest';
      break;
    }
  }
  if (!items.length) return { leer: 'Dafür gibt es in dieser Auswahl keine Aufgaben.' };
  items.forEach((it) => { it.id = uid('q'); if (it.v) it.fach = fachVonUnit.get(it.v.unitId); });
  S = { cfg, titel, items, i: 0, pool, profilId: profil.id, punkte: 0, serie: 0, maxSerie: 0, neueAbzeichen: [], antworten: [], fb: null, ende: null };
  merkeSitzung();
  return { ok: true };
}

export async function uebungView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  if (!S || S.profilId !== ctx.profil.id) offeneSitzung(ctx.profil.id);
  if (!S || S.profilId !== ctx.profil.id) { ctx.go('lernen'); return null; }
  if (S.i >= S.items.length) return endeView(ctx);
  merkeSitzung();
  const it = S.items[S.i];
  const kopf = `
    <div class="sess-head"><span>${S.i + 1} / ${S.items.length}</span><span class="grow"><span class="bar"><span style="width:${Math.round(S.i / S.items.length * 100)}%"></span></span></span>
    ${S.cfg.modus === 'test' ? '' : `<span>${emo('punkt')} ${S.punkte}</span>`}</div>`;
  const r = await ({ karte: karteItem, tippen: tippItem, mc: mcItem, satzbau: satzbauItem, formen: formenItem, frei: freiItem }[it.typ])(it, ctx);
  const bind = async (root) => {
    await r.bind?.(root);
    // Animation bei richtiger Antwort (nur wenn eingeschaltet)
    if (S.fb && S.fb.ergebnis !== 'falsch' && !S.fb.fx) {
      S.fb.fx = true;
      const el = root.querySelector('.msg.ok, .msg.warn, .btn.ok');
      fx.puls(el);
      fx.punkte(S.fb.ergebnis === 'fast' ? 7 : 10, el);
    }
  };
  return { title: S.titel, back: S.cfg.zurueck || 'lernen', keepScroll: !!r.keepScroll, html: kopf + r.html, bind };
}

const sprachLang = (it, seite) => (seite === 'fremd' ? it.fach.vorlesen.stimmeSprache : 'de-DE');
const sprechText = (v) => v.wort.replace(/^\(to\)\s*/, 'to ').replace(/…/g, '');
function sprechKnopf(text, lang, gross = false) {
  return `<button class="speak${gross ? '' : ' small'}" data-say="${esc(text)}" data-lang="${esc(lang)}" aria-label="Vorlesen">🔊</button>`;
}
function bindSprechen(root, ctx) {
  $$('[data-say]', root).forEach((b) => b.onclick = async (e) => {
    e.preventDefault();
    const r = await sprich(b.dataset.say, b.dataset.lang, { rate: ctx.profil.einstellungen?.sprechtempo || 0.9 });
    if (!r.ok) toast(r.grund);
  });
}
function autoVorlesen(it, ctx) {
  if (!ctx.profil.einstellungen?.vorlesenAutomatisch || S.fb) return;
  if (it.richtung === 'fd') sprich(sprechText(it.v), sprachLang(it, 'fremd'), { rate: ctx.profil.einstellungen?.sprechtempo || 0.9 });
}
function frageKarte(it) {
  const fd = it.richtung === 'fd';
  const ziel = fd ? 'Deutsch' : it.fach.fremdsprache.name;
  return `<div class="card flash">
    <div class="muted small">${esc(WORTART_NAMEN[it.v.wortart] || '')} · auf ${esc(ziel)}?</div>
    <div class="wort" ${fd ? `lang="${it.fach.kurz}"` : ''}>${esc(L.frage(it.v, it.richtung))}</div>
    ${fd && it.v.lautschrift ? `<div class="ipa">[${esc(it.v.lautschrift)}]</div>` : ''}
    <div style="margin-top:8px">${fd ? sprechKnopf(sprechText(it.v), sprachLang(it, 'fremd'), true) : sprechKnopf(it.v.bedeutungen.join(', '), 'de-DE', true)}</div>
    ${fd && it.fach.vorlesen.hinweis ? `<div class="hinweis-latein">🇮🇹 ${esc(it.fach.vorlesen.hinweis)}</div>` : ''}
  </div>`;
}
// Zusatzinfos als Karte – nur wenn es welche gibt (sonst keine leere Box)
function zusatzKarte(v, fach) {
  const z = zusatzKurz(v, fach).trim();
  return z ? `<div class="card">${z}</div>` : '';
}
function zusatzKurz(v, fach) {
  const b = v.beispiele?.[0];
  return `${formenHtml(v, fach)}
    ${b ? `<p class="small"><strong lang="${fach.kurz}">${esc(b.fremd)}</strong>${b.deutsch ? `<br><span class="muted">${esc(b.deutsch)}</span>` : ''}</p>` : ''}
    ${v.stolpersteine?.[0] ? `<p class="small">⚠️ ${esc(v.stolpersteine[0])}</p>` : ''}`;
}

async function weiter(ctx, ergebnis, extra = {}) {
  const it = S.items[S.i];
  const korrekt = ergebnis !== 'falsch';
  let res = { punkte: 0, neueAbzeichen: [] };
  if (it.v && ['karte', 'tippen', 'mc'].includes(it.typ)) {
    res = await L.bewerte(S.profilId, it.v.id, it.richtung, ergebnis, { modus: it.test ? 'test' : it.typ, antwort: extra.antwort || '', zaehlen: !it.test });
  } else if (it.typ === 'satzbau' || it.typ === 'formen' || it.typ === 'frei') {
    res = await L.protokolliere(S.profilId, it.typ, korrekt, { aufgabeId: it.a?.id || null, vokabelId: it.v?.id || null, antwort: extra.antwort || '' });
  }
  S.punkte += res.punkte;
  S.neueAbzeichen.push(...res.neueAbzeichen);
  res.neueAbzeichen.forEach((a, i) => setTimeout(() => { if (!fx.abzeichen(a)) toast(`${a.icon} Neues Abzeichen: ${a.name}!`, 3500); }, i * 3400));
  S.serie = korrekt ? S.serie + 1 : 0;
  S.maxSerie = Math.max(S.maxSerie, S.serie);
  S.antworten.push({ item: it, ergebnis, antwort: extra.antwort || '' });
  if (!korrekt && !it.test && !it.wdh && ['karte', 'tippen', 'mc'].includes(it.typ)) {
    S.items.push({ ...it, id: uid('q'), wdh: true, typ: it.typ === 'karte' ? 'tippen' : it.typ });
  }
  S.i++; S.fb = null; S.umgedreht = false; S.sb = null;
  ctx.rerender();
}

// ---------- Karte ----------
async function karteItem(it, ctx) {
  const v = it.v;
  const html = `
    ${S.umgedreht ? `<div class="card flash">
        <div class="wort" lang="${it.fach.kurz}">${esc(v.wort)}</div>
        ${v.lautschrift ? `<div class="ipa">[${esc(v.lautschrift)}]</div>` : ''}
        <div style="margin:8px 0">${sprechKnopf(sprechText(v), sprachLang(it, 'fremd'), true)}</div>
        <div class="de">${esc(v.bedeutungen.join('; '))}</div>
      </div>
      <div class="card">${zusatzKurz(v, it.fach) || '<span class="muted small">Keine Zusatzinfos.</span>'}</div>
      <p style="text-align:center" class="muted">Wusstest du es?</p>
      <div class="btn-row"><button class="btn danger" id="k-nein">✗ Noch nicht</button><button class="btn ok" id="k-ja">✓ Gewusst</button></div>`
    : `${frageKarte(it)}<button class="btn block" id="k-dreh" style="min-height:72px">Umdrehen ↻</button>`}`;
  return {
    html,
    bind(root) {
      bindSprechen(root, ctx);
      if (!S.umgedreht) { autoVorlesen(it, ctx); $('#k-dreh', root).onclick = () => { S.umgedreht = true; ctx.rerender(); }; return; }
      $('#k-ja', root).onclick = () => weiter(ctx, 'richtig');
      $('#k-nein', root).onclick = () => weiter(ctx, 'falsch');
    }
  };
}

// ---------- Tippen / Sprechen ----------
async function tippItem(it, ctx) {
  const fb = S.fb;
  const antwortSprache = it.richtung === 'fd' ? 'de-DE' : it.fach.spracheingabe.fremd;
  // iOS: App-Spracheingabe klappt nur 1× pro App-Start (Gerätetests 23.11.2026, alle Varianten) → dort Tastatur-Diktat statt Knopf
  const mic = !it.test && sttKlasse() && antwortSprache && !isIOS();
  const loes = L.loesungen(it.v, it.richtung);
  const html = `
    ${frageKarte(it)}
    <input id="t-in" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
      placeholder="Antwort eingeben" value="${esc(fb?.antwort || '')}" ${fb ? 'readonly' : ''} enterkeyhint="done">
    ${it.fach.formenTyp === 'latein' && it.richtung === 'df' ? '<p class="muted small">Längenzeichen (ā, ē …) musst du nicht tippen.</p>' : ''}
    ${!it.test && !mic && it.richtung === 'df' && it.fach.formenTyp === 'latein' && sttKlasse() ? '<p class="muted small">🎤 Für Latein gibt es keine Spracheingabe – bitte tippen.</p>' : ''}
    ${!it.test && !fb && isIOS() && antwortSprache ? '<p class="diktat-tipp">🎤 <strong>Sprechen statt tippen:</strong> ins Feld tippen, dann auf das Mikrofon unten rechts auf der Tastatur.</p>' : ''}
    ${fb ? feedbackHtml(fb, loes, it) : `
      <div class="btn-row">
        ${mic ? '<button class="btn secondary" id="t-mic" style="flex:0 0 72px">🎤</button>' : ''}
        <button class="btn" id="t-ok">${it.test ? 'Weiter ›' : 'Prüfen'}</button>
      </div>
      <button class="btn secondary block" id="t-weiss-nicht">Weiß ich nicht</button>`}`;
  return {
    html,
    bind(root) {
      bindSprechen(root, ctx);
      const inp = $('#t-in', root);
      if (fb) {
        $('#t-weiter', root).onclick = () => weiter(ctx, S.fb.ergebnis, { antwort: S.fb.antwort });
        const rr = $('#t-recht', root);
        if (rr) rr.onclick = () => { S.fb.ergebnis = 'richtig'; weiter(ctx, 'richtig', { antwort: S.fb.antwort }); };
        $('#t-weiter', root).focus();
        return;
      }
      autoVorlesen(it, ctx);
      setTimeout(() => inp.focus(), 50);
      const pruefen = (wert) => {
        const antwort = (wert ?? inp.value).trim();
        if (!antwort && !it.test) { toast('Tippe eine Antwort ein oder „Weiß ich nicht“.'); return; }
        const r = L.pruefeAntwort(antwort, loes);
        if (it.test) { weiter(ctx, r.ergebnis, { antwort }); return; }
        S.fb = { ...r, antwort };
        ctx.rerender();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); pruefen(); } };
      $('#t-ok', root).onclick = () => pruefen();
      $('#t-weiss-nicht', root).onclick = () => { if (it.test) weiter(ctx, 'falsch', { antwort: '' }); else { S.fb = { ergebnis: 'falsch', antwort: '' }; ctx.rerender(); } };
      const m = $('#t-mic', root);
      if (m) {
        let lauf = null;
        m.onclick = async () => {
          if (lauf) { lauf.stop(); return; }
          // iOS: Spracherkennung klappt nur 1× pro App-Start → dann direkt Tastatur-Diktat anbieten
          if (mikroVerbraucht()) {
            inp.focus();
            toast('Tippe jetzt auf das 🎤 unten auf der Tastatur und sprich. (Das iPhone erlaubt die App-Spracheingabe nur einmal pro Start.)', 6000);
            return;
          }
          m.textContent = '⏹'; inp.placeholder = 'Ich höre zu …';
          lauf = hoere(antwortSprache, { onZwischen: (t) => { inp.value = t; } });
          const r = await lauf; lauf = null;
          m.textContent = '🎤'; inp.placeholder = 'Antwort eingeben';
          if (r.ok) { inp.value = r.text; const treffer = r.alternativen.find((a) => L.pruefeAntwort(a, loes).ergebnis === 'richtig'); pruefen(treffer || r.text); }
          else if (r.keinTon && isIOS()) toast('Das iPhone gibt das Mikrofon gerade nicht frei. Tipp: Tippe ins Antwortfeld und nutze das 🎤 auf der Tastatur.', 6000);
          else toast(r.grund + ' Du kannst auch tippen.');
        };
      }
    }
  };
}

function feedbackHtml(fb, loes, it) {
  const kl = fb.ergebnis === 'richtig' ? 'ok' : fb.ergebnis === 'fast' ? 'warn' : 'err';
  const titel = fb.ergebnis === 'richtig' ? '✓ Richtig!' : fb.ergebnis === 'fast' ? (it.richtung === 'df' ? '≈ Fast richtig – achte auf die Schreibweise. Die Vokabel kommt morgen noch mal.' : '≈ Fast richtig – achte auf die Schreibweise.') : fb.antwort ? '✗ Leider falsch.' : 'Kein Problem – merk es dir:';
  return `<div class="msg ${kl}"><strong>${titel}</strong><br>
    ${fb.ergebnis !== 'richtig' || loes.length > 1 ? `Lösung: <strong>${esc(loes.join('; '))}</strong>` : ''}</div>
    ${zusatzKarte(it.v, it.fach)}
    <div class="btn-row">
      ${fb.ergebnis === 'falsch' && fb.antwort ? '<button class="btn secondary" id="t-recht">Ich hatte recht</button>' : ''}
      <button class="btn" id="t-weiter">Weiter ›</button></div>`;
}

// ---------- Multiple Choice ----------
async function mcItem(it, ctx) {
  if (!it.optionen) {
    const richtig = it.richtung === 'fd' ? it.v.bedeutungen[0] : it.v.wort;
    let abl = L.ablenker(it.v, it.richtung, S.pool);
    if (abl.length < 3) abl = [...abl, ...L.ablenker(it.v, it.richtung, await db.all('vokabeln'), 3 - abl.length).filter((x) => !abl.includes(x))];
    it.optionen = L.mische([richtig, ...abl.slice(0, 3)]);
    it.richtigText = richtig;
  }
  const fb = S.fb;
  const html = `
    ${frageKarte(it)}
    <div class="mc">${it.optionen.map((o, i) => {
      let kl = 'secondary';
      if (fb) kl = o === it.richtigText ? 'ok' : o === fb.antwort ? 'danger' : 'secondary';
      return `<button class="btn ${kl} block" data-o="${i}" ${fb ? 'disabled style="opacity:1"' : ''}>${esc(o)}</button>`;
    }).join('')}</div>
    ${fb ? `${fb.ergebnis === 'falsch' ? zusatzKarte(it.v, it.fach) : ''}<button class="btn block" id="m-weiter">Weiter ›</button>` : ''}`;
  return {
    html,
    bind(root) {
      bindSprechen(root, ctx);
      if (fb) {
        $('#m-weiter', root).onclick = () => weiter(ctx, fb.ergebnis, { antwort: fb.antwort });
        if (fb.ergebnis === 'richtig') S.autoTimer = setTimeout(() => { if (S.fb === fb) weiter(ctx, 'richtig', { antwort: fb.antwort }); }, 900);
        return;
      }
      autoVorlesen(it, ctx);
      $$('[data-o]', root).forEach((b) => b.onclick = () => {
        const o = it.optionen[+b.dataset.o];
        S.fb = { ergebnis: o === it.richtigText ? 'richtig' : 'falsch', antwort: o };
        ctx.rerender();
      });
    }
  };
}

// ---------- Satzbau ----------
async function satzbauItem(it, ctx) {
  const a = it.a;
  if (!S.sb) {
    const toks = a.loesung.split(/\s+/).filter(Boolean);
    const alle = L.mische([...toks, ...(a.ablenker || [])]).map((t, i) => ({ t, i }));
    S.sb = { alle, gewaehlt: [] };
  }
  const fb = S.fb;
  const gewaehlt = S.sb.gewaehlt.map((i) => S.sb.alle.find((x) => x.i === i));
  const lang = it.fach?.vorlesen.stimmeSprache || 'en-GB';
  const html = `
    <div class="card flash">
      <div class="muted small">Bilde den Satz auf ${esc(it.fach?.fremdsprache.name || 'Englisch')}:</div>
      <div class="de" style="font-size:22px">${esc(a.deutsch)}</div>
    </div>
    <div class="sb-ziel" id="sb-ziel">${gewaehlt.length ? gewaehlt.map((x) => `<button class="sb-tok on" data-i="${x.i}" ${fb ? 'disabled' : ''}>${esc(x.t)}</button>`).join('') : '<span class="muted small">Tippe die Bausteine in der richtigen Reihenfolge an.</span>'}</div>
    <div class="sb-pool">${S.sb.alle.map((x) => `<button class="sb-tok" data-i="${x.i}" ${S.sb.gewaehlt.includes(x.i) || fb ? 'disabled' : ''}>${esc(x.t)}</button>`).join('')}</div>
    ${fb ? `<div class="msg ${fb.ergebnis === 'richtig' ? 'ok' : 'err'}"><strong>${fb.ergebnis === 'richtig' ? '✓ Richtig!' : '✗ Noch nicht ganz.'}</strong><br>
        Lösung: <strong lang="${it.fach?.kurz}">${esc(a.loesung)}</strong> ${sprechKnopf(a.loesung, lang)}
        ${a.alternativen?.length ? `<br><span class="small">Auch richtig: ${esc(a.alternativen.join(' / '))}</span>` : ''}</div>
        <button class="btn block" id="sb-weiter">Weiter ›</button>`
      : `<div class="btn-row"><button class="btn secondary" id="sb-reset">Zurücksetzen</button><button class="btn" id="sb-ok" ${gewaehlt.length ? '' : 'disabled'}>Prüfen</button></div>`}`;
  return {
    keepScroll: true, html,
    bind(root) {
      bindSprechen(root, ctx);
      if (fb) { $('#sb-weiter', root).onclick = () => weiter(ctx, fb.ergebnis, { antwort: fb.antwort }); return; }
      $$('.sb-pool .sb-tok', root).forEach((b) => b.onclick = () => { S.sb.gewaehlt.push(+b.dataset.i); ctx.rerender(); });
      $$('.sb-ziel .sb-tok', root).forEach((b) => b.onclick = () => { S.sb.gewaehlt = S.sb.gewaehlt.filter((i) => i !== +b.dataset.i); ctx.rerender(); });
      $('#sb-reset', root).onclick = () => { S.sb.gewaehlt = []; ctx.rerender(); };
      $('#sb-ok', root).onclick = () => {
        const antwort = gewaehlt.map((x) => x.t).join(' ');
        const ok = [a.loesung, ...(a.alternativen || [])].some((l) => L.normAntwort(l) === L.normAntwort(antwort));
        S.fb = { ergebnis: ok ? 'richtig' : 'falsch', antwort };
        ctx.rerender();
      };
    }
  };
}

// ---------- Latein-Formen ----------
async function formenItem(it, ctx) {
  const f = it.f;
  const fb = S.fb;
  const felder = f.art === 'stammformen' ? f.felder : [null];
  const html = `
    <div class="card flash">
      <div class="muted small">${esc(it.v.bedeutungen.join('; '))}</div>
      <div class="de" style="font-size:24px;font-weight:700">${esc(f.frage)}</div>
    </div>
    ${felder.map((_, i) => `<input type="text" class="f-in" data-i="${i}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${f.art === 'stammformen' ? `${i + 2}. Stammform` : 'Form eingeben'}" value="${esc(fb?.eingaben?.[i] || '')}" ${fb ? 'readonly' : ''} style="margin-bottom:8px">`).join('')}
    ${f.art === 'genitiv' && ['m', 'f', 'n'].includes(f.genus) ? `<label>Genus</label><div class="btn-row">${['m', 'f', 'n'].map((g) => `<button class="btn ${fb?.genus === g ? '' : 'secondary'} f-genus" data-g="${g}" ${fb ? 'disabled' : ''}>${g}</button>`).join('')}</div>` : ''}
    <p class="muted small">Längenzeichen musst du nicht tippen.</p>
    ${fb ? `<div class="msg ${fb.ergebnis === 'richtig' ? 'ok' : 'err'}"><strong>${fb.ergebnis === 'richtig' ? '✓ Richtig!' : '✗ Nicht ganz.'}</strong><br>
        Lösung: <strong>${esc(f.art === 'stammformen' ? f.felder.join(', ') : f.loesungen[0])}${f.art === 'genitiv' && f.genus ? ', ' + esc(f.genus) : ''}</strong></div>
        ${tabelleHtml(f, esc)}
        <button class="btn block" id="f-weiter">Weiter ›</button>`
      : '<button class="btn block" id="f-ok">Prüfen</button>'}`;
  return {
    html,
    bind(root) {
      if (fb) { $('#f-weiter', root).onclick = () => weiter(ctx, fb.ergebnis, { antwort: fb.eingaben.join(', ') }); return; }
      let genus = null;
      $$('.f-genus', root).forEach((b) => b.onclick = () => { genus = b.dataset.g; $$('.f-genus', root).forEach((x) => x.classList.toggle('secondary', x !== b)); });
      setTimeout(() => $('.f-in', root)?.focus(), 50);
      $('#f-ok', root).onclick = () => {
        const eingaben = $$('.f-in', root).map((x) => x.value.trim());
        let ok;
        if (f.art === 'stammformen') ok = f.felder.every((soll, i) => L.normAntwort(soll) === L.normAntwort(eingaben[i]));
        else ok = L.normAntwort(f.loesungen[0]) === L.normAntwort(eingaben[0]);
        if (f.art === 'genitiv' && ['m', 'f', 'n'].includes(f.genus)) ok = ok && genus === f.genus;
        S.fb = { ergebnis: ok ? 'richtig' : 'falsch', eingaben, genus };
        ctx.rerender();
      };
    }
  };
}

// ---------- Freie Sätze ----------
async function freiItem(it, ctx) {
  const v = it.v;
  const K = await import('./ki.js');
  const kiAn = await K.aktiv();
  const html = `
    <div class="card flash">
      <div class="muted small">Schreib einen eigenen Satz mit:</div>
      <div class="wort" lang="${it.fach.kurz}">${esc(v.wort)}</div>
      <div class="de">${esc(v.bedeutungen.join('; '))}</div>
    </div>
    <textarea id="fr-satz" style="font-family:inherit;font-size:18px;min-height:110px" placeholder="Dein Satz auf ${esc(it.fach.fremdsprache.name)} …" autocapitalize="sentences">${esc(S.freiText || '')}</textarea>
    ${kiAn ? `<div class="btn-row"><button class="btn" id="fr-ki">🤖 Von der KI prüfen lassen</button></div><div id="fr-antwort"></div>
      <details><summary class="small">Lieber selbst im Chatbot prüfen</summary>` : ''}
    <div class="btn-row"><button class="btn ${kiAn ? 'secondary' : ''}" id="fr-copy">📋 Zum Prüfen kopieren</button></div>
    <p class="muted small">Dann ChatGPT oder Gemini öffnen, einfügen und abschicken. Der Chatbot erklärt dir, ob der Satz stimmt.</p>
    <div class="btn-row">
      <a class="btn secondary" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT</a>
      <a class="btn secondary" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini</a>
    </div>
    ${kiAn ? '</details>' : ''}
    <button class="btn block" id="fr-weiter" style="margin-top:12px">Weiter ›</button>`;
  return {
    html,
    bind(root) {
      const ta = $('#fr-satz', root);
      ta.oninput = () => { S.freiText = ta.value; };
      const pruefText = () => `Ich lerne ${it.fach.name} in der Schule (Gymnasium, Klasse ${ctx.profil.klasse || '5–7'}). Bitte prüfe meinen Satz mit dem Wort „${v.wort}“ (${v.bedeutungen.join(', ')}).
Sag mir kurz und freundlich auf Deutsch: Ist der Satz richtig? Wenn nicht: Was ist falsch und warum? Gib mir dann eine verbesserte Version. Bitte keine langen Erklärungen, höchstens 4 Sätze, keine Formatierung mit Sternchen.

Mein Satz: ${ta.value.trim()}`;
      const kb = $('#fr-ki', root);
      if (kb) kb.onclick = async () => {
        if (!ta.value.trim()) { toast('Schreib zuerst einen Satz.'); return; }
        const box = $('#fr-antwort', root);
        kb.disabled = true; box.innerHTML = '<div class="msg info"><span class="spinner"></span> Die KI prüft deinen Satz …</div>';
        try {
          const a = await K.frage(pruefText(), { onStatus: (m) => { box.innerHTML = `<div class="msg info"><span class="spinner"></span> ${esc(m)}</div>`; } });
          box.innerHTML = `<div class="card ki-antwort">🤖 ${esc(a.trim()).replace(/\*\*/g, '').replace(/\n/g, '<br>')}</div>`;
        } catch (e) { box.innerHTML = `<div class="msg err small">${esc(e.message).replace(/\n/g, '<br>')}</div>`; }
        kb.disabled = false;
      };
      $('#fr-copy', root).onclick = async () => {
        if (!ta.value.trim()) { toast('Schreib zuerst einen Satz.'); return; }
        const p = `Ich lerne ${it.fach.name} in der Schule (Gymnasium, Klasse ${ctx.profil.klasse || '5–7'}). Bitte prüfe meinen Satz mit dem Wort „${v.wort}“ (${v.bedeutungen.join(', ')}).
Sag mir kurz und freundlich auf Deutsch: Ist der Satz richtig? Wenn nicht: Was ist falsch und warum? Gib mir dann eine verbesserte Version. Bitte keine langen Erklärungen.

Mein Satz: ${ta.value.trim()}`;
        toast((await copyText(p)) ? 'Kopiert! Jetzt im Chatbot einfügen.' : 'Kopieren hat nicht geklappt.');
      };
      $('#fr-weiter', root).onclick = () => { const t = ta.value.trim(); S.freiText = ''; weiter(ctx, t ? 'richtig' : 'falsch', { antwort: t }); };
    }
  };
}

// ---------- Ende ----------
export function einschaetzung(p) {
  if (p >= 90) return { text: 'sehr gut', satz: 'Super! Du kannst die Vokabeln richtig gut. 🏆', kl: 'ok' };
  if (p >= 75) return { text: 'gut', satz: 'Gut gemacht! Ein paar Wörter noch üben, dann sitzt alles. 👍', kl: 'ok' };
  if (p >= 50) return { text: 'noch üben', satz: 'Schon die Hälfte geschafft. Übe die schwachen Wörter noch einmal. 💪', kl: 'warn' };
  return { text: 'dranbleiben', satz: 'Noch nicht sicher – kein Problem. Lerne mit den Karten und probier es morgen wieder. 🌱', kl: 'err' };
}

async function endeView(ctx) {
  if (!S.ende) {
    const gewertet = S.antworten.filter((a) => !a.item.wdh);
    const richtig = gewertet.filter((a) => a.ergebnis !== 'falsch').length;
    const schwach = [...new Map(S.antworten.filter((a) => a.ergebnis === 'falsch' && a.item.v && a.item.typ !== 'frei').map((a) => [a.item.v.id, a.item.v])).values()];
    const prozent = gewertet.length ? Math.round(richtig / gewertet.length * 100) : 0;
    let res;
    if (S.cfg.modus === 'test') {
      const e = einschaetzung(prozent);
      const unitIds = S.cfg.unitIds;
      await db.put('tests', {
        id: uid('t'), profilId: S.profilId, unitId: unitIds.join(','), unitIds, zeitpunkt: new Date().toISOString(), prozent,
        einschaetzung: e.text, fragen: gewertet.map((a) => ({ vokabelId: a.item.v.id, richtung: a.item.richtung, korrekt: a.ergebnis !== 'falsch', antwort: a.antwort })),
        schwacheVokabelIds: schwach.map((v) => v.id)
      });
      res = await nachTest(S.profilId, prozent);
    } else res = await nachSitzung(S.profilId, { maxSerie: S.maxSerie });
    S.punkte += res.punkte;
    S.neueAbzeichen.push(...res.neueAbzeichen);
    // Gutscheine der Eltern: neu freigeschaltete?
    const G = await import('./gutscheine.js');
    const gutscheine = await G.pruefe(S.profilId).catch(() => []);
    if (gutscheine.length) setTimeout(() => G.feiere(gutscheine), 1200);
    if (S.cfg.terminRef) await markiereTerminAufgabe(S.cfg.terminRef);
    import('./sicherung.js').then((m) => m.autoSicherung()).then((r) => { if (r?.ok) toast('💾 Automatisch gesichert'); }).catch(() => {});
    import('./cloud.js').then((m) => m.autoAbgleich()).catch(() => {});
    S.ende = { richtig, gesamt: gewertet.length, prozent, schwach, gutscheine, gsHtml: gutscheine.map((f) => G.gutscheinHtml(f)).join('') };
    merkeSitzung();   // Übung fertig → nicht mehr zum Fortsetzen anbieten
    // Erfolgs-Animationen (nur wenn eingeschaltet)
    if (S.cfg.modus === 'test' ? prozent >= 75 : prozent >= 80 && gewertet.length >= 5) setTimeout(() => fx.konfetti(prozent >= 100 ? 3 : prozent >= 90 ? 2 : 1), 300);
    res.neueAbzeichen.forEach((a, i) => setTimeout(() => fx.abzeichen(a), 900 + i * 3400));
  }
  const E = S.ende;
  const test = S.cfg.modus === 'test';
  const e = einschaetzung(E.prozent);
  const html = `
    <div class="card empty">
      <div class="big">${test ? (E.prozent >= 75 ? emo('test') : '📝') : emo('geschafft')}</div>
      ${test ? `<div class="prozent ${e.kl}">${E.prozent} %</div><h2 style="margin:4px 0">${esc(e.text)}</h2><p>${esc(e.satz)}</p>`
        : S.cfg.modus === 'frei' ? `<h2>Geschafft!</h2><p>${plural(E.richtig, 'eigener Satz', 'eigene Sätze')} geschrieben.</p>`
        : `<h2>Geschafft!</h2><p>${E.richtig} von ${E.gesamt} richtig${E.gesamt ? ` (${E.prozent} %)` : ''}</p>`}
      <p><strong>${emo('punkt')} ${S.punkte} Punkte</strong> gesammelt${S.maxSerie >= 3 ? ` · ${emo('serie')} beste Serie: ${S.maxSerie}` : ''}</p>
    </div>
    ${E.gutscheine?.length ? `<div class="card"><h2 data-h="3" style="margin-top:0">🎟️ ${E.gutscheine.length === 1 ? 'Neuer Gutschein' : 'Neue Gutscheine'}!</h2>${E.gsHtml}
      <p class="small muted">Zeig ihn deinen Eltern. Du findest ihn unter <a href="#/gutscheine">Meine Gutscheine</a>.</p></div>` : ''}
    ${S.neueAbzeichen.length ? `<div class="card"><h2 data-h="3" style="margin-top:0">Neue Abzeichen</h2>${S.neueAbzeichen.map((a) => `<p>${a.icon} <strong>${esc(a.name)}</strong> – ${esc(a.text)}</p>`).join('')}</div>` : ''}
    ${E.schwach.length ? `<div class="card"><h2 data-h="3" style="margin-top:0">Schwache Vokabeln (${E.schwach.length})</h2><ul class="list">
      ${E.schwach.map((v) => `<li class="list-item"><span class="grow"><span class="vok-wort">${esc(v.wort)}</span><br><span class="vok-de">${esc(v.bedeutungen.join('; '))}</span></span></li>`).join('')}</ul>
      <button class="btn block" id="e-schwach">💪 Schwache Vokabeln trainieren</button></div>` : ''}
    <div class="btn-row">
      ${test ? `<a class="btn secondary" href="#/druck?units=${esc(S.cfg.unitIds.join(','))}&n=20">🖨️ Test drucken</a>` : '<button class="btn secondary" id="e-nochmal">↻ Nochmal</button>'}
      <button class="btn" id="e-fertig">Fertig</button>
    </div>`;
  return {
    title: test ? 'Testergebnis' : S.titel, back: S.cfg.zurueck || 'lernen', html,
    bind(root) {
      const s = $('#e-schwach', root);
      if (s) s.onclick = async () => {
        await starteSitzung({ modus: 'schwach', unitIds: S.cfg.unitIds, vokabelIds: E.schwach.map((v) => v.id), zurueck: S.cfg.zurueck }, ctx.profil);
        ctx.rerender();
      };
      const n = $('#e-nochmal', root);
      if (n) n.onclick = async () => { const r = await starteSitzung({ ...S.cfg, terminRef: null }, ctx.profil); if (r.leer) toast(r.leer); ctx.rerender(); };
      $('#e-fertig', root).onclick = () => ctx.go(S.cfg.zurueck || 'lernen');
    }
  };
}

async function markiereTerminAufgabe({ terminId, datum, index }) {
  const t = await db.get('termine', terminId);
  const tag = t?.plan?.find((d) => d.datum === datum);
  if (tag?.aufgaben[index]) { tag.aufgaben[index].erledigt = true; await db.put('termine', t); }
}
