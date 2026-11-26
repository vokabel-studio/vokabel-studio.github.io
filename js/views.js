// Ansichten (außer Import): Profile, Start, Bibliothek, Unit, Vokabel, Backup, Einstellungen
import * as db from './db.js';
import { FAECHER, WORTARTEN, WORTART_NAMEN, SPRACH_NAMEN, SPRACH_LANG, fach as getFach, lehrwerkName, unitWort as uWort } from './faecher.js';
import { esc, uid, toast, $, $$, datum, plural, isStandalone, isIOS } from './util.js';
import { sprich, ttsVerfuegbar } from './speech.js';
import * as backup from './backup.js';
import { pruefe, speichere } from './import.js';
import { APP_VERSION, ALTE_ADRESSE, NEUE_ADRESSE } from './config.js';

// ---------- Umzug auf die neue Adresse ----------
function umzugKarte() {
  if (!ALTE_ADRESSE) return '';
  return `<div class="card umzug">
    <h2 data-h="3" style="margin-top:0">📦 Vokabel-Studio ist umgezogen</h2>
    <p>Die App hat eine neue Adresse: <strong>${esc(NEUE_ADRESSE.replace('https://', ''))}</strong><br>
    Deine Daten ziehen <strong>nicht</strong> automatisch mit. So geht der Umzug:</p>
    <ol style="padding-left:22px">
      <li>Hier auf <strong>„Sicherung erstellen“</strong> tippen und die Datei speichern (z. B. in „Dateien“ / „Downloads“).</li>
      <li><strong>„Neue App öffnen“</strong> tippen und sie wieder zum Home-Bildschirm hinzufügen.</li>
      <li>In der neuen App: <strong>„Sicherung laden“</strong> und die Datei auswählen.</li>
    </ol>
    <div class="btn-row"><button class="btn" id="umzug-sichern">💾 1. Sicherung erstellen</button>
      <a class="btn secondary" href="${esc(NEUE_ADRESSE)}" target="_blank" rel="noopener">2. Neue App öffnen ›</a></div>
    <p class="muted small">Ein eingetragener KI-Schlüssel steckt nicht in der Sicherung und muss in der neuen App neu eingetragen werden. Die alte App danach bitte vom Home-Bildschirm löschen.</p>
  </div>`;
}
function bindUmzug(root) {
  const b = root.querySelector('#umzug-sichern');
  if (!b) return;
  b.onclick = async () => {
    const S = await import('./sicherung.js');
    try { const r = await S.sichereAlsDatei(); if (r !== 'abgebrochen') toast('Sicherung erstellt ✓ Jetzt die neue App öffnen.', 4000); }
    catch (e) { toast('Hat nicht geklappt: ' + e.message); }
  };
}
import { KATEGORIEN, INI_FARBEN, avatarHtml, istInitialen, parseInitialen, initialen, zufall } from './avatare.js';
import { DESIGNS, setzeDesign, TEXTGROESSEN, setzeTextgroesse } from './design.js';
import * as fx from './effekte.js';
import { STYLES, E, setzeStyle } from './styles.js';

function brauchtProfil(ctx) {
  if (!ctx.profil) { ctx.go('profile'); return true; }
  return false;
}

// Vorlese-Knöpfe: <button class="speak" data-say="…" data-lang="en-GB">
export function bindSprechen(root, ctx) {
  $$('[data-say]', root).forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = await sprich(b.dataset.say, b.dataset.lang, { rate: ctx.profil?.einstellungen?.sprechtempo || 0.9 });
      if (!r.ok) toast(r.grund);
    };
  });
}
const speakBtn = (text, lang, klein = false, label = 'Vorlesen') =>
  ttsVerfuegbar() ? `<button class="speak${klein ? ' small' : ''}" data-say="${esc(text)}" data-lang="${esc(lang)}" aria-label="${esc(label)}">🔊</button>` : '';

// ---------- Start / Profile ----------

export async function startView(_p, ctx) {
  ctx.go(ctx.profil ? 'home' : 'profile');
  return null;
}

export async function profileView(_p, ctx) {
  const profile = (await db.all('profile')).sort((a, b) => a.name.localeCompare(b.name));
  const html = `
    ${umzugKarte()}
    ${profile.length ? '<p class="muted">Wer lernt jetzt?</p>' : `
      <div class="card"><h2 style="margin-top:0">Willkommen bei Vokabel-Studio! 👋</h2>
      <p>Hier lernst du die Vokabeln aus deinem Schulbuch. Leg zuerst ein Profil an – jedes Kind auf diesem Gerät bekommt sein eigenes.</p>
      <p class="small"><strong>Du ziehst um oder hast ein neues Gerät?</strong> Dann lade einfach deine Sicherung:</p>
      <label class="btn secondary block" for="pv-sicherung">📂 Sicherung laden</label>
      <input id="pv-sicherung" type="file" accept=".json,application/json" hidden>
      <a class="btn secondary block" href="#/qr-empfangen" style="margin-top:10px">📲 Von einem anderen Handy übertragen (QR-Code)</a>
      <p class="small" style="margin-bottom:0"><a href="#/datenschutz">🔒 Datenschutz: Alle Daten bleiben auf diesem Gerät – mehr erfahren</a></p>
      <div id="pv-info"></div></div>`}
    <div class="profile-grid">
      ${profile.map((p) => `
        <button class="tile profile-tile" data-profil="${esc(p.id)}">
          <span class="tile-icon">${avatarHtml(p.avatar, 46)}</span>
          <span class="tile-title">${esc(p.name)}</span>
        </button>`).join('')}
      <a class="tile profile-tile" href="#/profil-neu">
        <span class="tile-icon">➕</span><span class="tile-title">Neues Profil</span>
      </a>
    </div>
    ${profile.length ? `<h2 data-h="3">Profile bearbeiten</h2><div class="card" style="padding:0"><ul class="list">
      ${profile.map((p) => `<li><a class="list-item" href="#/profil/${esc(p.id)}"><span>${avatarHtml(p.avatar, 22)}</span><span class="grow">${esc(p.name)}</span><span class="chev">›</span></a></li>`).join('')}
    </ul></div>` : ''}`;
  return {
    title: 'Profil wählen', logo: true, hideProfile: true, html,
    bind(root) {
      $$('[data-profil]', root).forEach((b) => b.onclick = () => { ctx.setzeAktivesProfil(b.dataset.profil); ctx.go('home'); });
      bindUmzug(root);
      const inp = $('#pv-sicherung', root);
      if (inp) inp.onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const info = $('#pv-info', root);
        let obj;
        try { obj = JSON.parse(await f.text()); } catch { info.innerHTML = '<div class="msg err">Die Datei ist beschädigt oder keine JSON-Datei.</div>'; return; }
        const err = backup.pruefeBackup(obj);
        if (err) { info.innerHTML = `<div class="msg err">${esc(err)}</div>`; return; }
        const z = backup.zusammenfassung(obj);
        info.innerHTML = `<div class="msg info">Sicherung vom ${esc(datum(z.datum))}: ${z.profile} Profile, ${z.units} Units, ${z.vokabeln} Vokabeln.</div><button class="btn block" id="pv-go">Jetzt laden</button>`;
        $('#pv-go', root).onclick = async () => { const n = await backup.spieleEin(obj); toast(`${n} Einträge geladen ✓`); ctx.rerender(); };
      };
    }
  };
}

export async function profilFormView({ id }, ctx) {
  const p = id ? await db.get('profile', id) : null;
  if (id && !p) { ctx.go('profile'); return null; }
  const d = p || { name: '', avatar: zufall(), fachIds: ['englisch'] };
  const ini = istInitialen(d.avatar) ? parseInitialen(d.avatar) : { text: (d.name || '').slice(0, 2).toUpperCase(), farbe: INI_FARBEN[0] };
  const html = `
    <label for="pf-name">Wie heißt du?</label>
    <input id="pf-name" type="text" maxlength="30" autocomplete="off" value="${esc(d.name)}" placeholder="Vorname">
    <label>Deine Figur</label>
    <div class="ava-vorschau" id="pf-vorschau">${avatarHtml(d.avatar, 56)}</div>
    <div class="ava-tabs" id="pf-tabs">
      ${KATEGORIEN.map((k, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-tab="${i}">${esc(k.name)}</button>`).join('')}
      <button type="button" class="chip" data-tab="ini">Initialen</button>
    </div>
    ${KATEGORIEN.map((k, i) => `<div class="emoji-pick" data-panel="${i}" ${i === 0 ? '' : 'hidden'}>
      ${k.liste.map((a) => `<button type="button" class="${a === d.avatar ? 'on' : ''}" data-a="${a}" aria-label="Figur ${a}">${a}</button>`).join('')}</div>`).join('')}
    <div data-panel="ini" hidden>
      <label for="pf-ini">Buchstaben (max. 2)</label><input id="pf-ini" type="text" maxlength="2" value="${esc(ini.text)}" autocapitalize="characters" style="max-width:160px">
      <label>Farbe</label>
      <div class="emoji-pick" id="pf-farben">${INI_FARBEN.map((f) => `<button type="button" class="farbe ${f === ini.farbe ? 'on' : ''}" data-f="${f}" style="background:${f}" aria-label="Farbe ${f}"></button>`).join('')}</div>
    </div>
    <label>Deine Fächer</label>
    <div class="btn-row" id="pf-faecher">
      ${FAECHER.map((f) => `<label class="btn secondary switch"><input type="checkbox" value="${f.id}" ${d.fachIds?.includes(f.id) ? 'checked' : ''}> ${f.icon} ${esc(f.name)}</label>`).join('')}
    </div>
    <div class="btn-row"><button class="btn" id="pf-save">${p ? 'Speichern' : 'Profil anlegen'}</button></div>
    ${p ? '<div class="btn-row"><button class="btn danger" id="pf-del">Profil löschen</button></div>' : ''}`;
  return {
    title: p ? 'Profil bearbeiten' : 'Neues Profil', back: 'profile', hideProfile: true, html,
    bind(root) {
      let avatar = d.avatar;
      let farbe = ini.farbe;
      const vorschau = () => { $('#pf-vorschau', root).innerHTML = avatarHtml(avatar, 56); };
      $$('#pf-tabs .chip', root).forEach((c) => c.onclick = () => {
        $$('#pf-tabs .chip', root).forEach((x) => x.classList.toggle('on', x === c));
        $$('[data-panel]', root).forEach((pn) => { pn.hidden = pn.dataset.panel !== c.dataset.tab; });
        if (c.dataset.tab === 'ini') { avatar = initialen($('#pf-ini', root).value || $('#pf-name', root).value, farbe); vorschau(); }
      });
      $$('[data-a]', root).forEach((b) => b.onclick = () => {
        avatar = b.dataset.a;
        $$('[data-a]', root).forEach((x) => x.classList.toggle('on', x === b));
        vorschau();
      });
      $('#pf-ini', root).oninput = () => { avatar = initialen($('#pf-ini', root).value, farbe); vorschau(); };
      $$('#pf-farben [data-f]', root).forEach((b) => b.onclick = () => {
        farbe = b.dataset.f;
        $$('#pf-farben [data-f]', root).forEach((x) => x.classList.toggle('on', x === b));
        avatar = initialen($('#pf-ini', root).value || $('#pf-name', root).value, farbe); vorschau();
      });
      $('#pf-save', root).onclick = async () => {
        const name = $('#pf-name', root).value.trim();
        if (!name) { toast('Bitte einen Namen eingeben.'); $('#pf-name', root).focus(); return; }
        const fachIds = $$('#pf-faecher input:checked', root).map((i) => i.value);
        if (!fachIds.length) { toast('Wähle mindestens ein Fach.'); return; }
        const rec = p ? { ...p, name, avatar, fachIds } : {
          id: uid('pr'), name, avatar, fachIds, lehrwerkIds: [], erstelltAm: new Date().toISOString(),
          einstellungen: { abfrageRichtung: 'beide', vorlesenAutomatisch: false, sprechtempo: 0.9, tagesziel: 20, design: 'auto', animationen: false }
        };
        await db.put('profile', rec);
        if (!p) {
          await db.put('belohnungen', { profilId: rec.id, punkte: 0, serie: { aktuell: 0, rekord: 0 }, abzeichen: [] });
          ctx.setzeAktivesProfil(rec.id);
        }
        toast(p ? 'Gespeichert.' : `Hallo ${name}! 🎉`);
        ctx.go(p ? 'profile' : 'home');
      };
      if (p) $('#pf-del', root).onclick = async () => {
        if (!confirm(`Profil „${p.name}“ mit allen Lernständen löschen? Die Vokabeln bleiben erhalten. Das kann man nicht rückgängig machen.`)) return;
        const ops = [{ store: 'profile', op: 'del', key: p.id }, { store: 'belohnungen', op: 'del', key: p.id }];
        for (const s of ['lernstand', 'ereignisse', 'termine', 'tests']) {
          for (const r of await db.byIndex(s, 'profilId', p.id)) ops.push({ store: s, op: 'del', key: r.key || r.id });
        }
        await db.batch(ops);
        if (ctx.profil?.id === p.id) ctx.setzeAktivesProfil(null);
        toast('Profil gelöscht.');
        ctx.go('profile');
      };
    }
  };
}

// ---------- Startseite ----------

export async function homeView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  // nur zählen statt alle Vokabeln laden
  const [units, nVok] = await Promise.all([db.all('units'), db.count('vokabeln')]);
  const lehrwerke = new Map((await db.all('lehrwerke')).map((l) => [l.id, l]));
  const [L, { naechsterTermin }, { hole }, LV] = await Promise.all([import('./lernen.js'), import('./plan-views.js'), import('./belohnung.js'), import('./lern-views.js')]);
  const { tageBis, heute: heuteIso } = L;
  const meine = new Set(await L.profilUnitIds(ctx.profil));
  const zuletzt = units.filter((u) => meine.has(u.id)).sort((a, b) => (b.geaendertAm || '').localeCompare(a.geaendertAm || '')).slice(0, 3);
  const { erinnerungFaellig } = await import('./sicherung.js');
  const erinnerung = await erinnerungFaellig();
  const cloud = await db.getMeta('cloud');
  const [fz, termin, bel] = await Promise.all([nVok ? L.faelligZahlen(ctx.profil) : { faellig: 0, neu: 0, neuHeute: 0 }, naechsterTermin(ctx.profil.id), hole(ctx.profil.id)]);
  const offen = LV.offeneSitzung(ctx.profil.id);
  const gutscheine = await (await import('./gutscheine.js')).offene(ctx.profil.id);
  const tb = termin ? tageBis(termin.datum) : 0;
  const heuteInfo = {
    faellig: fz.faellig, neu: fz.neu, neuHeute: fz.neuHeute, punkte: bel.punkte, serie: bel.serie.letzterLerntag ? bel.serie.aktuell : 0, termin,
    terminText: termin ? (tb === 0 ? 'ist heute!' : tb === 1 ? 'ist morgen' : `in ${tb} Tagen`) : '',
    terminOffen: termin?.plan?.find((d) => d.datum === heuteIso())?.aufgaben.some((a) => !a.erledigt)
  };
  const tile = (href, icon, title, sub, soon = false) => soon
    ? `<div class="tile soon" aria-disabled="true"><span class="tile-icon">${icon}</span><span class="tile-title">${title}</span><span class="tile-sub">${sub}</span></div>`
    : `<a class="tile" href="${href}"><span class="tile-icon">${icon}</span><span class="tile-title">${title}</span><span class="tile-sub">${sub}</span></a>`;
  const html = `
    ${umzugKarte()}
    <h2 style="margin-top:4px">Hallo ${esc(ctx.profil.name)}! ${avatarHtml(ctx.profil.avatar, 22)}</h2>
    <p class="muted">${plural(units.length, 'Unit', 'Units')} · ${plural(nVok, 'Vokabel', 'Vokabeln')} auf diesem Gerät</p>
    ${cloud?.status === 'anmelden' ? '<a class="msg warn" href="#/backup" style="display:block;text-decoration:none">☁️ Abgleich pausiert: Bitte kurz neu bei OneDrive anmelden <strong>›</strong></a>' : ''}
    ${erinnerung ? `<a class="msg warn" href="#/backup" style="display:block;text-decoration:none">💾 ${erinnerung.seit === null ? 'Deine Daten liegen bisher nur auf diesem Gerät.' : `Letzte Sicherung vor ${erinnerung.seit} Tagen.`} <strong>Jetzt sichern ›</strong></a>` : ''}
    ${gutscheine.length ? `<a class="msg ok" href="#/erfolge" style="display:block;text-decoration:none">🎟️ Du hast ${gutscheine.length === 1 ? 'einen Gutschein' : `${gutscheine.length} Gutscheine`} zum Einlösen: <strong>${esc(gutscheine.map((g) => g.text).join(', '))}</strong> ›</a>` : ''}
    ${offen ? LV.fortsetzenKarte(offen) : ''}
    ${nVok ? `<div class="card heute">
      <div class="check-head"><strong class="grow">Heute</strong>${heuteInfo.serie ? `<span class="badge warn">🔥 ${heuteInfo.serie}</span>` : ''}</div>
      <p style="margin:6px 0">${heuteInfo.faellig ? `<strong>${heuteInfo.faellig}</strong> ${heuteInfo.faellig === 1 ? 'Vokabel ist' : 'Vokabeln sind'} fällig.` : 'Nichts fällig – super! 🎉'}
        ${heuteInfo.neuHeute ? `<br><strong>${heuteInfo.neuHeute}</strong> neue ${heuteInfo.neuHeute === 1 ? 'Vokabel wartet' : 'Vokabeln warten'} auf dich.` : heuteInfo.neu ? '<br>Für heute genug neue Vokabeln gelernt ✓' : ''}</p>
      ${heuteInfo.termin ? `<p class="small" style="margin:6px 0">📝 <a href="#/termin/${esc(heuteInfo.termin.id)}">${esc(heuteInfo.termin.titel)}</a> ${heuteInfo.terminText}</p>` : ''}
      <a class="btn block" href="${heuteInfo.termin && heuteInfo.terminOffen ? '#/termin/' + esc(heuteInfo.termin.id) : heuteInfo.faellig || heuteInfo.neuHeute ? '#/plan' : '#/lernen'}">${heuteInfo.termin && heuteInfo.terminOffen ? '📅 Heutige Aufgaben' : (heuteInfo.faellig || heuteInfo.neuHeute ? '🔁 Jetzt lernen' : E('lernen') + ' Lernen')}</a>
    </div>` : ''}
    <nav aria-label="Hauptbereiche"><div class="grid">
      ${tile('#/lernen', E('lernen'), 'Lernen', 'Karten, Abfrage, Satzbau, Test, Hör-Quiz')}
      ${tile('#/plan', E('plan'), 'Lernplan', 'Fälliges & Vokabeltest-Termine')}
      ${tile('#/import', E('import'), 'Vokabelseite einlesen', 'Foto oder Text → fertige Vokabeln')}
      ${tile('#/bibliothek', E('buecher'), 'Meine Bücher', 'Units und Vokabeln ansehen und bearbeiten')}
    </div>
    <a class="card list-item" href="#/erfolge" style="margin:12px 0">
      <span class="mehr-icon" aria-hidden="true">${E('erfolge')}</span>
      <span class="grow"><span class="vok-wort">Meine Erfolge</span><br>
        <span class="vok-de">${E('punkt')} ${heuteInfo.punkte} Punkte · ${E('serie')} ${plural(heuteInfo.serie, 'Tag', 'Tage')} am Stück · Abzeichen & Gutscheine</span></span>
      <span class="chev" aria-hidden="true">›</span></a></nav>
    ${zuletzt.length ? `<h2 data-h="3">Zuletzt bearbeitet</h2><div class="card" style="padding:0"><ul class="list">
      ${zuletzt.map((u) => `<li><a class="list-item" href="#/unit/${esc(u.id)}"><span class="grow">
        <span class="vok-wort">${uWort(getFach(lehrwerke.get(u.lehrwerkId)?.fachId))} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span><br>
        <span class="vok-de">${esc(lehrwerke.get(u.lehrwerkId) ? lehrwerkName(lehrwerke.get(u.lehrwerkId)) : '')}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`).join('')}
    </ul></div>` : ''}
    <h2 data-h="3">Mehr</h2>
    <nav aria-label="Weitere Bereiche" class="card mehr-liste" style="padding:0"><ul class="list">
      <li><a class="list-item" href="#/backup"><span class="mehr-icon" aria-hidden="true">${E('sicherung')}</span><span class="grow"><span class="vok-wort">Sichern & Abgleichen</span><br>
        <span class="vok-de">${cloud?.anbieter ? `Abgleich mit ${cloud.anbieter === 'onedrive' ? 'OneDrive' : 'der Cloud'} aktiv` : 'Daten schützen, zweites Gerät verbinden'}</span></span><span class="chev" aria-hidden="true">›</span></a></li>
      <li><a class="list-item" href="#/einstellungen"><span class="mehr-icon" aria-hidden="true">${E('einstellungen')}</span><span class="grow"><span class="vok-wort">Einstellungen</span><br>
        <span class="vok-de">Aussehen, Textgröße, Vorlesen, Abfrage</span></span><span class="chev" aria-hidden="true">›</span></a></li>
      <li><a class="list-item" href="#/eltern"><span class="mehr-icon" aria-hidden="true">${E('eltern')}</span><span class="grow"><span class="vok-wort">Für Eltern</span><br>
        <span class="vok-de">Lernfortschritt, Gutscheine, KI-Anbindung (mit PIN)</span></span><span class="chev" aria-hidden="true">›</span></a></li>
    </ul></nav>
    ${isIOS() && !isStandalone() ? `<div class="msg info small">📱 Tipp: In Safari auf <strong>Teilen ⬆︎ › Zum Home-Bildschirm</strong> tippen. Dann startet Vokabel-Studio wie eine App.<br>
      Achtung: Safari und die Home-Bildschirm-App speichern getrennt. Lege die App am besten <strong>vor</strong> dem ersten Einlesen auf den Home-Bildschirm.</div>` : ''}`;
  return { title: 'Vokabel-Studio', logo: true, html, bind(root) { bindUmzug(root); LV.bindFortsetzen(root, ctx); } };
}

// ---------- Bibliothek ----------

async function zaehleUnits() {
  const units = await db.all('units');
  const zahlen = await Promise.all(units.map((u) => db.countByIndex('vokabeln', 'unitId', u.id)));
  const vokProUnit = new Map(units.map((u, i) => [u.id, zahlen[i]]));
  return { units, vokProUnit };
}

export async function bibliothekView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const lehrwerke = await db.all('lehrwerke');
  const { units, vokProUnit } = await zaehleUnits();
  const faecher = FAECHER.filter((f) => !ctx.profil.fachIds?.length || ctx.profil.fachIds.includes(f.id));
  const html = `
    ${!units.length ? `<div class="card empty"><div class="big">📭</div>
      <p>Noch keine Vokabeln da.<br>Lies eine Seite aus deinem Buch ein – oder probier die App mit Beispiel-Units aus.</p>
      <div class="btn-row"><a class="btn" href="#/import">📸 Seite einlesen</a><button class="btn secondary" id="demo-laden">Beispiel-Units laden</button></div>
      <div class="btn-row"><a class="btn secondary" href="#/paket-laden">📦 Vokabelpaket von jemand anderem laden</a></div></div>` : ''}
    ${faecher.map((f) => {
      const lws = lehrwerke.filter((l) => l.fachId === f.id).sort((a, b) => lehrwerkName(a).localeCompare(lehrwerkName(b)));
      return `<h2>${f.icon} ${esc(f.name)}</h2>
        <div class="card" style="padding:0"><ul class="list">
        ${lws.map((l) => {
          const us = units.filter((u) => u.lehrwerkId === l.id);
          const nv = us.reduce((s, u) => s + (vokProUnit.get(u.id) || 0), 0);
          return `<li><a class="list-item" href="#/lehrwerk/${esc(l.id)}"><span class="grow">
            <span class="vok-wort">${esc(lehrwerkName(l))}</span><br>
            <span class="vok-de">${l.klasse ? 'Klasse ' + esc(l.klasse) + ' · ' : ''}${plural(us.length, 'Unit', 'Units')} · ${plural(nv, 'Vokabel', 'Vokabeln')}</span>
            </span><span class="chev">›</span></a></li>`;
        }).join('')}
        <li><a class="list-item" href="#/lehrwerk-neu/${f.id}"><span class="grow muted">➕ Buch hinzufügen</span></a></li>
        </ul></div>`;
    }).join('')}
    ${units.length ? '<div class="btn-row" style="margin-top:20px"><a class="btn secondary" href="#/teilen">📦 Vokabeln teilen</a><a class="btn secondary" href="#/paket-laden">📥 Paket laden</a></div>' : ''}`;
  return {
    title: 'Meine Bücher', back: 'home', html,
    bind(root) {
      const b = $('#demo-laden', root);
      if (b) b.onclick = async () => {
        b.disabled = true; b.textContent = 'Lade …';
        try { const n = await ladeDemo(); toast(`${n} Beispiel-Vokabeln geladen.`); ctx.rerender(); }
        catch (e) { toast('Laden fehlgeschlagen: ' + e.message); b.disabled = false; }
      };
    }
  };
}

export async function ladeDemo() {
  const demos = [
    { datei: 'demo/demo-englisch.json', lw: { id: 'lw_demo_en', fachId: 'englisch', titel: 'Beispiel-Lehrwerk Englisch', verlag: '', band: '', klasse: 6 } },
    { datei: 'demo/demo-latein.json', lw: { id: 'lw_demo_la', fachId: 'latein', titel: 'Beispiel-Lehrwerk Latein', verlag: '', band: '', klasse: 7 } }
  ];
  let n = 0;
  for (const d of demos) {
    await db.put('lehrwerke', d.lw);
    const json = await (await fetch(d.datei)).json();
    const p = pruefe(json, { fachId: d.lw.fachId, unitNummer: json.unit.nummer });
    if (p.fehler.length) throw new Error(p.fehler[0]);
    const r = await speichere(p.daten, { lehrwerkId: d.lw.id, unitNummer: json.unit.nummer, unitTitel: json.unit.titel, rohtext: '(Beispiel)' });
    n += r.neu;
  }
  return n;
}

export async function lehrwerkView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const lw = await db.get('lehrwerke', id);
  if (!lw) { ctx.go('bibliothek'); return null; }
  const { vokProUnit } = await zaehleUnits();
  const units = (await db.byIndex('units', 'lehrwerkId', id))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));
  const f = getFach(lw.fachId);
  const html = `
    <p class="muted">${f.icon} ${esc(f.name)}${lw.verlag ? ' · ' + esc(lw.verlag) : ''}${lw.ausgabe ? ' · ' + esc(lw.ausgabe) : ''}${lw.klasse ? ' · Klasse ' + esc(lw.klasse) : ''}</p>
    <div class="btn-row"><a class="btn" href="#/import?lw=${esc(id)}">📸 Neue Seite einlesen</a><a class="btn secondary" href="#/unit-neu/${esc(id)}">✏️ ${uWort(f)} von Hand anlegen</a></div>
    ${units.length ? `<div class="card" style="padding:0"><ul class="list">
      ${units.map((u) => `<li><a class="list-item" href="#/unit/${esc(u.id)}"><span class="grow">
        <span class="vok-wort">${uWort(f)} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</span><br>
        <span class="vok-de">${plural(vokProUnit.get(u.id) || 0, 'Vokabel', 'Vokabeln')}</span></span><span class="chev">›</span></a></li>`).join('')}
    </ul></div>` : '<div class="card empty"><p>In diesem Buch sind noch keine Units eingelesen.</p></div>'}
    <div class="btn-row" style="margin-top:28px"><a class="btn secondary" href="#/lehrwerk-neu/${esc(lw.fachId)}?id=${esc(id)}">✏️ Buch bearbeiten</a>
      <button class="btn danger" id="lw-del">🗑️ Buch löschen</button></div>`;
  const nVok = units.reduce((s, u) => s + (vokProUnit.get(u.id) || 0), 0);
  return {
    title: lehrwerkName(lw), back: 'bibliothek', html,
    bind(root) {
      $('#lw-del', root).onclick = async () => {
        if (units.length) {
          if (!confirm(`„${lehrwerkName(lw)}“ mit ${plural(units.length, uWort(f), uWort(f) + (f.formenTyp === 'latein' ? 'en' : 's'))} und ${plural(nVok, 'Vokabel', 'Vokabeln')} löschen?\n\nDer Lernstand aller Profile zu diesen Vokabeln wird ebenfalls gelöscht.`)) return;
          if (!confirm('Wirklich löschen? Das kann man nicht rückgängig machen (außer mit einer Sicherung).')) return;
        } else if (!confirm(`„${lehrwerkName(lw)}“ aus der Liste löschen?`)) return;
        await db.deleteLehrwerk(id);
        toast('Buch gelöscht.');
        ctx.go('bibliothek');
      };
    }
  };
}

export async function lehrwerkFormView({ fachId, query }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const alt = query.id ? await db.get('lehrwerke', query.id) : null;
  const f = getFach(fachId);
  if (!f) { ctx.go('bibliothek'); return null; }
  const d = alt || { titel: '', verlag: '', band: '', klasse: '', ausgabe: '' };
  const html = `
    ${alt ? `<label for="lw-fach">Fach</label><select id="lw-fach">${FAECHER.map((x) => `<option value="${x.id}" ${x.id === alt.fachId ? 'selected' : ''}>${x.icon} ${esc(x.name)}</option>`).join('')}</select>`
      : `<p class="muted">${f.icon} ${esc(f.name)}</p>`}
    <label for="lw-titel">Titel des Buchs</label><input id="lw-titel" type="text" value="${esc(d.titel)}" placeholder="z. B. Green Line">
    <div class="field-row">
      <div><label for="lw-band">Band</label><input id="lw-band" type="text" value="${esc(d.band)}" placeholder="z. B. 2"></div>
      <div><label for="lw-klasse">Klasse</label><input id="lw-klasse" type="number" inputmode="numeric" min="5" max="13" value="${esc(d.klasse)}"></div>
    </div>
    <label for="lw-verlag">Verlag (freiwillig)</label><input id="lw-verlag" type="text" value="${esc(d.verlag)}">
    <label for="lw-ausgabe">Ausgabe (freiwillig)</label><input id="lw-ausgabe" type="text" value="${esc(d.ausgabe)}" placeholder="z. B. Ausgabe NRW">
    <div class="btn-row"><button class="btn" id="lw-save">Speichern</button></div>`;
  return {
    title: alt ? 'Buch bearbeiten' : 'Buch hinzufügen', back: alt ? `lehrwerk/${alt.id}` : 'bibliothek', html,
    bind(root) {
      $('#lw-save', root).onclick = async () => {
        const titel = $('#lw-titel', root).value.trim();
        if (!titel) { toast('Bitte einen Titel eingeben.'); return; }
        const rec = {
          ...(alt || { id: uid('lw'), fachId }), titel, ...(alt ? { fachId: $('#lw-fach', root).value } : {}),
          band: $('#lw-band', root).value.trim(), klasse: +$('#lw-klasse', root).value || null,
          verlag: $('#lw-verlag', root).value.trim(), ausgabe: $('#lw-ausgabe', root).value.trim()
        };
        await db.put('lehrwerke', rec);
        // neues Fach ins Profil übernehmen, damit das Buch sichtbar bleibt
        if (ctx.profil.fachIds?.length && !ctx.profil.fachIds.includes(rec.fachId)) {
          const p = await db.get('profile', ctx.profil.id); p.fachIds = [...p.fachIds, rec.fachId]; await db.put('profile', p);
        }
        ctx.go(`lehrwerk/${rec.id}`);
      };
    }
  };
}

// ---------- Unit ----------

async function unitDaten(unitId) {
  const unit = await db.get('units', unitId);
  if (!unit) return null;
  const [lw, parts, voks, saetze, satzbau] = await Promise.all([
    db.get('lehrwerke', unit.lehrwerkId), db.byIndex('parts', 'unitId', unitId), db.byIndex('vokabeln', 'unitId', unitId),
    db.byIndex('lernsaetze', 'unitId', unitId), db.byIndex('satzbau', 'unitId', unitId)
  ]);
  parts.sort((a, b) => a.reihenfolge - b.reihenfolge);
  const partRang = new Map(parts.map((p, i) => [p.id, i]));
  voks.sort((a, b) => (partRang.get(a.partId) - partRang.get(b.partId)) || (a.reihenfolge - b.reihenfolge));
  return { unit, lw, fach: getFach(lw?.fachId), parts, voks, saetze, satzbau };
}

export async function unitView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const d = await unitDaten(id);
  if (!d) { ctx.go('bibliothek'); return null; }
  const { unit, lw, fach, parts, voks, saetze, satzbau } = d;
  const lang = fach.vorlesen.stimmeSprache;
  const zuPruefen = voks.filter((v) => v.pruefen).length;
  const unitWort = uWort(fach);
  const html = `
    <div class="card">
      <div class="muted small">${esc(lehrwerkName(lw))}</div>
      <h2 style="margin:4px 0">${unitWort} ${esc(unit.nummer)}${unit.titel ? ' – ' + esc(unit.titel) : ''}</h2>
      <div>${plural(voks.length, 'Vokabel', 'Vokabeln')} · ${plural(saetze.length, 'Lernsatz', 'Lernsätze')} · ${plural(satzbau.length, 'Satzbau-Aufgabe', 'Satzbau-Aufgaben')}</div>
      ${zuPruefen ? `<div class="msg warn small" style="margin-top:10px">⚠️ ${plural(zuPruefen, 'Vokabel', 'Vokabeln')} bitte mit dem Buch vergleichen (gelb markiert).</div>` : ''}
      ${fach.vorlesen.hinweis ? `<div class="hinweis-latein">🇮🇹 ${esc(fach.vorlesen.hinweis)}</div>` : ''}
    </div>
    <div class="btn-row">
      <a class="btn" href="#/lernen?unit=${esc(unit.id)}" ${voks.length ? '' : 'hidden'}>🎯 Lernen & Test</a>
      <a class="btn secondary" href="#/vokabel/${esc(voks[0]?.id || '')}" ${voks.length ? '' : 'hidden'}>📖 Durchblättern</a>
    </div>
    <div class="btn-row">
      <a class="btn secondary" href="#/termin-neu?unit=${esc(unit.id)}">📅 Test-Termin eintragen</a>
      <a class="btn secondary" href="#/import?lw=${esc(lw.id)}&unit=${esc(unit.id)}">📸 Weitere Seite einlesen</a>
    </div>
    ${!voks.length ? `<div class="card empty"><p>Noch keine Vokabeln in dieser ${unitWort}.</p></div>` : ''}
    ${parts.map((p) => {
      const pv = voks.filter((v) => v.partId === p.id);
      if (!pv.length) return '';
      return `<h2 data-h="3">Part ${esc(p.kennung)}${p.titel ? ' – ' + esc(p.titel) : ''} <span class="badge">${pv.length}</span></h2>
        <div class="card" style="padding:0"><ul class="list">
        ${pv.map((v) => `<li><a class="list-item" href="#/vokabel/${esc(v.id)}">
          <span class="grow"><span class="vok-wort">${esc(v.wort)}</span>
          ${v.lautschrift ? `<span class="vok-ipa">[${esc(v.lautschrift)}]</span>` : ''}
          ${v.pruefen ? '<span class="badge warn">prüfen</span>' : ''}<br>
          <span class="vok-de">${esc(v.bedeutungen.join('; '))}</span></span>
          ${speakBtn(v.wort.replace(/^\(to\)\s*/, 'to '), lang, true)}
          <span class="chev">›</span></a></li>`).join('')}
        </ul></div>`;
    }).join('')}
    <div class="btn-row"><a class="btn soft" href="#/vokabel-neu/${esc(unit.id)}">➕ Vokabel von Hand hinzufügen</a></div>
    ${saetze.length ? `<details class="card"><summary>Lernsätze (${saetze.length})</summary><ul class="list">
      ${saetze.map((s) => `<li class="list-item"><span class="grow"><span class="vok-wort">${esc(s.fremd)}</span><br><span class="vok-de">${esc(s.deutsch)}</span></span>${speakBtn(s.fremd, lang, true)}</li>`).join('')}
    </ul></details>` : ''}
    ${satzbau.length ? `<details class="card"><summary>Satzbau-Aufgaben (${satzbau.length})</summary><ul class="list">
      ${satzbau.map((s) => `<li class="list-item"><span class="grow">${esc(s.deutsch)}<br><span class="vok-de">→ ${esc(s.loesung)}</span></span></li>`).join('')}
    </ul></details>` : ''}
    <div class="btn-row" style="margin-top:28px">
      <a class="btn secondary" href="#/unit-bearbeiten/${esc(unit.id)}">✏️ ${unitWort} bearbeiten</a>
      <button class="btn danger" id="u-del">🗑️ ${unitWort} löschen</button>
    </div>
    <p class="muted small">Unter „Bearbeiten“: Nummer, Titel, Buch, Parts, Lernsätze und Satzbau-Aufgaben ändern oder löschen, Lernstand zurücksetzen.</p>`;
  return {
    title: `${unitWort} ${unit.nummer}`, back: `lehrwerk/${lw.id}`, html,
    bind(root) {
      bindSprechen(root, ctx);
      $('#u-del', root).onclick = async () => {
        if (!confirm(`${unitWort} ${unit.nummer} mit ${voks.length} Vokabeln und allen Lernständen löschen? Das kann man nicht rückgängig machen.`)) return;
        await db.deleteUnit(unit.id);
        toast('Gelöscht.');
        ctx.go(`lehrwerk/${lw.id}`);
      };
    }
  };
}

// ---------- Unit bearbeiten / von Hand anlegen ----------

export async function unitFormView({ id, lwId }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const d = id ? await unitDaten(id) : null;
  if (id && !d) { ctx.go('bibliothek'); return null; }
  const lwStart = d ? d.lw : await db.get('lehrwerke', lwId);
  if (!lwStart) { ctx.go('bibliothek'); return null; }
  const unit = d?.unit || { id: uid('u'), lehrwerkId: lwStart.id, nummer: '', titel: '', importIds: [], erstelltAm: new Date().toISOString() };
  const parts = d?.parts || [], saetze = d?.saetze || [], satzbau = d?.satzbau || [], voks = d?.voks || [];
  const fach = getFach(lwStart.fachId);
  const W = uWort(fach);
  const alleLw = (await db.all('lehrwerke')).sort((a, b) => (a.fachId + lehrwerkName(a)).localeCompare(b.fachId + lehrwerkName(b)));
  const nProPart = new Map(parts.map((p) => [p.id, voks.filter((v) => v.partId === p.id).length]));
  const wegKnopf = (art, key) => `<button type="button" class="btn danger klein-weg" data-weg="${art}" data-key="${esc(key)}" aria-label="Löschen">🗑️</button>`;
  const html = `
    <div class="card">
      <label for="uf-lw">Buch</label>
      <select id="uf-lw">${alleLw.map((l) => `<option value="${esc(l.id)}" ${l.id === unit.lehrwerkId ? 'selected' : ''}>${esc(getFach(l.fachId)?.icon || '')} ${esc(lehrwerkName(l))}</option>`).join('')}</select>
      <div class="field-row">
        <div><label for="uf-nr">Nummer</label><input id="uf-nr" type="text" value="${esc(unit.nummer)}" placeholder="z. B. 2"></div>
        <div><label for="uf-titel">Titel (freiwillig)</label><input id="uf-titel" type="text" value="${esc(unit.titel || '')}"></div>
      </div>
    </div>
    ${d ? `
    <h2 data-h="3">Parts</h2>
    <div class="card bearb-liste">
      ${parts.length ? parts.map((p) => `<div class="bearb-zeile" data-zeile="part" data-key="${esc(p.id)}">
        <input type="text" class="pt-kennung" value="${esc(p.kennung)}" aria-label="Part" style="max-width:80px">
        <input type="text" class="pt-titel" aria-label="Titel des Parts" value="${esc(p.titel || '')}" placeholder="Titel (freiwillig)">
        <span class="badge" title="Vokabeln">${nProPart.get(p.id)}</span>${wegKnopf('part', p.id)}</div>`).join('') : '<p class="muted small">Noch keine Parts.</p>'}
      <p class="muted small">Wird ein Part gelöscht, werden auch seine Vokabeln gelöscht. Einzelne Vokabeln verschiebst du über „Bearbeiten“ bei der Vokabel in einen anderen Part.</p>
    </div>
    <h2 data-h="3">Lernsätze (${saetze.length})</h2>
    <div class="card bearb-liste">
      ${saetze.length ? saetze.map((x) => `<div class="bearb-zeile spalten" data-zeile="satz" data-key="${esc(x.id)}">
        <div class="grow"><textarea class="ls-fremd" rows="2" lang="${fach.kurz}" aria-label="Satz in der Fremdsprache">${esc(x.fremd)}</textarea>
        <textarea class="ls-deutsch" rows="2" aria-label="Deutsch">${esc(x.deutsch)}</textarea></div>${wegKnopf('satz', x.id)}</div>`).join('') : '<p class="muted small">Keine Lernsätze.</p>'}
    </div>
    <h2 data-h="3">Satzbau-Aufgaben (${satzbau.length})</h2>
    <div class="card bearb-liste">
      ${satzbau.length ? satzbau.map((x) => `<div class="bearb-zeile spalten" data-zeile="satzbau" data-key="${esc(x.id)}">
        <div class="grow"><label class="small muted">Deutsch</label><textarea class="sb-deutsch" rows="2" aria-label="Deutscher Satz">${esc(x.deutsch)}</textarea>
        <label class="small muted">Lösung</label><textarea class="sb-loesung" rows="2" aria-label="Lösung" lang="${fach.kurz}">${esc(x.loesung)}</textarea>
        <label class="small muted">Auch richtig (mit / trennen)</label><textarea class="sb-alt" rows="2" aria-label="Auch richtig">${esc((x.alternativen || []).join(' / '))}</textarea>
        <label class="small muted">Falsche Zusatz-Bausteine (mit Komma)</label><input type="text" class="sb-abl" aria-label="Falsche Zusatz-Bausteine" value="${esc((x.ablenker || []).join(', '))}"></div>
        ${wegKnopf('satzbau', x.id)}</div>`).join('') : '<p class="muted small">Keine Satzbau-Aufgaben.</p>'}
    </div>` : `<p class="muted small">Danach kannst du Vokabeln von Hand hinzufügen oder Seiten einlesen.</p>`}
    <div class="btn-row"><button class="btn" id="uf-save">${d ? 'Alles speichern' : `${W} anlegen`}</button></div>
    ${d && voks.length ? `<div class="card">
      <h2 data-h="3" style="margin-top:0">🔄 Lernstand zurücksetzen</h2>
      <p class="small">Alle ${plural(voks.length, 'Vokabel', 'Vokabeln')} dieser ${W} gelten für <strong>${esc(ctx.profil.name)}</strong> wieder als „neu“. Andere Profile sind nicht betroffen.</p>
      <button class="btn secondary block" id="uf-reset">Lernstand von ${esc(ctx.profil.name)} zurücksetzen</button></div>` : ''}`;
  return {
    title: d ? `${W} ${unit.nummer} bearbeiten` : `Neue ${W}`, back: d ? `unit/${unit.id}` : `lehrwerk/${lwStart.id}`, html,
    bind(root) {
      // Löschen erst beim Speichern ausführen; bis dahin rückgängig machbar
      $$('[data-weg]', root).forEach((b) => b.onclick = () => {
        const z = b.closest('.bearb-zeile');
        const weg = z.classList.toggle('weg');
        b.textContent = weg ? '↩︎' : '🗑️';
        b.setAttribute('aria-label', weg ? 'Doch behalten' : 'Löschen');
        $$('input, textarea', z).forEach((i) => { i.disabled = weg; });
      });
      const r = $('#uf-reset', root);
      if (r) r.onclick = async () => {
        if (!confirm(`Lernstand von ${ctx.profil.name} für diese ${W} zurücksetzen?`)) return;
        const n = await db.resetLernstand(ctx.profil.id, voks.map((v) => v.id));
        toast(n ? 'Zurückgesetzt ✓' : 'Hier gab es noch keinen Lernstand.');
      };
      $('#uf-save', root).onclick = async () => {
        const nummer = $('#uf-nr', root).value.trim();
        if (!nummer) { toast('Bitte eine Nummer eingeben.'); $('#uf-nr', root).focus(); return; }
        const ziel = await db.get('lehrwerke', $('#uf-lw', root).value);
        const doppelt = (await db.byIndex('units', 'lehrwerkId', ziel.id)).find((x) => x.id !== unit.id && x.nummer.trim().toLowerCase() === nummer.toLowerCase());
        if (doppelt && !confirm(`In „${lehrwerkName(ziel)}“ gibt es schon ${W} ${nummer}. Trotzdem speichern? Dann gibt es sie zweimal.`)) return;
        const weg = (art) => $$(`.bearb-zeile.weg[data-zeile="${art}"]`, root).map((z) => z.dataset.key);
        const bleibt = (art) => $$(`.bearb-zeile:not(.weg)[data-zeile="${art}"]`, root);
        const wegParts = weg('part');
        const wegVok = voks.filter((v) => wegParts.includes(v.partId)).length;
        if (wegParts.length && !confirm(`${plural(wegParts.length, 'Part', 'Parts')} mit ${plural(wegVok, 'Vokabel', 'Vokabeln')} löschen?`)) return;
        const ops = [{ store: 'units', op: 'put', value: { ...unit, lehrwerkId: ziel.id, nummer, titel: $('#uf-titel', root).value.trim(), geaendertAm: new Date().toISOString() } }];
        for (const z of bleibt('part')) {
          const p = parts.find((x) => x.id === z.dataset.key);
          const kennung = $('.pt-kennung', z).value.trim() || p.kennung;
          ops.push({ store: 'parts', op: 'put', value: { ...p, kennung, titel: $('.pt-titel', z).value.trim() } });
        }
        for (const z of bleibt('satz')) {
          const x = saetze.find((y) => y.id === z.dataset.key);
          const fremd = $('.ls-fremd', z).value.trim(), deutsch = $('.ls-deutsch', z).value.trim();
          ops.push(fremd && deutsch ? { store: 'lernsaetze', op: 'put', value: { ...x, fremd, deutsch } } : { store: 'lernsaetze', op: 'del', key: x.id });
        }
        for (const z of bleibt('satzbau')) {
          const x = satzbau.find((y) => y.id === z.dataset.key);
          const deutsch = $('.sb-deutsch', z).value.trim(), loesung = $('.sb-loesung', z).value.trim();
          const alternativen = $('.sb-alt', z).value.split('/').map((t) => t.trim()).filter(Boolean);
          const ablenker = $('.sb-abl', z).value.split(',').map((t) => t.trim()).filter(Boolean);
          ops.push(deutsch && loesung ? { store: 'satzbau', op: 'put', value: { ...x, deutsch, loesung, alternativen, ablenker } } : { store: 'satzbau', op: 'del', key: x.id });
        }
        weg('satz').forEach((key) => ops.push({ store: 'lernsaetze', op: 'del', key }));
        weg('satzbau').forEach((key) => ops.push({ store: 'satzbau', op: 'del', key }));
        await db.batch(ops);
        for (const pid of wegParts) await db.deletePart(pid);
        // Fach ins Profil übernehmen, damit die Unit sichtbar bleibt
        if (ctx.profil.fachIds?.length && !ctx.profil.fachIds.includes(ziel.fachId)) {
          const p = await db.get('profile', ctx.profil.id); p.fachIds = [...p.fachIds, ziel.fachId]; await db.put('profile', p);
        }
        const zf = getFach(ziel.fachId);
        toast(d ? `Gespeichert ✓${zf?.formenTyp === 'latein' && fach.formenTyp !== 'latein' ? ' – Tipp: Für Genitiv/Stammformen die Seite neu einlesen.' : ''}` : `${W} angelegt ✓`, 4000);
        ctx.go(`unit/${unit.id}`);
      };
    }
  };
}

// ---------- Lernkarte (Vokabel-Detail) ----------

export function formenHtml(v, fach) {
  const f = v.formen || {};
  const z = [];
  if (fach.formenTyp === 'latein') {
    if (f.genitiv) z.push(['Genitiv', f.genitiv]);
    if (f.genus) z.push(['Genus', { m: 'maskulin (m)', f: 'feminin (f)', n: 'neutrum (n)', 'm/f': 'maskulin/feminin' }[f.genus] || f.genus]);
    if (f.deklination) z.push(['Deklination', f.deklination + '-Deklination']);
    if (f.adjektiv_endungen) z.push(['Endungen', f.adjektiv_endungen]);
    if (f.stammformen?.length) z.push(['Stammformen', f.stammformen.join(', ')]);
    if (f.konjugation) z.push(['Konjugation', f.konjugation === 'unregelmaessig' ? 'unregelmäßig' : f.konjugation + '-Konjugation']);
    if (f.rektion) z.push(['Rektion', f.rektion]);
  } else {
    if (f.plural) z.push(['Plural', f.plural]);
    if (f.simple_past) z.push(['Simple past', f.simple_past]);
    if (f.past_participle) z.push(['Past participle', f.past_participle]);
    if (f.steigerung) z.push(['Steigerung', f.steigerung]);
  }
  if (!z.length) return '';
  return `<div class="info-block"><h2 data-h="4">Formen</h2><ul>${z.map(([k, w]) => `<li><strong>${esc(k)}:</strong> ${esc(w)}</li>`).join('')}</ul></div>`;
}

export function karteHtml(v, fach) {
  const lang = fach.vorlesen.stimmeSprache;
  const sprechWort = v.wort.replace(/^\(to\)\s*/, 'to ');
  const block = (titel, items) => items?.length ? `<div class="info-block"><h2 data-h="4">${titel}</h2><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  return `
    <div class="card flash">
      <div class="muted small">${esc(WORTART_NAMEN[v.wortart] || '')}</div>
      <div class="wort" lang="${fach.kurz}">${esc(v.wort)}</div>
      ${v.lautschrift ? `<div class="ipa">[${esc(v.lautschrift)}]</div>` : ''}
      <div style="margin:12px 0">${speakBtn(sprechWort, lang)}</div>
      ${fach.vorlesen.hinweis ? `<div class="hinweis-latein">🇮🇹 ${esc(fach.vorlesen.hinweis)}</div>` : ''}
      <div class="de">${esc(v.bedeutungen.join('; '))} ${speakBtn(v.bedeutungen.join(', '), 'de-DE', true, 'Deutsch vorlesen')}</div>
    </div>
    ${v.pruefen ? `<div class="msg warn">⚠️ Bitte mit dem Buch vergleichen: ${esc(v.pruefgrund || 'unsicher gelesen')}
      <div class="btn-row"><button class="btn soft" id="v-geprueft">✓ Stimmt so</button><a class="btn secondary" href="#/vokabel-bearbeiten/${esc(v.id)}">Korrigieren</a></div></div>` : ''}
    <div class="card">
      ${formenHtml(v, fach)}
      ${v.erklaerung ? `<div class="info-block"><h2 data-h="4">Erklärung</h2><p lang="${fach.kurz}">${esc(v.erklaerung)} ${speakBtn(v.erklaerung, lang, true)}</p></div>` : ''}
      ${v.beispiele?.length ? `<div class="info-block"><h2 data-h="4">Beispiele</h2>${v.beispiele.map((b) => `
        <div class="beispiel"><span class="fr" lang="${fach.kurz}">${esc(b.fremd)}</span> ${speakBtn(b.fremd, lang, true)}
        ${b.deutsch ? `<br><span class="muted">${esc(b.deutsch)}</span>` : ''}
        ${b.quelle === 'ki' ? ' <span class="badge small">neu formuliert</span>' : ''}</div>`).join('')}</div>` : ''}
      ${block('Gegenteil', v.gegenteile)}
      ${block('Ähnliche Wörter', v.synonyme)}
      ${block('Wortfamilie', v.wortfamilie)}
      ${v.andereSprachen?.length ? `<div class="info-block"><h2 data-h="4">In anderen Sprachen</h2><ul>${v.andereSprachen.map((a) =>
        `<li><span class="badge" title="${esc(SPRACH_LANG[a.sprache] || a.sprache)}">${esc(SPRACH_NAMEN[a.sprache] || a.sprache)}</span> ${esc(a.wort)}${a.bedeutung ? ` <span class="muted">(${esc(a.bedeutung)})</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${v.stolpersteine?.length ? `<div class="info-block"><h2 data-h="4">⚠️ Stolpersteine</h2><ul>${v.stolpersteine.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${v.merkhilfe ? `<div class="info-block"><h2 data-h="4">💡 Merkhilfe</h2><p>${esc(v.merkhilfe)}</p></div>` : ''}
    </div>`;
}

export async function vokabelView({ id }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const v = await db.get('vokabeln', id);
  if (!v) { ctx.go('bibliothek'); return null; }
  const d = await unitDaten(v.unitId);
  const i = d.voks.findIndex((x) => x.id === id);
  const prev = d.voks[i - 1], next = d.voks[i + 1];
  const part = d.parts.find((p) => p.id === v.partId);
  const html = `
    <p class="muted small" style="text-align:center">Part ${esc(part?.kennung || '?')} · Karte ${i + 1} von ${d.voks.length}</p>
    ${karteHtml(v, d.fach)}
    <div class="btn-row">
      ${prev ? `<a class="btn secondary" href="#/vokabel/${esc(prev.id)}">‹ Vorherige</a>` : ''}
      ${next ? `<a class="btn" href="#/vokabel/${esc(next.id)}">Nächste ›</a>` : `<a class="btn" href="#/unit/${esc(v.unitId)}">Fertig ✓</a>`}
    </div>
    <div class="btn-row"><a class="btn secondary" href="#/vokabel-bearbeiten/${esc(v.id)}">✏️ Bearbeiten</a></div>`;
  return {
    title: v.wort, back: `unit/${v.unitId}`, html,
    bind(root) {
      bindSprechen(root, ctx);
      const g = $('#v-geprueft', root);
      if (g) g.onclick = async () => { await db.put('vokabeln', { ...v, pruefen: false, pruefgrund: '' }); toast('Danke! Als geprüft markiert.'); ctx.rerender(); };
    }
  };
}

export async function vokabelFormView({ id, unitId }, ctx) {
  if (brauchtProfil(ctx)) return null;
  const neu = !id;
  const v = neu
    ? { id: uid('v'), unitId, partId: '', wort: '', lautschrift: '', wortart: 'sonstiges', bedeutungen: [], formen: {}, beispiele: [], andereSprachen: [], gegenteile: [], synonyme: [], wortfamilie: [], stolpersteine: [], merkhilfe: '', erklaerung: '' }
    : await db.get('vokabeln', id);
  if (!v) { ctx.go('bibliothek'); return null; }
  const d = await unitDaten(v.unitId);
  if (!d) { ctx.go('bibliothek'); return null; }
  if (neu) {
    const letzte = d.voks[d.voks.length - 1];
    v.partId = letzte?.partId || d.parts[d.parts.length - 1]?.id || '';
    v.reihenfolge = (d.voks.reduce((m, x) => Math.max(m, x.reihenfolge || 0), 0)) + 1;
  }
  const latein = d.fach.formenTyp === 'latein';
  const f = v.formen || {};
  const inp = (key, label, val, ph = '') => `<div><label for="vf-${key}">${label}</label><input id="vf-${key}" type="text" value="${esc(val || '')}" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off"></div>`;
  const ta = (key, label, arr) => `<label for="vf-${key}">${label} <span class="muted small">(eins pro Zeile)</span></label><textarea id="vf-${key}" style="min-height:90px;font-family:inherit;font-size:17px">${esc((arr || []).join('\n'))}</textarea>`;
  const html = `
    ${inp('wort', 'Wort', v.wort)}
    <div class="field-row">
      ${latein ? '' : inp('lautschrift', 'Lautschrift', v.lautschrift)}
      <div><label for="vf-wortart">Wortart</label><select id="vf-wortart">${WORTARTEN.map((w) => `<option value="${w}" ${w === v.wortart ? 'selected' : ''}>${WORTART_NAMEN[w]}</option>`).join('')}</select></div>
      <div><label for="vf-part">Part</label><select id="vf-part">${d.parts.map((p) => `<option value="${p.id}" ${p.id === v.partId ? 'selected' : ''}>${esc(p.kennung)}</option>`).join('')}<option value="__neu" ${d.parts.length ? '' : 'selected'}>➕ neuer Part …</option></select></div>
    </div>
    ${inp('bedeutungen', 'Bedeutungen (mit ; trennen)', v.bedeutungen.join('; '))}
    <h2 data-h="3">Formen</h2>
    <div class="field-row">
      ${latein ? `
        ${inp('genitiv', 'Genitiv', f.genitiv)}
        <div><label for="vf-genus">Genus</label><select id="vf-genus"><option value=""></option>${['m', 'f', 'n', 'm/f'].map((g) => `<option ${g === f.genus ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        ${inp('deklination', 'Deklination', f.deklination, 'a, o, kons …')}
        ${inp('adjektiv_endungen', 'Adjektiv-Endungen', f.adjektiv_endungen, '-a, -um')}
        ${inp('stammformen', 'Stammformen (mit Komma)', (f.stammformen || []).join(', '))}
        ${inp('konjugation', 'Konjugation', f.konjugation, 'a, e, i, kons …')}
        ${inp('rektion', 'Rektion', f.rektion, 'm. Akk.')}` : `
        ${inp('plural', 'Plural (nur unregelmäßig)', f.plural)}
        ${inp('simple_past', 'Simple past', f.simple_past)}
        ${inp('past_participle', 'Past participle', f.past_participle)}
        ${inp('steigerung', 'Steigerung', f.steigerung)}`}
    </div>
    ${inp('erklaerung', 'Erklärung (Fremdsprache)', v.erklaerung)}
    <label for="vf-beispiele">Beispielsätze <span class="muted small">(einer pro Zeile, Übersetzung nach „|“)</span></label>
    <textarea id="vf-beispiele" style="min-height:90px;font-family:inherit;font-size:17px" placeholder="The path is steep. | Der Weg ist steil.">${esc((v.beispiele || []).map((b) => b.deutsch ? `${b.fremd} | ${b.deutsch}` : b.fremd).join('\n'))}</textarea>
    ${ta('gegenteile', 'Gegenteile', v.gegenteile)}
    ${ta('synonyme', 'Ähnliche Wörter', v.synonyme)}
    ${ta('wortfamilie', 'Wortfamilie', v.wortfamilie)}
    ${ta('stolpersteine', 'Stolpersteine', v.stolpersteine)}
    ${inp('merkhilfe', 'Merkhilfe', v.merkhilfe)}
    <div class="btn-row"><button class="btn" id="vf-save">${neu ? 'Hinzufügen' : 'Speichern'}</button></div>
    ${neu ? '' : '<div class="btn-row"><button class="btn danger" id="vf-del">🗑️ Vokabel löschen</button></div>'}`;
  return {
    title: neu ? 'Neue Vokabel' : 'Vokabel bearbeiten', back: neu ? `unit/${v.unitId}` : `vokabel/${id}`, html,
    bind(root) {
      const val = (k) => ($(`#vf-${k}`, root)?.value || '').trim();
      const zeilen = (k) => val(k).split('\n').map((s) => s.trim()).filter(Boolean);
      $('#vf-save', root).onclick = async () => {
        const wort = val('wort');
        const bedeutungen = val('bedeutungen').split(';').map((s) => s.trim()).filter(Boolean);
        if (!wort || !bedeutungen.length) { toast('Wort und Bedeutung dürfen nicht leer sein.'); return; }
        const formen = {};
        const keys = latein ? ['genitiv', 'genus', 'deklination', 'adjektiv_endungen', 'konjugation', 'rektion'] : ['plural', 'simple_past', 'past_participle', 'steigerung'];
        keys.forEach((k) => { if (val(k)) formen[k] = val(k); });
        if (latein && val('stammformen')) formen.stammformen = val('stammformen').split(',').map((s) => s.trim()).filter(Boolean);
        let partId = val('part');
        if (partId === '__neu') {
          const kennung = (prompt('Name des neuen Parts (z. B. A, B, C):', d.parts.length ? '' : 'A') || '').trim();
          if (!kennung) return;
          const p = d.parts.find((x) => x.kennung.toLowerCase() === kennung.toLowerCase())
            || { id: uid('p'), unitId: v.unitId, kennung, titel: '', reihenfolge: d.parts.reduce((m, x) => Math.max(m, x.reihenfolge || 0), 0) + 1 };
          if (!d.parts.includes(p)) await db.put('parts', p);
          partId = p.id;
        }
        const alteBsp = new Map((v.beispiele || []).map((b) => [b.fremd, b]));
        const beispiele = zeilen('beispiele').map((z) => {
          const [fremd, ...rest] = z.split('|');
          const b = { fremd: fremd.trim(), deutsch: rest.join('|').trim() };
          return { ...b, quelle: alteBsp.get(b.fremd)?.quelle || 'eigene' };
        }).filter((b) => b.fremd);
        await db.put('vokabeln', {
          ...v, wort, bedeutungen, formen, lautschrift: latein ? '' : val('lautschrift'), wortart: val('wortart'), partId, beispiele,
          erklaerung: val('erklaerung'), gegenteile: zeilen('gegenteile'), synonyme: zeilen('synonyme'),
          wortfamilie: zeilen('wortfamilie'), stolpersteine: zeilen('stolpersteine'), merkhilfe: val('merkhilfe'),
          pruefen: false, pruefgrund: ''
        });
        if (neu) await db.put('units', { ...d.unit, geaendertAm: new Date().toISOString() });
        toast(neu ? `„${wort}“ hinzugefügt ✓` : 'Gespeichert.');
        ctx.go(neu ? `unit/${v.unitId}` : `vokabel/${id}`);
      };
      const del = $('#vf-del', root);
      if (del) del.onclick = async () => {
        if (!confirm(`„${v.wort}“ löschen?`)) return;
        const ops = [{ store: 'vokabeln', op: 'del', key: v.id }];
        for (const ls of await db.byIndex('lernstand', 'vokabelId', v.id)) ops.push({ store: 'lernstand', op: 'del', key: ls.key });
        await db.batch(ops);
        ctx.go(`unit/${v.unitId}`);
      };
    }
  };
}

// ---------- Backup ----------

const ANBIETER = [
  { id: 'icloud', icon: '☁️', name: 'iCloud Drive', schritte: 'Sichern › im Teilen-Menü „In Dateien sichern“ › „iCloud Drive“ wählen › Sichern.' },
  { id: 'onedrive', icon: '🟦', name: 'OneDrive', schritte: 'OneDrive-App installieren und anmelden. Einmalig: Dateien-App › Durchsuchen › ⋯ › Bearbeiten › „OneDrive“ einschalten. Dann: Sichern › „In Dateien sichern“ › OneDrive wählen.' },
  { id: 'dropbox', icon: '📦', name: 'Dropbox', schritte: 'Dropbox-App installieren und anmelden. Einmalig in der Dateien-App unter Durchsuchen › Bearbeiten „Dropbox“ einschalten. Dann: Sichern › „In Dateien sichern“ › Dropbox wählen.' },
  { id: 'gdrive', icon: '🟩', name: 'Google Drive', schritte: 'Google-Drive-App installieren und anmelden, in der Dateien-App einschalten. Dann: Sichern › „In Dateien sichern“ › Google Drive wählen.' },
  { id: 'android', icon: '🤖', name: 'Android', schritte: 'Sichern › im Teilen-Menü die Drive-, OneDrive- oder Dropbox-App wählen – oder „Speichern unter“ und einen Ordner aussuchen.' }
];

export async function backupView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const S = await import('./sicherung.js');
  const [letzte, art, ordner, auto, erinnerung] = await Promise.all([
    S.letzteSicherung(), db.getMeta('letztesBackupArt'), S.ordner(), db.getMeta('autoSicherung', false), db.getMeta('erinnerungTage', 7)
  ]);
  const seit = letzte ? Math.floor((Date.now() - new Date(letzte).getTime()) / 86400000) : null;
  const artText = { ordner: 'in den Sicherungsordner', geteilt: 'über Teilen', heruntergeladen: 'als Download' }[art] || '';
  const mobil = isIOS() || /Android/i.test(navigator.userAgent);
  const AB = await import('./abgleich-views.js');
  const abgleich = await AB.abgleichKarte();
  const cloud = await db.getMeta('cloud');
  const cloudOk = cloud?.anbieter && cloud.status === 'ok' && cloud.zuletzt;
  const dateiAlt = seit === null || seit >= (erinnerung || 999);
  const geschuetzt = cloudOk || !dateiAlt;
  const cloudName = cloud?.anbieter === 'onedrive' ? 'OneDrive' : 'Cloud';
  const html = `
    <section class="card ${geschuetzt ? '' : 'heute'}" aria-labelledby="ds-titel">
      <div class="daten-status">
        <span class="ds-icon" aria-hidden="true">${geschuetzt ? '✅' : '⚠️'}</span>
        <div class="grow">
          <h2 data-h="3" style="margin:0" id="ds-titel">${geschuetzt ? 'Deine Daten sind geschützt' : 'Deine Daten liegen nur auf diesem Gerät'}</h2>
          <ul class="small">
            <li>${cloud?.anbieter ? (cloudOk ? `Abgleich mit ${cloudName}: zuletzt ${esc(new Date(cloud.zuletzt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}` : `Abgleich mit ${cloudName}: ${cloud.status === 'anmelden' ? 'bitte neu anmelden' : 'noch nicht erfolgreich'}`) : 'Kein automatischer Abgleich eingerichtet'}</li>
            <li>Sicherungsdatei: ${letzte ? `${datum(letzte)}${seit ? ` (vor ${plural(seit, 'Tag', 'Tagen')})` : ' (heute)'}` : 'noch nie erstellt'}</li>
          </ul>
          ${geschuetzt ? '' : '<p class="small" style="margin-bottom:0">Wird die App gelöscht oder der Browser-Speicher geleert, sind die Daten weg. Am einfachsten: unten den automatischen Abgleich einrichten – oder eine Sicherungsdatei erstellen.</p>'}
        </div>
      </div>
    </section>

    ${abgleich}

    <section class="card" aria-labelledby="sd-titel">
      <h2 data-h="3" style="margin-top:0" id="sd-titel">💾 Sicherungsdatei</h2>
      <p class="small" style="margin-top:0">Eine Datei mit <strong>allem</strong> – Bücher, Vokabeln, Profile, Lernstände, Gutscheine. Für den Notfall, zum Aufbewahren oder für den Umzug auf ein neues Gerät.</p>
      <button class="btn block" id="bk-export">${mobil ? '📤 Sicherungsdatei erstellen (Teilen-Menü)' : '⬇️ Sicherungsdatei herunterladen'}</button>
      ${ordner ? '<button class="btn soft block" id="bk-ordner-jetzt" style="margin-top:10px">📁 In Sicherungsordner speichern</button>' : ''}
      <label class="btn secondary block" for="bk-file" style="margin-top:10px">📂 Sicherungsdatei laden …</label>
      <input id="bk-file" type="file" accept=".json,application/json" class="sr-only">
      ${ordner ? '<button class="btn secondary block" id="bk-aus-ordner" style="margin-top:10px">Aus Sicherungsordner laden …</button><div id="bk-liste"></div>' : ''}
      <div id="bk-info"></div>
      <p class="muted small">Beim Laden gewinnt die Datei: Ihr Stand wird übernommen, Einträge, die nur auf diesem Gerät existieren, bleiben erhalten.</p>
      <label for="bk-erinnerung">Erinnern, wenn die letzte Sicherung älter ist als</label>
      <select id="bk-erinnerung">${[[0, 'nie erinnern'], [3, '3 Tage'], [7, '7 Tage'], [14, '14 Tage'], [30, '30 Tage']].map(([v, t]) => `<option value="${v}" ${v === erinnerung ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <p class="muted small">Ein Cloud-Abgleich zählt auch als Sicherung.</p>
      <details class="anbieter"><summary>Datei in iCloud, OneDrive, Dropbox oder Google Drive ablegen (Anleitung)</summary>
        ${ANBIETER.map((a) => `<p class="small"><strong>${a.icon} ${esc(a.name)}:</strong> ${esc(a.schritte)}</p>`).join('')}
      </details>
      ${S.ORDNER_MOEGLICH ? `<details class="anbieter" ${ordner ? 'open' : ''}><summary>📁 Sicherungsordner am Computer</summary>
        <p class="small">Wähle einmal einen Ordner – am besten deinen <strong>OneDrive-, Dropbox-, Google-Drive- oder iCloud-Ordner</strong> auf dem Computer. Die App legt dort Sicherungen ab und behält die letzten 10.</p>
        ${ordner ? `<div id="bk-status"><p class="muted small">Prüfe Sicherungsordner …</p></div>
          <label class="switch"><input type="checkbox" id="bk-auto" ${auto ? 'checked' : ''}> Automatisch sichern (1× täglich nach dem Lernen)</label>
          <div class="btn-row"><button class="btn secondary" id="bk-ordner">Anderen Ordner wählen</button><button class="btn secondary" id="bk-ordner-weg">Ordner entfernen</button></div>`
        : '<button class="btn secondary block" id="bk-ordner">Ordner wählen …</button>'}
      </details>` : ''}
    </section>

    <section class="card" aria-labelledby="vt-titel">
      <h2 data-h="3" style="margin-top:0" id="vt-titel">📦 Nur Vokabeln weitergeben <span class="badge">ohne Profile</span></h2>
      <p class="small" style="margin-top:0">Als Datei (z. B. per Messenger) – ohne Profile und Lernfortschritt. Für Geschwister, Freunde oder die Klasse.</p>
      <div class="btn-row"><a class="btn soft" href="#/teilen">Paket erstellen</a><a class="btn secondary" href="#/paket-laden">Paket laden</a></div>
    </section>

    <details class="card"><summary>Gefahrenzone</summary>
      <p>Löscht alle Daten auf diesem Gerät.</p>
      <button class="btn danger block" id="bk-wipe">Alles löschen</button>
    </details>`;
  return {
    title: 'Sichern & Abgleichen', back: 'home', html,
    bind(root) {
      const fehler = (e) => { if (e?.name !== 'AbortError') toast('Hat nicht geklappt: ' + (e?.message || e)); };
      AB.bindAbgleich(root, ctx);

      // ----- Status des Sicherungsordners -----
      const zeit = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const kb = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
      const STATUS = {
        synchron: ['ok', '✓ Synchron', 'Die neueste Sicherung im Ordner enthält genau den aktuellen Stand der App.'],
        veraltet: ['warn', '⚠ Nicht aktuell', 'Seit der neuesten Sicherung im Ordner hat sich in der App etwas geändert (gelernt, eingelesen oder bearbeitet).'],
        leer: ['warn', '⚠ Noch keine Sicherung', 'Im Ordner liegt noch keine Vokabel-Studio-Sicherung.'],
        keinZugriff: ['info', '🔒 Zugriff nötig', 'Der Browser fragt nach jedem Neustart einmal, ob die App den Ordner benutzen darf.'],
        fehler: ['err', '✗ Problem', '']
      };
      const zeigeStatus = async (fragen = false) => {
        const box = $('#bk-status', root);
        if (!box) return;
        const st = await S.ordnerStatus({ fragen });
        const [kl, titel, text] = STATUS[st.art] || STATUS.fehler;
        box.innerHTML = `
          <div class="ordner-kopf"><span class="ordner-icon">📁</span><span class="grow"><strong>${esc(st.name || '')}</strong>
            ${st.seit ? `<br><span class="muted small">gewählt am ${esc(datum(st.seit))}</span>` : ''}</span></div>
          <div class="msg ${kl} small"><strong>${titel}</strong><br>${esc(st.grund || text)}
            ${st.neueste ? `<br>Neueste Sicherung: <strong>${esc(zeit(st.neueste.geaendert))}</strong> · ${kb(st.neueste.groesse)}` : ''}</div>
          <div class="btn-row">
            ${st.art === 'keinZugriff' ? '<button class="btn" id="bk-zugriff">Zugriff erlauben</button>' : ''}
            ${st.art === 'veraltet' || st.art === 'leer' ? '<button class="btn" id="bk-sync">Jetzt synchronisieren</button>' : ''}
            ${st.art !== 'keinZugriff' ? '<button class="btn secondary" id="bk-pruefen">Neu prüfen</button>' : ''}
          </div>
          ${st.dateien?.length ? `<details><summary>${plural(st.dateien.length, 'Sicherung', 'Sicherungen')} im Ordner</summary>
            <ul class="small">${st.dateien.map((d) => `<li>${esc(d.name)} – ${esc(zeit(d.geaendert))}, ${kb(d.groesse)}</li>`).join('')}</ul></details>` : ''}
          <p class="muted small">Der Browser zeigt nur den Ordnernamen, nicht den vollständigen Pfad. Ob OneDrive/Dropbox die Datei schon hochgeladen hat, siehst du im Programm des Cloud-Dienstes (Symbol in der Taskleiste bzw. Menüleiste).</p>`;
        const z = $('#bk-zugriff', root);
        if (z) z.onclick = () => zeigeStatus(true);
        const s = $('#bk-sync', root);
        if (s) s.onclick = async () => {
          s.disabled = true; s.textContent = 'Speichere …';
          try { const r = await S.sichereInOrdner(); toast(r.ok ? 'Synchronisiert ✓' : r.grund); } catch (e) { fehler(e); }
          zeigeStatus();
        };
        const p = $('#bk-pruefen', root);
        if (p) p.onclick = () => zeigeStatus();
      };
      zeigeStatus();
      $('#bk-export', root).onclick = async () => {
        try { const r = await S.sichereAlsDatei(); if (r !== 'abgebrochen') { toast('Sicherung erstellt.'); ctx.rerender(); } } catch (e) { fehler(e); }
      };
      const jetzt = $('#bk-ordner-jetzt', root);
      if (jetzt) jetzt.onclick = async () => {
        try { const r = await S.sichereInOrdner(); toast(r.ok ? `Gespeichert in „${r.ordner}“ ✓` : r.grund); } catch (e) { fehler(e); }
        zeigeStatus();
      };
      const wahl = $('#bk-ordner', root);
      if (wahl) wahl.onclick = async () => {
        try { await S.waehleOrdner(); const r = await S.sichereInOrdner(); toast(r.ok ? 'Ordner gewählt, erste Sicherung gespeichert ✓' : r.grund); ctx.rerender(); } catch (e) { fehler(e); }
      };
      const weg = $('#bk-ordner-weg', root);
      if (weg) weg.onclick = async () => { await S.entferneOrdner(); ctx.rerender(); };
      const au = $('#bk-auto', root);
      if (au) au.onchange = async () => { await db.setMeta('autoSicherung', au.checked); toast(au.checked ? 'Automatische Sicherung an.' : 'Automatische Sicherung aus.'); };
      $('#bk-erinnerung', root).onchange = async (e) => { await db.setMeta('erinnerungTage', +e.target.value); toast('Gespeichert.'); };

      const zeigeLaden = async (obj) => {
        const info = $('#bk-info', root);
        if (obj?.format === 'vokabel-studio-paket') {
          const T = await import('./teilen-views.js');
          T.paketVormerken(obj);
          ctx.go('paket-laden');
          return;
        }
        const err = backup.pruefeBackup(obj);
        if (err) { info.innerHTML = `<div class="msg err">${esc(err)}${obj?.schema ? '<br>Das sieht nach einer Chatbot-Antwort aus – die gehört in „Vokabelseite einlesen“.' : ''}</div>`; return; }
        const z = backup.zusammenfassung(obj);
        info.innerHTML = `<div class="msg info">Sicherung vom ${esc(datum(z.datum))}: ${z.profile} Profile, ${z.units} Units, ${z.vokabeln} Vokabeln.</div>
          <button class="btn block" id="bk-go">Jetzt laden</button>`;
        $('#bk-go', root).onclick = async () => { const n = await backup.spieleEin(obj); toast(`${n} Einträge geladen.`); ctx.go('home'); };
        info.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      const lese = async (file) => {
        try { zeigeLaden(JSON.parse(await file.text())); }
        catch { $('#bk-info', root).innerHTML = '<div class="msg err">Die Datei ist beschädigt oder keine JSON-Datei.</div>'; }
      };
      $('#bk-file', root).onchange = (e) => { if (e.target.files[0]) lese(e.target.files[0]); };
      const ausOrdner = $('#bk-aus-ordner', root);
      if (ausOrdner) ausOrdner.onclick = async () => {
        try {
          const liste = await S.sicherungenImOrdner();
          $('#bk-liste', root).innerHTML = liste.length ? liste.map((x, i) => `<button class="btn secondary block" data-i="${i}" style="margin-top:6px">${esc(x.name)}</button>`).join('') : '<p class="muted small">Keine Sicherungen im Ordner.</p>';
          $$('#bk-liste [data-i]', root).forEach((b) => b.onclick = async () => lese(await liste[+b.dataset.i].handle.getFile()));
        } catch (e) { fehler(e); }
      };
      $('#bk-wipe', root).onclick = async () => {
        if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Erstelle vorher eine Sicherung!')) return;
        if (!confirm('Letzte Nachfrage: Alles unwiderruflich löschen?')) return;
        await db.clearStores([...db.INHALT_STORES, ...db.LERN_STORES, 'profile', 'importe', 'meta', 'geloescht']);
        ctx.setzeAktivesProfil(null);
        location.hash = '#/';
        location.reload();
      };
    }
  };
}

// ---------- Einstellungen ----------

export async function einstellungenView(_p, ctx) {
  if (brauchtProfil(ctx)) return null;
  const e = ctx.profil.einstellungen || {};
  let speicher = '';
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      speicher = `${(est.usage / 1024 / 1024).toFixed(1)} MB belegt`;
    }
    if (navigator.storage?.persisted) speicher += (await navigator.storage.persisted()) ? ' · dauerhaft gespeichert ✓' : ' · nicht dauerhaft geschützt';
  } catch { /* egal */ }
  const html = `
    <div class="card">
      <h2 data-h="3" style="margin-top:0">🎨 Darstellung</h2>
      <label>Style</label>
      <div class="style-wahl" id="st-style">${Object.entries(STYLES).map(([id, s]) => `<button class="style-karte ${(e.style || 'standard') === id ? 'on' : ''}" data-style-id="${id}">
        <img src="${s.logo}" alt=""><strong>${esc(s.name)}</strong><small>${esc(s.kurz)}</small>
        <span class="emo">${s.emoji.lernen}${s.emoji.erfolge}${s.emoji.punkt}</span></button>`).join('')}</div>
      <div class="btn-row"><button class="btn soft" id="st-feier">🎉 Feier im Style ansehen</button></div>
      <label id="st-text-l">Textgröße</label>
      <div class="btn-row" id="st-text" role="group" aria-labelledby="st-text-l">${TEXTGROESSEN.map(([w, t, f]) => `<button class="btn ${(e.textgroesse || 'normal') === w ? '' : 'secondary'}" data-text="${w}" aria-pressed="${(e.textgroesse || 'normal') === w}" style="font-size:${Math.round(17 * f)}px">${t}</button>`).join('')}</div>
      <label>Hell oder dunkel</label>
      <div class="btn-row" id="st-design">${DESIGNS.map(([w, t]) => `<button class="btn ${(e.design || 'auto') === w ? '' : 'secondary'}" data-design="${w}">${w === 'dunkel' ? '🌙 ' : w === 'hell' ? '☀️ ' : '📱 '}${esc(t)}</button>`).join('')}</div>
      <label class="switch" style="margin-top:14px"><input type="checkbox" id="st-anim" ${e.animationen ? 'checked' : ''}> Animationen bei Erfolgen (Konfetti, Abzeichen, Punkte)</label>
      <div class="btn-row"><button class="btn soft" id="st-anim-test">✨ Vorschau</button></div>
      ${window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? '<p class="muted small">Hinweis: Auf diesem Gerät ist „Bewegung reduzieren“ an. Dann bleiben Animationen aus.</p>' : ''}
    </div>
    <div class="card">
      <h2 data-h="3" style="margin-top:0">🎯 Lernen & Abfrage</h2>
      <label for="st-richtung">Richtung</label>
      <select id="st-richtung">
        <option value="beide" ${e.abfrageRichtung === 'beide' ? 'selected' : ''}>Beide Richtungen</option>
        <option value="fremd-deutsch" ${e.abfrageRichtung === 'fremd-deutsch' ? 'selected' : ''}>Fremdsprache → Deutsch</option>
        <option value="deutsch-fremd" ${e.abfrageRichtung === 'deutsch-fremd' ? 'selected' : ''}>Deutsch → Fremdsprache</option>
      </select>
      <label for="st-tempo">Vorlese-Tempo: <span id="st-tempo-w">${Math.round((e.sprechtempo || 0.9) * 100)} %</span></label>
      <input id="st-tempo" type="range" min="0.6" max="1.1" step="0.05" value="${e.sprechtempo || 0.9}" style="width:100%;height:44px">
      <label class="switch" style="margin-top:10px"><input type="checkbox" id="st-auto" ${e.vorlesenAutomatisch ? 'checked' : ''}> Fremdwörter beim Abfragen automatisch vorlesen</label>
      <label for="st-ziel">Neue Vokabeln pro Tag</label>
      <select id="st-ziel">${[5, 10, 15, 20, 30].map((n) => `<option ${n === (e.tagesziel || 20) ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="card">
      <h2 data-h="3" style="margin-top:0">🔊 Vorlesen testen</h2>
      <div class="btn-row">
        <button class="btn soft" data-say="Welcome to Snowdonia! The path is very steep." data-lang="en-GB">Englisch</button>
        <button class="btn soft" data-say="Willkommen! Heute lernen wir Vokabeln." data-lang="de-DE">Deutsch</button>
        <button class="btn soft" data-say="Salvete, amici! Puella villam videt." data-lang="it-IT">Latein</button>
      </div>
      <p class="hinweis-latein">🇮🇹 Für Latein wird eine italienische Stimme genutzt. Die Aussprache ist daher nur ungefähr.</p>
      <p class="muted small">Klingt eine Stimme blechern? Auf dem iPhone unter Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen bessere Stimmen laden („Erweitert“).</p>
    </div>
    <div class="card">
      <h2 data-h="3" style="margin-top:0">📱 Gerätetest</h2>
      <p>Prüft Vorlesen, Mikrofon, Speicher und Teilen auf diesem Gerät und erstellt einen Bericht zum Kopieren.</p>
      <a class="btn secondary block" href="diagnose.html">Gerätetest öffnen</a>
    </div>
    <div class="card">
      <h2 data-h="3" style="margin-top:0">Speicher</h2>
      <p class="small">${esc(speicher || 'keine Angabe')}</p>
      <button class="btn secondary block" id="st-persist">Daten vor automatischem Löschen schützen</button>
    </div>
    <p class="muted small" style="text-align:center">Vokabel-Studio · Version ${esc(APP_VERSION)}<br><a href="#/datenschutz">Datenschutz & Sicherheit</a></p>`;
  return {
    title: 'Einstellungen', back: 'home', html,
    bind(root) {
      bindSprechen(root, ctx);
      const speichern = async () => {
        const p = await db.get('profile', ctx.profil.id);
        p.einstellungen = {
          ...(p.einstellungen || {}), abfrageRichtung: $('#st-richtung', root).value, sprechtempo: +$('#st-tempo', root).value,
          vorlesenAutomatisch: $('#st-auto', root).checked, tagesziel: +$('#st-ziel', root).value,
          animationen: $('#st-anim', root).checked, design: design, style: stil, textgroesse: text
        };
        await db.put('profile', p);
        ctx.profil = p;
        fx.setzeAnimationen(p.einstellungen.animationen);
      };
      let design = e.design || 'auto';
      let text = e.textgroesse || 'normal';
      $$('#st-text [data-text]', root).forEach((b) => b.onclick = async () => {
        text = b.dataset.text;
        setzeTextgroesse(text);
        $$('#st-text [data-text]', root).forEach((x) => { x.classList.toggle('secondary', x !== b); x.setAttribute('aria-pressed', String(x === b)); });
        await speichern();
      });
      let stil = e.style || 'standard';
      $$('#st-style [data-style-id]', root).forEach((b) => b.onclick = async () => {
        stil = b.dataset.styleId;
        setzeStyle(stil);
        await speichern();
        ctx.rerender();
      });
      $('#st-feier', root).onclick = () => { fx.konfetti(2, { erzwingen: true }); setTimeout(() => fx.abzeichen({ icon: E('erfolge'), name: 'Vorschau', text: 'So feiert die App in diesem Style.' }, { erzwingen: true }), 900); };
      $$('#st-design [data-design]', root).forEach((b) => b.onclick = async () => {
        design = b.dataset.design;
        setzeDesign(design);
        $$('#st-design [data-design]', root).forEach((x) => x.classList.toggle('secondary', x !== b));
        await speichern();
      });
      $('#st-anim', root).onchange = async () => {
        await speichern();
        if ($('#st-anim', root).checked) fx.konfetti(1);
      };
      $('#st-anim-test', root).onclick = () => fx.abzeichen({ icon: '🌟', name: 'Vorschau', text: 'So sieht es aus, wenn du ein Abzeichen bekommst.' }, { erzwingen: true });
      $('#st-richtung', root).onchange = speichern;
      $('#st-tempo', root).oninput = () => { $('#st-tempo-w', root).textContent = Math.round($('#st-tempo', root).value * 100) + ' %'; };
      $('#st-tempo', root).onchange = speichern;
      $('#st-auto', root).onchange = speichern;
      $('#st-ziel', root).onchange = speichern;
      $('#st-persist', root).onclick = async () => {
        if (!navigator.storage?.persist) { toast('Dieser Browser unterstützt das nicht. Sichere regelmäßig!'); return; }
        const ok = await navigator.storage.persist();
        toast(ok ? 'Geschützt ✓' : 'Der Browser hat abgelehnt. Lege die App auf den Home-Bildschirm und sichere regelmäßig.');
        ctx.rerender();
      };
    }
  };
}
