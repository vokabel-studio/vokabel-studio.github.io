// Stufe 3/4: Lernplan & Termine, Druckansicht, Erfolge, Eltern-Ansicht
import * as db from './db.js';
import { lehrwerkName, unitWort } from './faecher.js';
import { esc, $, $$, toast, uid, plural, datum } from './util.js';
import * as L from './lernen.js';
import { starteSitzung, unitKontext } from './lern-views.js';
import { ABZEICHEN, hole as holeBelohnung, serieJetzt } from './belohnung.js';
import { avatarHtml } from './avatare.js';
import { E } from './styles.js';

// ================= Lernplan =================

export function erzeugePlan(datumTermin, neueIds) {
  const h = L.heute();
  const tage = [];
  for (let d = h; d < datumTermin; d = L.plusTage(d, 1)) tage.push(d);
  if (!tage.length) tage.push(h);
  const n = tage.length;
  const lernTage = n >= 3 ? n - 1 : n;           // letzter Tag: Probetest
  const proTag = Math.ceil(neueIds.length / lernTage) || 0;
  return tage.map((d, i) => {
    const aufgaben = [];
    const chunk = neueIds.slice(i * proTag, (i + 1) * proTag);
    if (i < lernTage && chunk.length) aufgaben.push({ art: 'neu', vokabelIds: chunk, erledigt: false });
    if (i > 0 || !chunk.length) aufgaben.push({ art: 'wiederholen', erledigt: false });
    if (i === n - 1 && n >= 2) aufgaben.push({ art: 'test', erledigt: false });
    return { datum: d, aufgaben };
  });
}

async function neueVokabelIds(profilId, unitIds) {
  const voks = await L.vokabelnFuerUnits(unitIds);
  const map = await L.lernstandMap(profilId);
  return voks.filter((v) => (L.holeLs(map, profilId, v.id, 'fd')?.box || 0) < 2).sort((a, b) => a.reihenfolge - b.reihenfolge).map((v) => v.id);
}

const AUFGABE = {
  neu: (a) => ({ icon: '🆕', text: `${plural(a.vokabelIds.length, 'neue Vokabel', 'neue Vokabeln')} lernen` }),
  wiederholen: () => ({ icon: '🔁', text: 'Fällige wiederholen' }),
  test: () => ({ icon: '📝', text: 'Probetest' })
};

export async function naechsterTermin(profilId) {
  const h = L.heute();
  return (await db.byIndex('termine', 'profilId', profilId)).filter((t) => t.datum >= h).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
}

export async function planView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const h = L.heute();
  const termine = (await db.byIndex('termine', 'profilId', ctx.profil.id)).sort((a, b) => a.datum.localeCompare(b.datum));
  const kommend = termine.filter((t) => t.datum >= h), vergangen = termine.filter((t) => t.datum < h);
  const z = await L.faelligZahlen(ctx.profil);
  const html = `
    <div class="card" style="text-align:center">
      <div class="muted">Heute fällig</div>
      <div class="prozent">${z.faellig}</div>
      <p class="small muted">${z.neuHeute ? `+ ${plural(z.neuHeute, 'neue Vokabel', 'neue Vokabeln')} für heute` : z.neu ? 'Tagesziel für neue Vokabeln erreicht ✓' : ''}</p>
      <button class="btn block" id="p-faellig" ${z.paare ? '' : 'disabled'}>🔁 Jetzt wiederholen</button>
    </div>
    <h2 data-h="3">Vokabeltests</h2>
    ${kommend.length ? kommend.map((t) => terminZeile(t)).join('') : '<div class="card muted">Noch kein Termin eingetragen.</div>'}
    <a class="btn block" href="#/termin-neu">➕ Termin für Vokabeltest eintragen</a>
    ${vergangen.length ? `<details class="card"><summary>Vergangene Termine (${vergangen.length})</summary>${vergangen.reverse().map((t) => terminZeile(t)).join('')}</details>` : ''}
    <div class="msg info small" style="margin-top:20px"><strong>So funktioniert der Wiederholungsplan:</strong> Jede Vokabel wandert bei einer richtigen Antwort einen Kasten weiter (Kasten 1 → 5) und kommt dann erst nach 1, 2, 4, 8 bzw. 16 Tagen wieder. Bei einer falschen Antwort geht sie zurück in Kasten 1.</div>`;
  return {
    title: 'Lernplan', back: 'home', html,
    bind(root) {
      $('#p-faellig', root).onclick = async () => {
        const r = await starteSitzung({ modus: 'faellig', unitIds: await L.profilUnitIds(ctx.profil), zurueck: 'plan' }, ctx.profil);
        if (r.leer) toast(r.leer); else ctx.go('uebung');
      };
    }
  };
}

function terminZeile(t) {
  const d = L.tageBis(t.datum);
  const wann = d === 0 ? 'heute' : d === 1 ? 'morgen' : d > 0 ? `in ${d} Tagen` : datum(t.datum);
  const heuteTag = t.plan?.find((p) => p.datum === L.heute());
  const offen = heuteTag?.aufgaben.filter((a) => !a.erledigt).length || 0;
  return `<a class="card list-item" href="#/termin/${esc(t.id)}" style="margin:10px 0">
    <span style="font-size:30px">📝</span>
    <span class="grow"><span class="vok-wort">${esc(t.titel)}</span><br><span class="vok-de">${esc(L.datumLang(t.datum))} · ${wann}</span></span>
    ${offen ? `<span class="badge warn">${offen} offen</span>` : heuteTag ? '<span class="badge ok">✓ heute</span>' : ''}<span class="chev">›</span></a>`;
}

export async function terminFormView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const alt = query.id ? await db.get('termine', query.id) : null;
  const { units, lw, fachVonUnit } = await unitKontext();
  const erlaubt = units.filter((u) => !ctx.profil.fachIds?.length || ctx.profil.fachIds.includes(fachVonUnit.get(u.id).id) || alt?.unitIds.includes(u.id))
    .sort((a, b) => lehrwerkName(lw.get(a.lehrwerkId)).localeCompare(lehrwerkName(lw.get(b.lehrwerkId))) || a.nummer.localeCompare(b.nummer, 'de', { numeric: true }));
  const morgen = L.plusTage(L.heute(), 1);
  const gewaehlt = (u) => (alt ? alt.unitIds.includes(u.id) : query.unit === u.id);
  const html = `
    <label for="tf-titel">Was wird geschrieben?</label>
    <input id="tf-titel" type="text" value="${esc(alt?.titel || 'Vokabeltest')}" maxlength="60">
    <label for="tf-datum">Wann?</label>
    <input id="tf-datum" type="date" min="${morgen}" value="${esc(alt?.datum || L.plusTage(L.heute(), 7))}">
    <label>Was kommt dran?</label>
    <div class="card" style="padding:6px 14px">
      ${erlaubt.length ? erlaubt.map((u) => `<label class="switch" style="display:flex;min-height:48px"><input type="checkbox" class="tf-unit" value="${esc(u.id)}" ${gewaehlt(u) ? 'checked' : ''}>
        <span class="grow">${unitWort(fachVonUnit.get(u.id))} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''} <span class="muted small">(${esc(lehrwerkName(lw.get(u.lehrwerkId)))})</span></span></label>`).join('') : '<p class="muted">Noch nichts eingelesen.</p>'}
    </div>
    ${alt ? '<p class="muted small">Beim Speichern wird der Lernplan neu berechnet. Heute schon erledigte Aufgaben bleiben abgehakt.</p>' : ''}
    <button class="btn block" id="tf-save">${alt ? 'Speichern' : 'Plan erstellen'}</button>`;
  return {
    title: alt ? 'Termin bearbeiten' : 'Neuer Termin', back: alt ? `termin/${alt.id}` : 'plan', html,
    bind(root) {
      $('#tf-save', root).onclick = async () => {
        const unitIds = $$('.tf-unit:checked', root).map((c) => c.value);
        const d = $('#tf-datum', root).value;
        if (!unitIds.length) { toast('Wähle mindestens eine Unit/Lektion.'); return; }
        if (!d || d <= L.heute()) { toast('Der Termin muss in der Zukunft liegen.'); return; }
        const t = { ...(alt || { id: uid('tm'), profilId: ctx.profil.id, erstelltAm: new Date().toISOString() }), titel: $('#tf-titel', root).value.trim() || 'Vokabeltest', datum: d, unitIds };
        const heuteAlt = alt?.plan?.find((x) => x.datum === L.heute());
        t.plan = erzeugePlan(d, await neueVokabelIds(ctx.profil.id, unitIds));
        const heuteNeu = t.plan.find((x) => x.datum === L.heute());
        if (heuteAlt && heuteNeu) heuteNeu.aufgaben.forEach((a) => { if (heuteAlt.aufgaben.some((b) => b.art === a.art && b.erledigt)) a.erledigt = true; });
        await db.put('termine', t);
        toast(alt ? 'Gespeichert ✓' : 'Lernplan erstellt! 📅');
        ctx.go(`termin/${t.id}`);
      };
    }
  };
}

export async function terminView({ id }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const t = await db.get('termine', id);
  if (!t) { ctx.go('plan'); return null; }
  const { units, fachVonUnit } = await unitKontext();
  const namen = t.unitIds.map((uid2) => units.find((u) => u.id === uid2)).filter(Boolean).map((u) => `${unitWort(fachVonUnit.get(u.id))} ${u.nummer}`);
  const h = L.heute();
  const d = L.tageBis(t.datum);
  const stat = await L.kastenStatistik(ctx.profil.id, t.unitIds);
  const html = `
    <div class="card">
      <h2 style="margin-top:0">${esc(t.titel)}</h2>
      <p>${esc(L.datumLang(t.datum))} · <strong>${d > 1 ? `noch ${d} Tage` : d === 1 ? 'morgen!' : d === 0 ? 'heute!' : 'vorbei'}</strong><br><span class="muted">${esc(namen.join(', '))}</span></p>
      <div class="kasten">${stat.zaehl.map((n, i) => `<div><span style="height:${stat.gesamt ? Math.max(4, n / stat.gesamt * 60) : 4}px"></span><small>${i ? i : 'neu'}</small><b>${n}</b></div>`).join('')}</div>
      <p class="small muted">${stat.sicher} von ${stat.gesamt} Vokabeln sicher (Kasten 4–5)</p>
    </div>
    ${t.plan.map((tag) => {
      const istHeute = tag.datum === h, vorbei = tag.datum < h;
      return `<div class="card ${istHeute ? 'heute' : ''}" ${vorbei ? 'style="opacity:.6"' : ''}>
        <div class="check-head"><strong class="grow">${istHeute ? 'Heute' : esc(L.datumLang(tag.datum))}</strong>${istHeute ? '<span class="badge">heute</span>' : ''}</div>
        ${tag.aufgaben.map((a, i) => { const A = AUFGABE[a.art](a); return `<div class="list-item" style="padding:8px 0">
          <span>${a.erledigt ? '✅' : A.icon}</span><span class="grow">${esc(A.text)}</span>
          ${istHeute && !a.erledigt ? `<button class="btn" style="min-height:48px" data-start="${i}">Los</button>` : ''}</div>`; }).join('')}
      </div>`;
    }).join('')}
    ${d === 0 ? '<div class="msg ok">Viel Erfolg heute! 🍀</div>' : ''}
    <div class="btn-row">
      <a class="btn secondary" href="#/termin-neu?id=${esc(t.id)}">✏️ Bearbeiten</a>
      <button class="btn secondary" id="tm-neu">Plan neu berechnen</button>
      <button class="btn danger" id="tm-del">Termin löschen</button>
    </div>`;
  return {
    title: 'Lernplan', back: 'plan', html,
    bind(root) {
      $$('[data-start]', root).forEach((b) => b.onclick = async () => {
        const i = +b.dataset.start;
        const a = t.plan.find((x) => x.datum === h).aufgaben[i];
        const ref = { terminId: t.id, datum: h, index: i };
        const cfg = a.art === 'neu' ? { modus: 'neu', unitIds: t.unitIds, vokabelIds: a.vokabelIds }
          : a.art === 'test' ? { modus: 'test', unitIds: t.unitIds, anzahl: 20 }
            : { modus: 'faellig', unitIds: t.unitIds };
        const r = await starteSitzung({ ...cfg, zurueck: `termin/${t.id}`, terminRef: ref }, ctx.profil);
        if (r.leer) { a.erledigt = true; await db.put('termine', t); toast(r.leer); ctx.rerender(); return; }
        ctx.go('uebung');
      });
      $('#tm-neu', root).onclick = async () => {
        if (t.datum <= h) { toast('Der Termin ist heute oder vorbei.'); return; }
        t.plan = erzeugePlan(t.datum, await neueVokabelIds(ctx.profil.id, t.unitIds));
        await db.put('termine', t); toast('Plan neu berechnet.'); ctx.rerender();
      };
      $('#tm-del', root).onclick = async () => { if (confirm('Termin löschen?')) { await db.del('termine', t.id); ctx.go('plan'); } };
    }
  };
}

// ================= Druckansicht =================
export async function druckView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const unitIds = (query.units || '').split(',').filter(Boolean);
  const { units, lw, fachVonUnit } = await unitKontext();
  const us = unitIds.map((id) => units.find((u) => u.id === id)).filter(Boolean);
  if (!us.length) { ctx.go('lernen'); return null; }
  const fach = fachVonUnit.get(us[0].id);
  const voks = L.mische(await L.vokabelnFuerUnits(unitIds));
  const n = +query.n || 0;
  const sel = n ? voks.slice(0, n) : voks;
  const rs = L.richtungen(ctx.profil, query.richtung || 'beide');
  const fragen = sel.map((v) => ({ v, r: rs[Math.floor(Math.random() * rs.length)] }));
  const titel = `${lehrwerkName(lw.get(us[0].lehrwerkId))} – ${us.map((u) => unitWort(fachVonUnit.get(u.id)) + ' ' + u.nummer).join(', ')}`;
  const zeile = (q, i, loes) => `<tr><td class="nr">${i + 1}.</td><td>${esc(L.frage(q.v, q.r))}</td><td class="${loes ? 'loes' : 'leer'}">${loes ? esc(L.loesungen(q.v, q.r).join('; ')) : ''}</td></tr>`;
  const html = `
    <div class="no-print">
      <div class="msg info small">Tippe auf <strong>Drucken</strong>. Im Druckfenster kannst du auch <strong>„Als PDF sichern“</strong> bzw. über <strong>Teilen › In Dateien sichern</strong> ein PDF speichern.
        Klappt das Drucken in der Home-Bildschirm-App nicht, öffne die Seite in Safari.</div>
      <div class="btn-row"><button class="btn" id="d-print">🖨️ Drucken / PDF</button><button class="btn secondary" id="d-neu">🔀 Neu mischen</button></div>
      <div class="btn-row"><a class="btn secondary" href="${esc(location.href)}" target="_blank" rel="noopener">In Safari öffnen</a></div>
    </div>
    <div class="druck">
      <h2>Vokabeltest</h2>
      <p>${esc(titel)}</p>
      <p class="kopfzeile">Name: ______________________ &nbsp; Datum: ____________ &nbsp; Punkte: ____ / ${fragen.length}</p>
      <p class="small">Übersetze. ${fach.formenTyp === 'latein' ? 'Bei Nomen Genitiv und Genus, bei Verben die Stammformen angeben.' : ''}</p>
      <table class="testtab">${fragen.map((q, i) => zeile(q, i, false)).join('')}</table>
      <div class="seitenumbruch"></div>
      <h2>Lösungen</h2>
      <p>${esc(titel)}</p>
      <table class="testtab">${fragen.map((q, i) => zeile(q, i, true)).join('')}</table>
    </div>`;
  return {
    title: 'Test drucken', back: 'history', html,
    bind(root) {
      $('#d-print', root).onclick = () => window.print();
      $('#d-neu', root).onclick = () => ctx.rerender();
    }
  };
}

// ================= Erfolge =================
export async function erfolgeView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const b = await holeBelohnung(ctx.profil.id);
  const stat = await L.kastenStatistik(ctx.profil.id, await L.profilUnitIds(ctx.profil));
  const hat = new Map(b.abzeichen.map((a) => [a.id, a]));
  const GV = await import('./gutschein-views.js');
  const gz = await GV.gutscheinZahlen(ctx.profil.id);
  const gsHtml = gz.gesamt ? `<a class="card list-item" href="#/gutscheine" style="margin:12px 0">
      <span class="mehr-icon" aria-hidden="true">🎟️</span><span class="grow"><span class="vok-wort">Meine Gutscheine</span><br>
      <span class="vok-de">${GV.gutscheinLinkText(gz)}</span></span>${gz.bereit ? `<span class="badge ok">${gz.bereit}</span>` : ''}<span class="chev" aria-hidden="true">›</span></a>` : '';
  const html = `
    <div class="grid">
      <div class="card stat"><div class="big">${E('punkt')}</div><div class="zahl">${b.punkte}</div><div class="muted small">Punkte</div></div>
      <div class="card stat"><div class="big">🔥</div><div class="zahl">${serieJetzt(b)}</div><div class="muted small">Tage am Stück (Rekord ${b.serie.rekord})</div></div>
      <div class="card stat"><div class="big">🧠</div><div class="zahl">${stat.sicher}</div><div class="muted small">Vokabeln sicher</div></div>
      <div class="card stat"><div class="big">🏅</div><div class="zahl">${b.abzeichen.length}/${ABZEICHEN.length}</div><div class="muted small">Abzeichen</div></div>
    </div>
    ${gsHtml}
    <h2 data-h="3">Abzeichen</h2>
    <div class="abzeichen">${ABZEICHEN.map((a) => `<div class="card ${hat.has(a.id) ? '' : 'gesperrt'}">
      <div class="big">${a.icon}</div><strong>${esc(a.name)}</strong><div class="small muted">${esc(a.text)}</div>
      ${hat.has(a.id) ? `<div class="small" style="color:var(--ok)">✓ ${datum(hat.get(a.id).erhaltenAm)}</div>` : ''}</div>`).join('')}</div>`;
  return {
    title: 'Meine Erfolge', back: 'home', html,
  };
}

// ================= Eltern-Ansicht =================
let elternOffen = false;
/** Beim Verlassen der Eltern-Ansicht wieder sperren (sonst bliebe sie für das Kind offen) */
export function elternSperren() { elternOffen = false; }

async function hash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function elternView(_p, ctx) {
  const pinRec = await db.getMeta('elternPin');
  if (!elternOffen) {
    const html = pinRec ? `
      <div class="card" style="text-align:center"><div class="big" style="font-size:48px">🔒</div>
        <p>Eltern-Bereich. Bitte PIN eingeben.</p>
        <input id="el-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" style="text-align:center;font-size:28px;letter-spacing:8px">
        <button class="btn block" id="el-ok" style="margin-top:12px">Öffnen</button>
        <p class="muted small">PIN vergessen? Unter Sichern & Abgleichen › Gefahrenzone alles löschen und neu einrichten – oder eine Sicherungsdatei laden.</p></div>
      <p class="small" style="text-align:center"><a href="#/datenschutz">🔒 Datenschutz & Sicherheit</a></p>`
      : `<div class="card"><h2 data-h="3" style="margin-top:0">Eltern-PIN festlegen</h2>
        <p>Mit der PIN schützt du die Eltern-Ansicht. Kinder sehen sie dann nicht ohne dich.</p>
        <input id="el-neu" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="4–8 Ziffern">
        <input id="el-neu2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="PIN wiederholen" style="margin-top:8px">
        <button class="btn block" id="el-set" style="margin-top:12px">PIN speichern</button></div>
      <div class="msg info small">Bevor Sie Profile, KI-Anbindung oder Cloud-Abgleich einrichten: <a href="#/datenschutz">Was passiert mit den Daten? – Datenschutz & Sicherheit lesen ›</a></div>`;
    return {
      title: 'Eltern', back: 'home', html,
      bind(root) {
        const ok = $('#el-ok', root);
        if (ok) {
          const tryOpen = async () => {
            if ((await hash($('#el-pin', root).value, pinRec.salt)) === pinRec.hash) { elternOffen = true; ctx.rerender(); }
            else { toast('Falsche PIN.'); $('#el-pin', root).value = ''; }
          };
          ok.onclick = tryOpen;
          $('#el-pin', root).onkeydown = (e) => { if (e.key === 'Enter') tryOpen(); };
          setTimeout(() => $('#el-pin', root)?.focus(), 50);
        } else {
          $('#el-set', root).onclick = async () => {
            const a = $('#el-neu', root).value, b = $('#el-neu2', root).value;
            if (!/^\d{4,8}$/.test(a)) { toast('Bitte 4 bis 8 Ziffern.'); return; }
            if (a !== b) { toast('Die beiden PINs sind verschieden.'); return; }
            const salt = uid('s');
            await db.setMeta('elternPin', { salt, hash: await hash(a, salt) });
            elternOffen = true; toast('PIN gespeichert.'); ctx.rerender();
          };
        }
      }
    };
  }

  const profile = await db.all('profile');
  const tage = [...Array(7)].map((_, i) => L.plusTage(L.heute(), i - 6));
  const karten = await Promise.all(profile.map(async (p) => {
    const [b, stat, ev, tests, termine] = await Promise.all([
      holeBelohnung(p.id), L.profilUnitIds(p).then((ids) => L.kastenStatistik(p.id, ids)), db.byIndex('ereignisse', 'profilId', p.id),
      db.byIndex('tests', 'profilId', p.id), db.byIndex('termine', 'profilId', p.id)
    ]);
    const proTag = new Map(tage.map((t) => [t, 0]));
    ev.forEach((e) => { const t = L.isoTag(e.zeitpunkt); if (proTag.has(t)) proTag.set(t, proTag.get(t) + 1); });
    const max = Math.max(1, ...proTag.values());
    // ältere Antworten sind zusammengefasst (b.archiv), neuere einzeln gespeichert
    const ar = b.archiv || { antworten: 0, richtig: 0, falschJeVokabel: {}, letzte: '' };
    const letzte = ev.reduce((m, e) => (e.zeitpunkt > m ? e.zeitpunkt : m), ar.letzte || '');
    const anzahl = ev.length + ar.antworten;
    const quote = anzahl ? Math.round((ev.filter((e) => e.korrekt).length + ar.richtig) / anzahl * 100) : 0;
    const falschZaehl = new Map(Object.entries(ar.falschJeVokabel || {}));
    ev.filter((e) => !e.korrekt && e.vokabelId).forEach((e) => falschZaehl.set(e.vokabelId, (falschZaehl.get(e.vokabelId) || 0) + 1));
    const schwerIds = [...falschZaehl].sort((a, c) => c[1] - a[1]).slice(0, 5);
    const schwer = (await Promise.all(schwerIds.map(([id, n]) => db.get('vokabeln', id).then((v) => v && { v, n })))).filter(Boolean);
    const kommend = termine.filter((t) => t.datum >= L.heute()).sort((a, c) => a.datum.localeCompare(c.datum));
    tests.sort((a, c) => c.zeitpunkt.localeCompare(a.zeitpunkt));
    return `<div class="card">
      <h2 data-h="3" style="margin-top:0">${avatarHtml(p.avatar, 22)} ${esc(p.name)}</h2>
      <p class="small">Zuletzt aktiv: <strong>${letzte ? datum(letzte) : 'noch nie'}</strong> · Serie: <strong>${plural(serieJetzt(b), 'Tag', 'Tage')}</strong> (Rekord ${b.serie.rekord}) · ⭐ ${b.punkte}</p>
      <h3 data-h="4" class="muted small">ANTWORTEN DER LETZTEN 7 TAGE</h3>
      <div class="woche">${tage.map((t) => `<div><span style="height:${Math.round(proTag.get(t) / max * 56) + 2}px"></span><small>${new Date(t + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' })}</small><b>${proTag.get(t)}</b></div>`).join('')}</div>
      <p class="small">Trefferquote insgesamt: <strong>${quote} %</strong> bei ${anzahl} Antworten</p>
      <h3 data-h="4" class="muted small">LERNSTAND (${stat.gesamt} VOKABELN)</h3>
      <div class="kasten">${stat.zaehl.map((n, i) => `<div><span style="height:${stat.gesamt ? Math.max(4, n / stat.gesamt * 60) : 4}px"></span><small>${i ? 'K' + i : 'neu'}</small><b>${n}</b></div>`).join('')}</div>
      <p class="small muted">${stat.sicher} sicher (Kasten 4–5), ${stat.zaehl[0]} noch nie geübt</p>
      ${tests.length ? `<h3 data-h="4" class="muted small">TESTS</h3><ul class="small">${tests.slice(0, 5).map((t) => `<li>${datum(t.zeitpunkt)}: <strong>${t.prozent} %</strong> (${esc(t.einschaetzung)})</li>`).join('')}</ul>` : ''}
      ${kommend.length ? `<h3 data-h="4" class="muted small">ANSTEHEND</h3><ul class="small">${kommend.map((t) => `<li>${esc(t.titel)} am ${esc(L.datumLang(t.datum))}</li>`).join('')}</ul>` : ''}
      ${schwer.length ? `<h3 data-h="4" class="muted small">SCHWIERIGSTE WÖRTER</h3><ul class="small">${schwer.map((s) => `<li>${esc(s.v.wort)} – ${esc(s.v.bedeutungen[0])} (${s.n}× falsch)</li>`).join('')}</ul>` : ''}
    </div>`;
  }));
  const G = await import('./gutscheine.js');
  for (const p of profile) await G.pruefe(p.id).catch(() => []);   // schon Erreichtes sofort freischalten
  const gsDaten = await Promise.all(profile.map(async (p) => ({ p, ...(await G.daten(p.id)) })));
  const gsListe = gsDaten.map(({ p, b, tests }) => {
    const offen = b.freigeschaltet.filter((f) => !f.eingeloestAm);
    const aktive = b.gutscheine.filter((g) => !g.erledigt);
    const eingeloest = b.freigeschaltet.filter((f) => f.eingeloestAm).sort((x, y) => y.eingeloestAm.localeCompare(x.eingeloestAm));
    if (!offen.length && !aktive.length && !eingeloest.length) return '';
    return `<h3 data-h="4" style="margin:14px 0 6px">${avatarHtml(p.avatar, 20)} ${esc(p.name)}</h3>
      ${offen.map((f) => G.gutscheinHtml(f, `<div class="small muted">freigeschaltet am ${datum(f.am)}</div><button class="btn ok gs-knopf" data-gs-ein="${esc(p.id)}|${esc(f.id)}">✓ Als eingelöst markieren</button>`)).join('')}
      ${aktive.map((g) => `<div class="gs-mit-weg">${G.fortschrittHtml(g, b, tests)}<button class="btn danger klein-weg" data-gs-weg="${esc(p.id)}|${esc(g.id)}" aria-label="Gutschein löschen">🗑️</button></div>`).join('')}
      ${eingeloest.length ? `<details class="anbieter"><summary>Schon eingelöst (${eingeloest.length})</summary><ul class="small">
        ${eingeloest.map((f) => `<li>${esc(f.emoji || '🎁')} ${esc(f.text)} – freigeschaltet ${datum(f.am)}, eingelöst ${datum(f.eingeloestAm)}</li>`).join('')}</ul></details>` : ''}`;
  }).join('');
  const gsKarte = `<div class="card" id="gs-karte">
      <h2 data-h="3" style="margin-top:0">🎟️ Gutscheine</h2>
      <p class="small">Eigene Belohnungen mit eigenem Text, z. B. „Cheeseburger bei McDonald's“ oder „15 Minuten extra Gaming“. Dein Kind schaltet sie durch Lernen frei, sieht sie auf der Startseite unter „Meine Gutscheine“ und bekommt am Ende der Übung eine große Einblendung. Als eingelöst markieren können Sie hier – oder Ihr Kind selbst.</p>
      ${gsListe || '<p class="muted small">Noch keine Gutscheine angelegt.</p>'}
      <div id="gs-form"></div>
      <button class="btn soft block" id="gs-neu" style="margin-top:12px">➕ Neuen Gutschein anlegen</button>
    </div>`;
  const K = await import('./ki.js');
  const ki = await K.einstellungen();
  const reihe = K.reihenfolge(ki);
  const kontoZeile = (id) => {
    const k = ki.konten[id], a = K.ANBIETER[id];
    const ok = k && k.schluessel && k.modell;
    return `<div class="ki-konto">
      <div class="ki-konto-kopf"><strong>${esc(a.name)}</strong>${ok && ki.haupt === id ? '<span class="badge ok">Hauptanbieter</span>' : ''}${!ok ? '<span class="muted small">nicht eingerichtet</span>' : ''}</div>
      ${ok ? `<div class="small"><span class="muted">Hauptmodell:</span> <code>${esc(k.modell)}</code></div>
        <div class="small"><span class="muted">Ausweichmodelle:</span> ${k.ausweich?.length ? k.ausweich.map((m) => `<code>${esc(m)}</code>`).join(' ') : 'keine'}</div>` : ''}
      <div class="ki-konto-knoepfe">
        ${ok && ki.haupt !== id ? `<button class="btn secondary" data-haupt="${id}">Als Hauptanbieter</button>` : ''}
        <button class="btn ${ok ? 'secondary' : 'soft'}" data-bearb="${id}">${ok ? 'Ändern' : 'Einrichten'}</button>
        ${ok ? `<button class="btn danger" data-weg="${id}">Entfernen</button>` : ''}
      </div>
    </div>`;
  };
  const html = `${karten.join('') || '<div class="card muted">Noch keine Profile.</div>'}
    ${profile.length ? gsKarte : ''}
    <div class="card" id="ki-karte">
      <h2 data-h="3" style="margin-top:0">🤖 KI-Anbindung <span class="badge">optional</span></h2>
      <p class="small">Mit eigenem, kostenlosem Zugangsschlüssel wertet die App Fotos der Vokabelseite <strong>selbst</strong> aus und prüft eigene Sätze. Schlüssel bleiben nur auf diesem Gerät und kommen <strong>nicht</strong> in die Sicherungsdatei.</p>
      <p class="small"><strong>Tipp:</strong> Zwei oder drei Anbieter einrichten (z. B. Gemini, Groq und OpenRouter – alle kostenlos). Ist einer überlastet, nimmt die App automatisch den nächsten.</p>
      ${reihe.length ? `<div class="msg ok small">Reihenfolge: ${reihe.map((a) => esc(K.ANBIETER[a].name)).join(' → ')}</div>` : ''}
      <div>${Object.keys(K.ANBIETER).map(kontoZeile).join('')}</div>
      <div id="ki-bearb"></div>
      ${reihe.length ? '<div class="btn-row"><button class="btn secondary" id="ki-test">Verbindung testen</button></div><div id="ki-test-erg"></div>' : ''}
      <p class="small muted">Gratis-Angebote ändern sich häufig. Der Weg über Kopieren und Einfügen bleibt immer möglich.</p>
    </div>
    <a class="card list-item" href="#/datenschutz" style="margin:12px 0"><span class="mehr-icon" aria-hidden="true">🔒</span><span class="grow"><span class="vok-wort">Datenschutz & Sicherheit</span><br>
      <span class="vok-de">Was die App speichert und wohin Daten gehen</span></span><span class="chev" aria-hidden="true">›</span></a>
    <div class="btn-row"><button class="btn secondary" id="el-zu">🔒 Schließen</button><button class="btn secondary" id="el-pinneu">PIN ändern</button></div>`;
  return {
    title: 'Eltern-Ansicht', back: 'home', html,
    bind(root) {
      $('#el-zu', root).onclick = () => { elternOffen = false; ctx.go('home'); };
      // ----- Gutscheine -----
      $$('[data-gs-ein]', root).forEach((b) => b.onclick = async () => { const [pid, fid] = b.dataset.gsEin.split('|'); await G.einloesen(pid, fid); toast('Als eingelöst markiert ✓'); ctx.rerender(); });
      $$('[data-gs-weg]', root).forEach((b) => b.onclick = async () => {
        if (!confirm('Diesen Gutschein löschen? Schon freigeschaltete Gutscheine bleiben erhalten.')) return;
        const [pid, gid] = b.dataset.gsWeg.split('|'); await G.loesche(pid, gid); toast('Gelöscht.'); ctx.rerender();
      });
      const gsNeu = $('#gs-neu', root);
      if (gsNeu) gsNeu.onclick = () => {
        gsNeu.hidden = true;
        const vorschlag = { tests: 10, uebungen: 20, lerntage: 10, serie: 7, punkte: 1000 };
        $('#gs-form', root).innerHTML = `<div class="card" style="border:2px solid var(--primary);margin-top:12px">
          <label for="gs-text" style="margin-top:0">Was gibt es?</label>
          <input id="gs-text" type="text" maxlength="60" placeholder="z. B. Cheeseburger bei McDonald's">
          <label>Symbol</label>
          <div class="emoji-pick" id="gs-emojis">${G.EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === '🎁' ? 'on' : ''}" aria-label="Symbol ${e}">${e}</button>`).join('')}</div>
          <label for="gs-fuer">Für wen?</label>
          <select id="gs-fuer">${profile.length > 1 ? '<option value="">alle Kinder (jedes für sich)</option>' : ''}${profile.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
          <label for="gs-art">Wofür?</label>
          <select id="gs-art">${Object.entries(G.ARTEN).map(([k, a]) => `<option value="${k}">${esc(a.name)}</option>`).join('')}</select>
          <div class="field-row">
            <div><label for="gs-anzahl">Wie viele?</label><input id="gs-anzahl" type="number" inputmode="numeric" min="1" max="100000" value="10"></div>
            <div id="gs-min-feld"><label for="gs-min">Bestanden ab</label><select id="gs-min"><option value="75">75 %</option><option value="90">90 %</option><option value="100">100 %</option></select></div>
          </div>
          <label class="switch" style="margin-top:12px"><input type="checkbox" id="gs-wdh" checked> <span id="gs-wdh-text">Immer wieder – jedes Mal, wenn das Ziel erneut erreicht ist</span></label>
          <p class="muted small">Gezählt wird ab jetzt. Ein Test zählt höchstens einmal pro Tag und Unit – so lohnt es sich nicht, denselben leichten Test zehnmal zu machen.</p>
          <div class="btn-row"><button class="btn" id="gs-save">Gutschein anlegen</button><button class="btn secondary" id="gs-ab">Abbrechen</button></div></div>`;
        let emoji = '🎁';
        $$('#gs-emojis [data-e]', root).forEach((b) => b.onclick = () => { emoji = b.dataset.e; $$('#gs-emojis [data-e]', root).forEach((x) => x.classList.toggle('on', x === b)); });
        const artWechsel = () => {
          const art = $('#gs-art', root).value;
          $('#gs-min-feld', root).hidden = art !== 'tests';
          $('#gs-anzahl', root).value = vorschlag[art];
          const nur1 = G.ARTEN[art].nurEinmalig;
          $('#gs-wdh', root).disabled = nur1; if (nur1) $('#gs-wdh', root).checked = false;
        };
        $('#gs-art', root).onchange = artWechsel;
        artWechsel();
        $('#gs-ab', root).onclick = () => { $('#gs-form', root).innerHTML = ''; gsNeu.hidden = false; };
        $('#gs-save', root).onclick = async () => {
          const text = $('#gs-text', root).value.trim();
          const anzahl = Math.round(+$('#gs-anzahl', root).value);
          if (!text) { toast('Bitte eintragen, was es gibt.'); $('#gs-text', root).focus(); return; }
          if (!(anzahl >= 1)) { toast('Bitte eine Anzahl ab 1 eingeben.'); return; }
          const fuer = $('#gs-fuer', root).value;
          await G.erstelle(fuer ? [fuer] : profile.map((p) => p.id), {
            text, emoji, art: $('#gs-art', root).value, anzahl, minProzent: +$('#gs-min', root).value, wiederholen: $('#gs-wdh', root).checked
          });
          toast('Gutschein angelegt 🎟️');
          ctx.rerender();
        };
        $('#gs-text', root).focus();
      };
      // ----- KI-Anbindung -----
      $$('[data-haupt]', root).forEach((b) => b.onclick = async () => { await K.setzeHaupt(b.dataset.haupt); toast('Hauptanbieter geändert.'); ctx.rerender(); });
      $$('[data-weg]', root).forEach((b) => b.onclick = async () => {
        if (!confirm(`${K.ANBIETER[b.dataset.weg].name} und den Schlüssel von diesem Gerät entfernen?`)) return;
        await K.entferneKonto(b.dataset.weg); toast('Entfernt.'); ctx.rerender();
      });
      $$('[data-bearb]', root).forEach((b) => b.onclick = () => {
        const anbieter = b.dataset.bearb, a = K.ANBIETER[anbieter], konto = ki.konten[anbieter] || {};
        const box = $('#ki-bearb', root);
        box.innerHTML = `<div class="card" style="border:2px solid var(--primary)">
          <h3 data-h="4" style="margin:0 0 6px">${esc(a.name)} einrichten</h3>
          <p class="small muted">${esc(a.daten)}</p>
          <p class="small"><a href="${a.schluesselUrl}" target="_blank" rel="noopener">→ Hier kostenlos einen Schlüssel erzeugen</a> (Konto für Erwachsene)</p>
          <label for="ki-key">Zugangsschlüssel (API-Key)</label>
          <input id="ki-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Schlüssel einfügen" value="${esc(konto.schluessel || '')}">
          <div class="btn-row"><button class="btn" id="ki-laden">Prüfen & Modelle laden</button></div>
          <div id="ki-modelle"></div></div>`;
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#ki-laden', root).onclick = async () => {
          const key = $('#ki-key', root).value.trim();
          if (!key) { toast('Bitte zuerst den Schlüssel einfügen.'); return; }
          const mb = $('#ki-modelle', root);
          mb.innerHTML = '<p class="muted small"><span class="spinner"></span> Prüfe Schlüssel …</p>';
          try {
            const liste = await K.modelle(anbieter, key);
            if (!liste.length) { mb.innerHTML = '<div class="msg warn small">Schlüssel gültig, aber keine passenden Modelle gefunden.</div>'; return; }
            const vor = liste.some((m) => m.id === konto.modell) ? konto.modell : K.vorschlag(anbieter, liste);
            // Feinauswahl der Ausweichmodelle per Häkchen. Vorauswahl: bisherige Wahl (gleicher Schlüssel) oder Empfehlung.
            let angehakt = new Set(konto.schluessel === key && konto.ausweich?.length ? konto.ausweich : K.ausweichListe(anbieter, liste, vor));
            const zeigeAusweich = () => {
              const g = $('#ki-modell', root).value;
              angehakt.delete(g);
              const empf = K.ausweichListe(anbieter, liste, g);
              // Reihenfolge = Reihenfolge der Versuche: angehakte zuerst (in bisheriger Reihenfolge), dann Empfehlungen, dann der Rest
              const reihenfolge = [...new Set([...[...angehakt].filter((id) => id !== g), ...empf, ...liste.map((m) => m.id)])].filter((id) => id !== g);
              const nach = new Map(liste.map((m) => [m.id, m]));
              $('#ki-aus', root).innerHTML = `
                <div class="check-head" style="margin-top:12px"><strong class="grow">Ausweichmodelle bei Überlastung</strong>
                  <button class="btn secondary" id="ki-aus-empf" style="min-height:40px;padding:4px 12px;font-size:14px">Empfehlung</button>
                  <button class="btn secondary" id="ki-aus-keine" style="min-height:40px;padding:4px 12px;font-size:14px">keine</button></div>
                <p class="small muted" style="margin:4px 0 6px">Die App probiert die angehakten Modelle der Reihe nach (von oben nach unten). Je mehr Modelle, desto länger kann es bei Überlastung dauern – etwa 3–6 s je Modell.</p>
                <div class="ki-aus-liste">${reihenfolge.map((id) => { const m = nach.get(id); return `<label class="switch ki-aus-zeile">
                  <input type="checkbox" value="${esc(id)}" ${angehakt.has(id) ? 'checked' : ''}>
                  <span class="grow">${esc(m.name)}${m.name !== id ? ` <span class="muted small">${esc(id)}</span>` : ''}</span>
                  ${empf.includes(id) ? '<span class="badge ok">empfohlen</span>' : ''}${/preview|exp/i.test(id) ? '<span class="badge warn">Vorschau</span>' : ''}${m.bild === false ? '<span class="badge err">ohne Bild</span>' : ''}</label>`; }).join('')}</div>
                <p class="small" id="ki-aus-zahl"></p>`;
              const zaehle = () => { $('#ki-aus-zahl', root).textContent = `${angehakt.size} Ausweichmodell${angehakt.size === 1 ? '' : 'e'} ausgewählt.`; };
              $$('#ki-aus input[type=checkbox]', root).forEach((c) => c.onchange = () => { c.checked ? angehakt.add(c.value) : angehakt.delete(c.value); zaehle(); });
              $('#ki-aus-empf', root).onclick = () => { angehakt = new Set(empf); zeigeAusweich(); };
              $('#ki-aus-keine', root).onclick = () => { angehakt = new Set(); zeigeAusweich(); };
              zaehle();
            };
            mb.innerHTML = `<div class="msg ok small">✓ Schlüssel gültig. ${liste.length} Modelle gefunden.</div>
              <label for="ki-modell">Hauptmodell (muss Fotos lesen können)</label>
              <select id="ki-modell">${liste.map((m) => `<option value="${esc(m.id)}" ${m.id === vor ? 'selected' : ''}>${esc(m.name)}${m.bild === false ? ' (ohne Bild)' : ''}</option>`).join('')}</select>
              <div id="ki-aus"></div>
              <div class="btn-row"><button class="btn" id="ki-speichern">Speichern</button></div>`;
            zeigeAusweich();
            $('#ki-modell', root).onchange = zeigeAusweich;
            $('#ki-speichern', root).onclick = async () => {
              const gewaehlt = $('#ki-modell', root).value;
              // Reihenfolge wie angezeigt
              const ausweich = $$('#ki-aus input[type=checkbox]', root).filter((c) => c.checked && c.value !== gewaehlt).map((c) => c.value);
              await K.speichereKonto(anbieter, { schluessel: key, modell: gewaehlt, ausweich });
              toast(`${a.name} gespeichert ✓`);
              ctx.rerender();
            };
          } catch (e) { mb.innerHTML = `<div class="msg err small">${esc(e.message).replace(/\n/g, '<br>')}</div>`; }
        };
      });
      const t = $('#ki-test', root);
      if (t) t.onclick = async () => {
        const erg = $('#ki-test-erg', root);
        t.disabled = true; t.textContent = 'Teste …'; erg.innerHTML = '';
        const verlauf = [];
        try {
          const a = await K.teste((m) => { t.textContent = m; verlauf.push(m); });
          erg.innerHTML = `<div class="msg ok small">✓ Verbindung klappt (Antwort: ${esc(a)}).${verlauf.length ? '<br>' + esc(verlauf[verlauf.length - 1]) : ''}</div>`;
        } catch (e) { erg.innerHTML = `<div class="msg err small">${esc(e.message).replace(/\n/g, '<br>')}</div>`; }
        t.disabled = false; t.textContent = 'Verbindung testen';
      };
      $('#el-pinneu', root).onclick = async () => { await db.put('meta', { key: 'elternPin', value: null }); await db.del('meta', 'elternPin'); elternOffen = false; ctx.rerender(); };
    }
  };
}
