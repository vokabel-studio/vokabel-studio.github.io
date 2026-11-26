// Einlese-Assistent: Auswahl → Prompt → Einfügen → Kontrolle → Fertig
import * as db from './db.js';
import { FAECHER, WORTARTEN, WORTART_NAMEN, fach as getFach, lehrwerkName } from './faecher.js';
import { esc, $, $$, toast, copyText, plural } from './util.js';
import { erzeugePrompt, FOLGE_PROMPT, korrekturPrompt } from './prompt.js';
import { parseAntwort, pruefe, markiereDoppelte, findeUnit, speichere, vokabelProblemListe } from './import.js';

let W = null;   // Zustand des Assistenten (bleibt beim Hin- und Herwechseln erhalten)

// Zusatz zum Prompt, wenn statt eines Fotos der per Texterkennung (Google Lens / Live Text) kopierte Text kommt
const TEXT_STATT_FOTO = `

WICHTIG – ES GIBT KEIN FOTO: Statt eines Fotos bekommst du unten den Text der Vokabelseite, den eine automatische Texterkennung (z. B. Google Lens oder Live Text) kopiert hat. Beachte:
- Spalten können durcheinandergeraten sein (z. B. erst alle Fremdwörter, dann alle deutschen Bedeutungen, dann die Beispielsätze). Ordne Wort, Lautschrift, Bedeutung und Beispiel sorgfältig einander zu. Halte dich an die Reihenfolge, in der die Wörter im Text stehen.
- Lautschrift, Längenzeichen und Sonderzeichen sind oft falsch erkannt. Gib bei Englisch die korrekte britische Lautschrift an. Wenn du dir bei einer Zuordnung oder einem Wort nicht sicher bist, setze "unsicher": true mit kurzem Grund.
- Seitenzahlen, Kopfzeilen und Übungsanweisungen gehören nicht in die Vokabelliste.
- Alles andere (Aufbau, Felder, nur JSON) genau wie oben beschrieben.

--- KOPIERTER TEXT DER VOKABELSEITE ---
`;

function neu(query, profil) {
  return {
    key: JSON.stringify(query), schritt: 'auswahl',
    fachId: profil.fachIds?.[0] || 'englisch', lehrwerkId: query.lw || '', unitId: query.unit || '',
    unitNummer: '', unitTitel: '', folge: false,
    rohtext: '', parseFehler: [], warnungen: [], daten: null, ergebnis: null
  };
}

const SCHRITTE = ['auswahl', 'prompt', 'einfuegen', 'kontrolle', 'fertig'];
const stepsBar = () => `<div class="steps" aria-hidden="true">${SCHRITTE.map((s, i) => `<span class="${i <= SCHRITTE.indexOf(W.schritt) ? 'on' : ''}"></span>`).join('')}</div>`;

export async function importView({ query }, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const key = JSON.stringify(query);
  if (!W || W.key !== key || W.schritt === 'fertig' && !W.halten) W = neu(query, ctx.profil);
  W.halten = false;

  if (W.lehrwerkId) {
    const lw = await db.get('lehrwerke', W.lehrwerkId);
    if (lw) W.fachId = lw.fachId; else W.lehrwerkId = '';
  }
  if (W.unitId) {
    const u = await db.get('units', W.unitId);
    if (u) { W.unitNummer = u.nummer; W.unitTitel = u.titel; W.lehrwerkId = u.lehrwerkId; } else W.unitId = '';
  }
  const views = { auswahl, prompt: promptSchritt, einfuegen, kontrolle, fertig };
  const r = await views[W.schritt](ctx);
  return { title: 'Vokabelseite einlesen', back: 'home', ...r, html: stepsBar() + r.html };
}

const weiter = (ctx, schritt) => { W.schritt = schritt; W.halten = true; ctx.rerender(); };

// ---------- 1. Auswahl ----------
async function auswahl(ctx) {
  const faecher = FAECHER;   // immer alle Fächer anbieten – fehlende werden beim Speichern ins Profil übernommen
  const lehrwerke = (await db.byIndex('lehrwerke', 'fachId', W.fachId)).sort((a, b) => lehrwerkName(a).localeCompare(lehrwerkName(b)));
  if (!lehrwerke.find((l) => l.id === W.lehrwerkId)) W.lehrwerkId = lehrwerke[0]?.id || '';
  const units = W.lehrwerkId ? (await db.byIndex('units', 'lehrwerkId', W.lehrwerkId)).sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true })) : [];
  const f = getFach(W.fachId);
  const unitWort = f.formenTyp === 'latein' ? 'Lektion' : 'Unit';
  const html = `
    <h2 style="margin-top:0">1. Was liest du ein?</h2>
    <label>Fach</label>
    <div class="btn-row">${faecher.map((x) => `<button class="btn ${x.id === W.fachId ? '' : 'secondary'}" data-fach="${x.id}">${x.icon} ${esc(x.name)}</button>`).join('')}</div>
    <label for="w-lw">Buch</label>
    <select id="w-lw">
      ${lehrwerke.map((l) => `<option value="${esc(l.id)}" ${l.id === W.lehrwerkId ? 'selected' : ''}>${esc(lehrwerkName(l))}${l.klasse ? ' (Kl. ' + esc(l.klasse) + ')' : ''}</option>`).join('')}
      <option value="__neu">➕ Anderes Buch hinzufügen …</option>
    </select>
    <label for="w-unit">${unitWort}</label>
    <select id="w-unit">
      <option value="">➕ Neue ${unitWort}</option>
      ${units.map((u) => `<option value="${esc(u.id)}" ${u.id === W.unitId ? 'selected' : ''}>${unitWort} ${esc(u.nummer)}${u.titel ? ' – ' + esc(u.titel) : ''}</option>`).join('')}
    </select>
    <div id="w-neu" ${W.unitId ? 'hidden' : ''}>
      <div class="field-row">
        <div><label for="w-nr">Nummer</label><input id="w-nr" type="text" inputmode="text" value="${esc(W.unitId ? '' : W.unitNummer)}" placeholder="z. B. 2"></div>
        <div><label for="w-titel">Titel (freiwillig)</label><input id="w-titel" type="text" value="${esc(W.unitId ? '' : W.unitTitel)}" placeholder="z. B. Welcome to Snowdonia"></div>
      </div>
    </div>
    ${W.unitId ? '<p class="msg info small">Die neuen Vokabeln werden an diese Unit angehängt. Doppelte erkennt die App.</p>' : ''}
    <div class="btn-row"><button class="btn block" id="w-weiter">Weiter ›</button></div>`;
  return {
    html,
    bind(root) {
      $$('[data-fach]', root).forEach((b) => b.onclick = () => { W.fachId = b.dataset.fach; W.lehrwerkId = ''; W.unitId = ''; W.halten = true; ctx.rerender(); });
      $('#w-lw', root).onchange = (e) => {
        if (e.target.value === '__neu') { ctx.go(`lehrwerk-neu/${W.fachId}`); return; }
        W.lehrwerkId = e.target.value; W.unitId = ''; W.halten = true; ctx.rerender();
      };
      $('#w-unit', root).onchange = (e) => { W.unitId = e.target.value; if (!W.unitId) { W.unitNummer = ''; W.unitTitel = ''; } W.halten = true; ctx.rerender(); };
      $('#w-weiter', root).onclick = async () => {
        if (!W.lehrwerkId) { toast('Bitte ein Buch wählen.'); return; }
        if (!W.unitId) {
          W.unitNummer = $('#w-nr', root).value.trim();
          W.unitTitel = $('#w-titel', root).value.trim();
          if (!W.unitNummer) { toast(`Bitte die Nummer der ${unitWort} eingeben.`); $('#w-nr', root).focus(); return; }
          const vorhanden = await findeUnit(W.lehrwerkId, W.unitNummer);
          if (vorhanden) { W.unitId = vorhanden.id; toast(`${unitWort} ${W.unitNummer} gibt es schon – ich hänge die Vokabeln an.`); }
        }
        weiter(ctx, 'prompt');
      };
    }
  };
}

// ---------- 2. Prompt ----------
async function promptSchritt(ctx) {
  const lw = await db.get('lehrwerke', W.lehrwerkId);
  const text = erzeugePrompt({ fachId: W.fachId, lehrwerk: lw, unitNummer: W.unitNummer, unitTitel: W.unitTitel });
  const K = await import('./ki.js');
  const kiAn = await K.aktiv();
  const kiName = kiAn ? await K.anzeigeName() : '';
  const html = `
    ${kiAn ? `<h2 style="margin-top:0">2. Foto auswerten</h2>
    <div class="card ki-karte">
      <p style="margin-top:0">Die KI (<strong>${esc(kiName)}</strong>) liest das Foto und füllt alles automatisch aus. Mehrere Fotos derselben Unit gehen auch.</p>
      <div class="btn-row">
        <label class="btn" for="w-kamera">📷 Foto aufnehmen</label>
        <label class="btn secondary" for="w-fotos">🖼️ Fotos auswählen</label>
      </div>
      <input id="w-kamera" type="file" accept="image/*" capture="environment" hidden>
      <input id="w-fotos" type="file" accept="image/*" multiple hidden>
      <p class="muted small">Tipp: gerade von oben, gut beleuchtet, ganze Seite drauf. Bei sehr vollen Seiten zwei Fotos (oben/unten).</p>
      <details class="text-weg"${W.lensText ? ' open' : ''}><summary><span><strong>📋 Text statt Foto</strong> <span class="muted small">(Google Lens / Live Text)</span></span></summary>
        <ol class="small" style="padding-left:20px">
          <li>Foto der Vokabelseite machen oder in der Galerie öffnen.</li>
          <li><strong>Android:</strong> Google Lens › <strong>Text</strong> › <strong>Alles auswählen</strong> › Kopieren.<br>
            <strong>iPhone:</strong> unten rechts auf das Text-Symbol (Live Text) tippen › <strong>Alles kopieren</strong>.</li>
          <li>Hier einfügen und auf „Von der KI ordnen lassen“ tippen.</li>
        </ol>
        <textarea id="w-lens" placeholder="Kopierten Text der Vokabelseite hier einfügen …" style="min-height:140px;font-family:inherit;font-size:16px">${esc(W.lensText || '')}</textarea>
        <button class="btn block" id="w-lens-ok" style="margin-top:8px">🤖 Von der KI ordnen lassen</button>
        <p class="muted small">Vorteil: Text ist für die KI viel weniger Arbeit als ein Foto – das klappt meist auch, wenn die Bild-KI gerade überlastet ist. Lautschrift erkennt das Handy oft falsch; die KI ergänzt sie – bitte in der Kontrollansicht kurz prüfen.</p>
      </details>
      <div id="w-ki-status"></div>
    </div>
    <details class="card"><summary>Ohne KI: über ChatGPT/Gemini kopieren</summary>` : '<h2 style="margin-top:0">2. Chatbot fragen</h2>'}
    ${W.folge ? `<div class="card">
      <p><strong>Noch eine Seite derselben Unit?</strong> Wenn der Chat mit dem Chatbot noch offen ist, reicht dieser kurze Text plus das neue Foto:</p>
      <button class="btn block" id="w-copy-folge">📋 Kurztext kopieren</button>
      <p class="muted small">Neuer Chat? Dann den langen Text unten nehmen.</p></div>` : ''}
    <div class="card">
      <ol style="padding-left:22px;margin:0">
        <li>Tippe auf <strong>Text kopieren</strong>.</li>
        <li>Öffne ChatGPT oder Gemini und füge den Text ein.</li>
        <li>Hänge ein <strong>Foto der Vokabelseite</strong> an (📎 oder +) und schick es ab. <span class="muted">Geht auch ohne Foto: den mit Google Lens bzw. Live Text kopierten Text der Seite mit einfügen.</span></li>
        <li>Wenn die Antwort fertig ist: auf <strong>Kopieren</strong> unter dem Code-Block tippen und hierher zurückkommen.</li>
      </ol>
      <div class="btn-row"><button class="btn block" id="w-copy">📋 Text kopieren</button></div>
      <div class="btn-row">
        <a class="btn secondary" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT öffnen</a>
        <a class="btn secondary" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini öffnen</a>
      </div>
      <p class="muted small">Tipp: Foto gerade von oben, gut beleuchtet, ganze Seite drauf. Bei sehr vollen Seiten lieber zwei Fotos (oben/unten) nacheinander einlesen.</p>
      <details><summary>Text ansehen</summary><div class="prompt-box">${esc(text)}</div></details>
    </div>
    ${kiAn ? '</details>' : '<p class="muted small">Tipp: Mit einem kostenlosen KI-Schlüssel (Eltern › KI-Anbindung) liest die App das Foto selbst aus – ohne Kopieren.</p>'}
    <div class="btn-row">
      <button class="btn secondary" id="w-zurueck">‹ Zurück</button>
      <button class="btn ${kiAn ? 'secondary' : ''}" id="w-weiter">Antwort einfügen ›</button>
    </div>`;
  return {
    html,
    bind(root) {
      $('#w-copy', root).onclick = async () => toast((await copyText(text)) ? 'Kopiert! Jetzt im Chatbot einfügen.' : 'Kopieren hat nicht geklappt – bitte den Text unten markieren.');
      const f = $('#w-copy-folge', root);
      if (f) f.onclick = async () => toast((await copyText(FOLGE_PROMPT)) ? 'Kopiert!' : 'Kopieren hat nicht geklappt.');
      $('#w-zurueck', root).onclick = () => weiter(ctx, 'auswahl');
      $('#w-weiter', root).onclick = () => weiter(ctx, 'einfuegen');
      if (!kiAn) return;
      const status = $('#w-ki-status', root);
      // auftraege: Fotos (File) oder ein per Texterkennung kopierter Text ({ kopierterText })
      const auswerten = async (auftraege) => {
        if (!auftraege.length) return;
        const roh = [], daten = [];
        const knopf = $('#w-lens-ok', root);
        if (knopf) knopf.disabled = true;
        try {
          for (let i = 0; i < auftraege.length; i++) {
            const a = auftraege[i];
            const was = a.kopierterText ? 'Der Text' : auftraege.length > 1 ? `Foto ${i + 1} von ${auftraege.length}` : 'Das Foto';
            status.innerHTML = `<div class="msg info"><span class="spinner"></span> ${was} wird ausgewertet … (dauert meist 10–40 Sekunden)</div>`;
            const onStatus = (m) => { status.innerHTML = `<div class="msg info"><span class="spinner"></span> ${was}: ${esc(m)}</div>`; };
            const antwort = a.kopierterText
              ? await K.frage(text + TEXT_STATT_FOTO + a.kopierterText, { json: true, onStatus, timeoutMs: 90000 })
              : await K.frage(text, { bilder: [await K.bildVorbereiten(a)], json: true, onStatus });
            roh.push(antwort);
            const p1 = parseAntwort(antwort);
            if (p1.fehler.length) throw new Error(`${a.kopierterText ? 'Text' : `Foto ${i + 1}`}: ${p1.fehler[0]}`);
            daten.push(p1);
          }
        } catch (e) {
          status.innerHTML = `<div class="msg err"><strong>Das hat nicht geklappt.</strong><br>${esc(e.message).replace(/\n/g, '<br>')}</div>
            <p class="small">Du kannst es noch einmal versuchen oder unten den Weg über Kopieren nehmen.</p>`;
          if (roh.length) W.rohtext = roh.join('\n\n');
          if (knopf) knopf.disabled = false;
          return;
        }
        W.rohtext = roh.join('\n\n');
        status.innerHTML = '<div class="msg ok">✓ Ausgewertet. Prüfe die Daten …</div>';
        const zusammen = fuehreZusammen(daten.map((d) => d.data));
        const ok = await uebernehme(zusammen, daten.flatMap((d) => d.warnungen), (fehler, warn) => {
          status.innerHTML = meldungenHtml(fehler, warn);
        });
        if (ok) weiter(ctx, 'kontrolle');
      };
      $('#w-kamera', root).onchange = (e) => auswerten([...e.target.files]);
      $('#w-fotos', root).onchange = (e) => auswerten([...e.target.files]);
      const lens = $('#w-lens', root);
      lens.oninput = () => { W.lensText = lens.value; };
      $('#w-lens-ok', root).onclick = () => {
        const t = lens.value.trim();
        if (t.length < 20) { toast('Bitte zuerst den kopierten Text der Vokabelseite einfügen.'); lens.focus(); return; }
        auswerten([{ kopierterText: t }]);   // eigener Name: Fotos (File) haben selbst eine Methode .text()
      };
    }
  };
}

// Mehrere KI-Antworten (je Foto) zu einer zusammenführen
function fuehreZusammen(liste) {
  if (liste.length === 1) return liste[0];
  const basis = { ...liste[0], parts: [], lernsaetze: [], satzbau: [], hinweise: [], seiten: [] };
  const parts = new Map();
  for (const d of liste) {
    for (const p of d.parts || []) {
      const k = String(p.kennung || 'A').toLowerCase();
      if (!parts.has(k)) parts.set(k, { ...p, vokabeln: [] });
      parts.get(k).vokabeln.push(...(p.vokabeln || []));
    }
    basis.lernsaetze.push(...(d.lernsaetze || []));
    basis.satzbau.push(...(d.satzbau || []));
    basis.hinweise.push(...(d.hinweise || []));
    basis.seiten.push(...(d.seiten || []));
  }
  basis.parts = [...parts.values()];
  return basis;
}

// Gemeinsamer Weg nach dem Einlesen (KI oder Einfügen): prüfen, Doppelte markieren
async function uebernehme(data, vorWarnungen, zeigeProbleme) {
  const p2 = pruefe(data, { fachId: W.fachId, unitNummer: W.unitNummer });
  if (p2.fehler.length) { W.parseFehler = p2.fehler; zeigeProbleme(p2.fehler, [...vorWarnungen, ...p2.warnungen]); return false; }
  W.parseFehler = [];
  W.daten = p2.daten;
  W.warnungen = [...vorWarnungen, ...p2.warnungen];
  const unit = W.unitId ? await db.get('units', W.unitId) : await findeUnit(W.lehrwerkId, W.unitNummer);
  const doppelt = await markiereDoppelte(W.daten, unit);
  if (doppelt) W.warnungen.unshift(`${plural(doppelt, 'Vokabel ist', 'Vokabeln sind')} schon vorhanden und ${doppelt === 1 ? 'wird' : 'werden'} übersprungen (grau). Du kannst stattdessen „ersetzen“ wählen.`);
  return true;
}

// ---------- 3. Einfügen ----------
async function einfuegen(ctx) {
  const html = `
    <h2 style="margin-top:0">3. Antwort einfügen</h2>
    <label for="w-text">Antwort des Chatbots</label>
    <textarea id="w-text" placeholder="Hier lange tippen › Einfügen" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(W.rohtext)}</textarea>
    <div class="btn-row">
      ${navigator.clipboard?.readText ? '<button class="btn secondary" id="w-paste">📋 Aus Zwischenablage</button>' : ''}
      <label class="btn secondary" for="w-file">📄 Datei wählen</label>
      <input id="w-file" type="file" accept=".json,.txt,application/json,text/plain" hidden>
    </div>
    <div id="w-meldungen">${meldungenHtml(W.parseFehler, [])}</div>
    <div class="btn-row">
      <button class="btn secondary" id="w-zurueck">‹ Zurück</button>
      <button class="btn" id="w-pruefen">Prüfen ›</button>
    </div>`;
  return {
    html,
    bind(root) {
      const ta = $('#w-text', root);
      ta.oninput = () => { W.rohtext = ta.value; };
      const p = $('#w-paste', root);
      if (p) p.onclick = async () => {
        try { ta.value = W.rohtext = await navigator.clipboard.readText(); toast('Eingefügt.'); }
        catch { toast('Kein Zugriff auf die Zwischenablage. Lange ins Feld tippen › Einfügen.'); }
      };
      $('#w-file', root).onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = W.rohtext = await f.text(); } };
      $('#w-zurueck', root).onclick = () => weiter(ctx, 'prompt');
      $('#w-pruefen', root).onclick = async () => {
        W.rohtext = ta.value;
        const p1 = parseAntwort(W.rohtext);
        if (p1.fehler.length) { W.parseFehler = p1.fehler; zeigeFehler(root, p1.fehler, p1.warnungen); return; }
        const ok = await uebernehme(p1.data, p1.warnungen, (fehler, warn) => zeigeFehler(root, fehler, warn));
        if (ok) weiter(ctx, 'kontrolle');
      };
    }
  };
}

function zeigeFehler(root, fehler, warnungen) {
  $('#w-meldungen', root).innerHTML = meldungenHtml(fehler, warnungen) + `
    <div class="btn-row"><button class="btn soft" id="w-korr">📋 Korrektur-Text für den Chatbot kopieren</button></div>`;
  $('#w-korr', root).onclick = async () => toast((await copyText(korrekturPrompt(fehler))) ? 'Kopiert! Im selben Chat einfügen und abschicken.' : 'Kopieren hat nicht geklappt.');
  $('#w-meldungen', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function meldungenHtml(fehler, warnungen) {
  return `${fehler.length ? `<div class="msg err"><strong>Das hat noch nicht geklappt:</strong><ul>${fehler.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    ${warnungen.length ? `<div class="msg warn"><strong>Hinweise:</strong><ul>${warnungen.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}`;
}

// ---------- 4. Kontrolle ----------
function status(v) {
  if (!v._uebernehmen) return 'doppelt';
  if (!v.wort || !v.bedeutungen.length) return 'fehlt';
  if (v._probleme.some((p) => p.stufe === 'unsicher' || p.stufe === 'warnung')) return 'unsicher';
  return 'ok';
}

async function kontrolle(ctx) {
  const latein = getFach(W.fachId).formenTyp === 'latein';
  const d = W.daten;
  const alle = d.parts.flatMap((p) => p.vokabeln);
  const karte = (v, nr, part) => {
    const f = v.formen || {};
    const probleme = v._probleme.filter((p) => p.stufe !== 'fehler' || !(p.text.includes('Bedeutung') && v.bedeutungen.length) && !(p.text.includes('Wort selbst') && v.wort));
    return `
    <div class="card check-card ${status(v)}" data-tmp="${v._tmp}">
      <div class="check-head">
        <span class="badge">${esc(part)} · ${nr}</span>
        <span class="grow"></span>
        ${v._doppeltVon ? `<select class="w-aktion" style="width:auto;min-height:44px">
          <option value="ueberspringen" ${v._aktion === 'ueberspringen' ? 'selected' : ''}>schon da: überspringen</option>
          <option value="ersetzen" ${v._aktion === 'ersetzen' ? 'selected' : ''}>schon da: ersetzen</option></select>`
        : `<label class="switch"><input type="checkbox" class="w-ueb" ${v._uebernehmen ? 'checked' : ''}> übernehmen</label>`}
      </div>
      ${probleme.length ? `<ul class="small" style="margin:8px 0;padding-left:20px;color:var(--warn)">${probleme.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul>` : ''}
      <div class="field-row">
        <div><label>Wort</label><input type="text" class="w-f" data-k="wort" value="${esc(v.wort)}" autocapitalize="off"></div>
        <div><label>Bedeutungen <span class="muted small">(mit ; trennen)</span></label><input type="text" class="w-f" data-k="bedeutungen" value="${esc(v.bedeutungen.join('; '))}"></div>
        ${latein ? `
          <div><label>Genitiv / Endungen</label><input type="text" class="w-f" data-k="genitiv" value="${esc(f.genitiv || f.adjektiv_endungen || '')}" autocapitalize="off"></div>
          <div><label>Stammformen <span class="muted small">(mit Komma)</span></label><input type="text" class="w-f" data-k="stammformen" value="${esc((f.stammformen || []).join(', '))}" autocapitalize="off"></div>`
        : `<div><label>Lautschrift</label><input type="text" class="w-f" data-k="lautschrift" value="${esc(v.lautschrift)}" autocapitalize="off"></div>`}
        <div><label>Wortart</label><select class="w-f" data-k="wortart">${WORTARTEN.map((w) => `<option value="${w}" ${w === v.wortart ? 'selected' : ''}>${WORTART_NAMEN[w]}</option>`).join('')}</select></div>
      </div>
      ${extrasKurz(v)}
    </div>`;
  };
  const html = `
    <h2 style="margin-top:0">4. Kontrollieren</h2>
    <div class="msg ok">✓ ${plural(alle.length, 'Vokabel', 'Vokabeln')} in ${plural(d.parts.length, 'Part', 'Parts')} gefunden${d.seiten.length ? ' (Seite ' + esc(d.seiten.join(', ')) + ')' : ''}, dazu ${plural(d.lernsaetze.length, 'Lernsatz', 'Lernsätze')} und ${plural(d.satzbau.length, 'Satzbau-Aufgabe', 'Satzbau-Aufgaben')}.</div>
    ${meldungenHtml([], W.warnungen)}
    ${d.hinweise.length ? `<div class="msg info"><strong>Hinweise vom Chatbot:</strong><ul>${d.hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
    <p class="muted small">Vergleiche mit dem Buch. <span class="badge warn">gelb</span> = Chatbot war unsicher, <span class="badge err">rot</span> = etwas fehlt, grau = schon vorhanden.</p>
    ${d.parts.map((p) => `<h2 data-h="3">Part ${esc(p.kennung)}</h2>${p.vokabeln.map((v, i) => karte(v, i + 1, p.kennung)).join('')}`).join('')}
    <div id="w-summe" class="card" style="position:sticky;bottom:calc(8px + env(safe-area-inset-bottom));z-index:5"></div>
    <div class="btn-row"><button class="btn secondary" id="w-zurueck">‹ Andere Antwort einfügen</button></div>`;
  return {
    html,
    bind(root) {
      const finde = (tmp) => alle.find((v) => v._tmp === tmp);
      const aktualisiere = () => {
        $$('.check-card', root).forEach((c) => { const v = finde(c.dataset.tmp); c.className = `card check-card ${status(v)}`; });
        const rein = alle.filter((v) => v._uebernehmen);
        const rot = rein.filter((v) => status(v) === 'fehlt').length;
        $('#w-summe', root).innerHTML = `
          ${rot ? `<div class="msg err small" style="margin-top:0">Noch ${plural(rot, 'rote Vokabel', 'rote Vokabeln')}: ergänzen oder Haken bei „übernehmen“ rausnehmen.</div>` : ''}
          <button class="btn block" id="w-speichern" ${rot || !rein.length ? 'disabled' : ''}>✓ ${plural(rein.length, 'Vokabel', 'Vokabeln')} übernehmen</button>
          ${rot ? '<button class="btn soft block" style="margin-top:8px" id="w-korr2">📋 Korrektur-Text für den Chatbot kopieren</button>' : ''}`;
        $('#w-speichern', root).onclick = speichern;
        const k = $('#w-korr2', root);
        if (k) k.onclick = async () => toast((await copyText(korrekturPrompt(vokabelProblemListe(W.daten)))) ? 'Kopiert!' : 'Kopieren hat nicht geklappt.');
      };
      $$('.check-card', root).forEach((c) => {
        const v = finde(c.dataset.tmp);
        const ueb = $('.w-ueb', c);
        if (ueb) ueb.onchange = () => { v._uebernehmen = ueb.checked; aktualisiere(); };
        const akt = $('.w-aktion', c);
        if (akt) akt.onchange = () => { v._aktion = akt.value; v._uebernehmen = akt.value === 'ersetzen'; aktualisiere(); };
        $$('.w-f', c).forEach((inp) => {
          inp.oninput = inp.onchange = () => {
            const k = inp.dataset.k, val = inp.value.trim();
            if (k === 'bedeutungen') v.bedeutungen = val.split(';').map((s) => s.trim()).filter(Boolean);
            else if (k === 'genitiv') { v.formen = { ...v.formen }; if (v.wortart === 'adjektiv') v.formen.adjektiv_endungen = val; else v.formen.genitiv = val; }
            else if (k === 'stammformen') v.formen = { ...v.formen, stammformen: val.split(',').map((s) => s.trim()).filter(Boolean) };
            else v[k] = val;
            aktualisiere();
          };
        });
      });
      aktualisiere();
      $('#w-zurueck', root).onclick = () => weiter(ctx, 'einfuegen');

      async function speichern() {
        const b = $('#w-speichern', root);
        b.disabled = true; b.textContent = 'Speichere …';
        try {
          W.ergebnis = await speichere(W.daten, { lehrwerkId: W.lehrwerkId, unitNummer: W.unitNummer, unitTitel: W.unitTitel, rohtext: W.rohtext });
          // Fach ins Profil übernehmen, damit die Unit unter Lernen/Bücher auch erscheint
          if (ctx.profil.fachIds?.length && !ctx.profil.fachIds.includes(W.fachId)) {
            const p = await db.get('profile', ctx.profil.id);
            p.fachIds = [...(p.fachIds || []), W.fachId];
            await db.put('profile', p);
            ctx.profil = p;
          }
          W.unitId = W.ergebnis.unitId;
          weiter(ctx, 'fertig');
        } catch (e) {
          toast('Speichern fehlgeschlagen: ' + e.message);
          b.disabled = false; b.textContent = 'Nochmal versuchen';
        }
      }
    }
  };
}

function extrasKurz(v) {
  const teile = [];
  if (v.beispiele.length) teile.push(plural(v.beispiele.length, 'Beispiel', 'Beispiele'));
  if (v.erklaerung) teile.push('Erklärung');
  if (v.andereSprachen.length) teile.push('F/L-Verweise');
  if (v.gegenteile.length) teile.push('Gegenteil');
  if (v.wortfamilie.length) teile.push('Wortfamilie');
  if (v.stolpersteine.length) teile.push(plural(v.stolpersteine.length, 'Stolperstein', 'Stolpersteine'));
  if (v.merkhilfe) teile.push('Merkhilfe');
  return teile.length ? `<p class="muted small" style="margin-bottom:0">+ ${teile.join(' · ')}</p>` : '';
}

// ---------- 5. Fertig ----------
async function fertig(ctx) {
  const r = W.ergebnis;
  const html = `
    <div class="card empty">
      <div class="big">🎉</div>
      <h2>Geschafft!</h2>
      <p>${plural(r.neu, 'neue Vokabel', 'neue Vokabeln')}${r.ersetzt ? `, ${r.ersetzt} ersetzt` : ''}, ${plural(r.saetze, 'Lernsatz', 'Lernsätze')} und ${plural(r.satzbau, 'Satzbau-Aufgabe', 'Satzbau-Aufgaben')} gespeichert.</p>
    </div>
    <div class="btn-row"><a class="btn" href="#/unit/${esc(r.unitId)}">Unit ansehen</a></div>
    <div class="btn-row"><button class="btn secondary" id="w-naechste">📸 Nächste Seite dieser Unit</button></div>
    <div class="btn-row"><a class="btn secondary" href="#/home">Zur Startseite</a></div>`;
  return {
    html,
    bind(root) {
      $('#w-naechste', root).onclick = () => {
        Object.assign(W, { rohtext: '', daten: null, warnungen: [], parseFehler: [], ergebnis: null, folge: true });
        weiter(ctx, 'prompt');
      };
    }
  };
}
