// Geräte abgleichen: Karte unter „Sicherung“, QR-Übertragung (Senden/Empfangen), Cloud-Anbieter
import * as db from './db.js';
import { esc, $, $$, toast, plural } from './util.js';
import * as S from './sync.js';
import * as C from './cloud.js';

const zeit = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const aenderungText = (s) => {
  if (!s) return '';
  const n = (s.neu || 0) + (s.geaendert || 0) + (s.geloescht || 0);
  return n ? `${plural(n, 'Änderung', 'Änderungen')} vom anderen Gerät übernommen` : 'keine neuen Änderungen';
};

// ================= Karte unter „Sicherung“ =================
export async function abgleichKarte() {
  const c = await C.status();
  const A = c?.anbieter ? C.ANBIETER[c.anbieter] : null;
  const OD = await C.ANBIETER.onedrive.modul();
  const verbundenHtml = A ? `
    <div class="ordner-kopf"><span class="ordner-icon">${A.icon}</span><span class="grow"><strong>${esc(A.name)}</strong><br>
      <span class="muted small">${esc(c.konto || '')}</span></span></div>
    <div class="msg ${c.status === 'ok' ? 'ok' : c.status === 'anmelden' ? 'warn' : c.status === 'fehler' ? 'err' : 'info'} small" id="ab-status">
      ${c.status === 'anmelden' ? '<strong>Bitte kurz neu anmelden.</strong> Microsoft verlangt das bei Web-Apps etwa einmal am Tag.'
        : c.status === 'fehler' ? `<strong>Letzter Abgleich hat nicht geklappt.</strong><br>${esc(c.fehler || '')}`
        : c.zuletzt ? `✓ Zuletzt abgeglichen: <strong>${esc(zeit(c.zuletzt))}</strong> · ${esc(aenderungText(c.letzte))}` : 'Noch nicht abgeglichen.'}
    </div>
    <div class="btn-row">
      ${c.status === 'anmelden' ? '<button class="btn" id="ab-neu-anmelden">Neu anmelden</button>' : '<button class="btn" id="ab-jetzt">🔄 Jetzt abgleichen</button>'}
      <button class="btn secondary" id="ab-trennen">Trennen</button>
    </div>
    <p class="muted small">Abgeglichen wird automatisch beim Öffnen der App und nach jeder Übung. Andere Geräte mit derselben Verbindung bekommen die Änderungen beim nächsten Abgleich.</p>`
    : `<p class="small">Alle Geräte der Familie, die mit demselben Cloud-Konto verbunden sind, haben automatisch denselben Stand – z. B. das Handy des Kindes und das der Eltern. Die App sieht nur ihren eigenen Ordner, keine anderen Dateien.</p>
    <div class="anbieter-liste">
      ${Object.entries(C.ANBIETER).map(([id, a]) => {
        const bereit = !a.bald && (id !== 'onedrive' || OD.eingerichtet());
        return `<div class="anbieter-zeile"><span class="anbieter-icon">${a.icon}</span>
          <span class="grow"><strong>${esc(a.name)}</strong><br><span class="muted small">${esc(id === 'onedrive' && !OD.eingerichtet() ? 'Wird gerade eingerichtet (Freischaltung bei Microsoft fehlt noch)' : a.text)}</span></span>
          ${bereit ? `<button class="btn" data-verbinden="${id}">Verbinden</button>` : '<span class="badge">bald</span>'}</div>`;
      }).join('')}
    </div>`;
  return `<section class="card" id="abgleich-karte" aria-labelledby="ab-titel">
    <h2 data-h="3" style="margin-top:0" id="ab-titel">☁️ Automatisch abgleichen ${A ? '' : '<span class="badge ok">empfohlen</span>'}</h2>
    ${verbundenHtml}
  </section>
  <section class="card" aria-labelledby="qr-titel">
    <h2 data-h="3" style="margin-top:0" id="qr-titel">📲 Handy zu Handy (QR-Code)</h2>
    <p class="small" style="margin-top:0">Ohne Konto und ohne Internet: Ein Handy zeigt QR-Codes, das andere liest sie mit der Kamera. Gut für ein neues Handy oder um einem Geschwisterkind Vokabeln zu geben. Vorhandenes wird zusammengeführt, nichts überschrieben.</p>
    <div class="btn-row"><a class="btn soft" href="#/qr-senden">📤 Senden</a><a class="btn soft" href="#/qr-empfangen">📥 Empfangen</a></div>
  </section>`;
}

export function bindAbgleich(root, ctx) {
  const jetzt = $('#ab-jetzt', root);
  if (jetzt) jetzt.onclick = async () => {
    jetzt.disabled = true; jetzt.innerHTML = '<span class="spinner"></span> Gleiche ab …';
    try {
      const s = await C.abgleichen();
      toast(`Abgeglichen ✓ ${aenderungText(s)}`, 3500);
    } catch (e) { toast(e.message || 'Abgleich hat nicht geklappt.', 5000); }
    ctx.rerender();
  };
  const neu = $('#ab-neu-anmelden', root);
  if (neu) neu.onclick = async () => { const c = await C.status(); (await C.ANBIETER[c.anbieter].modul()).anmelden(); };
  const tr = $('#ab-trennen', root);
  if (tr) tr.onclick = async () => {
    if (!confirm('Verbindung trennen? Die Daten auf diesem Gerät und in der Cloud bleiben erhalten, es wird nur nicht mehr abgeglichen.')) return;
    await C.trennen(); toast('Getrennt.'); ctx.rerender();
  };
  $$('[data-verbinden]', root).forEach((b) => b.onclick = async () => {
    try { await (await C.ANBIETER[b.dataset.verbinden].modul()).anmelden(); } catch (e) { toast(e.message, 5000); }
  });
}

// ================= QR senden =================
let senden = null;   // { timer, wake }
function sendenStoppen() {
  if (!senden) return;
  clearInterval(senden.timer);
  senden.wake?.release?.().catch(() => {});
  window.removeEventListener('hashchange', sendenStoppen);
  senden = null;
}

export async function qrSendenView(_p, ctx) {
  sendenStoppen();
  const profile = (await db.all('profile')).sort((a, b) => a.name.localeCompare(b.name));
  const nUnits = await db.count('units');
  const html = `
    <div class="card">
      <p style="margin-top:0">Dieses Handy zeigt gleich mehrere QR-Codes nacheinander. Auf dem anderen Handy <strong>Sicherung › Geräte abgleichen › Empfangen</strong> öffnen und die Kamera auf diesen Bildschirm halten.</p>
      <label>Was soll übertragen werden?</label>
      <label class="switch" style="display:flex"><input type="radio" name="qr-was" value="alles" checked> <span class="grow"><strong>Profile mit Lernstand</strong> und alle Vokabeln</span></label>
      <div id="qr-profile" style="padding-left:30px">
        ${profile.map((p) => `<label class="switch" style="display:flex"><input type="checkbox" class="qr-profil" value="${esc(p.id)}" checked> <span class="grow">${esc(p.name)}</span></label>`).join('') || '<p class="muted small">Noch keine Profile.</p>'}
      </div>
      <label class="switch" style="display:flex"><input type="radio" name="qr-was" value="vokabeln"> <span class="grow"><strong>Nur Vokabeln</strong> (${plural(nUnits, 'Unit', 'Units')}, ohne Profile und Lernstand – z. B. für Geschwister)</span></label>
      <button class="btn block" id="qr-start" style="margin-top:12px">▶️ QR-Codes anzeigen</button>
    </div>
    <div id="qr-anzeige" hidden>
      <div class="qr-rahmen"><canvas id="qr-canvas" width="720" height="720"></canvas></div>
      <p class="qr-zaehler" id="qr-zaehler"></p>
      <p class="muted small" style="text-align:center">Die Codes laufen in einer Schleife. Ruhig halten, nicht zu nah – das andere Handy sagt, wenn alles angekommen ist.</p>
      <button class="btn secondary block" id="qr-stopp">Fertig</button>
    </div>`;
  return {
    title: 'Senden (QR-Code)', back: 'backup', html,
    bind(root) {
      $$('[name=qr-was]', root).forEach((r) => r.onchange = () => { $('#qr-profile', root).hidden = $('[name=qr-was]:checked', root).value !== 'alles'; });
      $('#qr-stopp', root).onclick = () => { sendenStoppen(); ctx.go('backup'); };
      $('#qr-start', root).onclick = async () => {
        const was = $('[name=qr-was]:checked', root).value;
        let obj;
        if (was === 'vokabeln') {
          const P = await import('./pakete.js');
          obj = await P.erstellePaket(await db.keys('units'));
        } else {
          const ids = $$('.qr-profil:checked', root).map((c) => c.value);
          obj = await S.exportiere({ profilIds: ids.length === profile.length ? null : ids });
        }
        const Q = await import('./qr.js');
        const { teile, bytes } = await Q.inTeile(obj);
        $('#qr-anzeige', root).hidden = false;
        $('#qr-start', root).closest('.card').hidden = true;
        sendenStoppen();
        senden = { timer: 0 };
        window.addEventListener('hashchange', sendenStoppen);
        if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((w) => { if (senden) senden.wake = w; }).catch(() => {});
        let i = 0;
        const zeige = () => {
          Q.zeichne($('#qr-canvas', root), teile[i]);
          $('#qr-zaehler', root).textContent = `Teil ${i + 1} von ${teile.length} · ${Math.max(1, Math.round(bytes / 1024))} KB`;
          i = (i + 1) % teile.length;
        };
        zeige();
        senden.timer = setInterval(zeige, teile.length > 1 ? 280 : 1000);
        root.querySelector('#qr-anzeige').scrollIntoView({ block: 'start' });
      };
    }
  };
}

// ================= QR empfangen =================
let scanner = null;
function scannerStoppen() { scanner?.stopp(); scanner = null; window.removeEventListener('hashchange', scannerStoppen); }

export async function qrEmpfangenView(_p, ctx) {
  scannerStoppen();
  const html = `
    <div class="card" id="qr-hinweis">
      <p style="margin-top:0">Auf dem <strong>anderen Handy</strong>: Sicherung › Geräte abgleichen › <strong>Senden</strong>. Dann hier die Kamera starten und auf dessen Bildschirm halten.</p>
      <button class="btn block" id="qr-kamera">📷 Kamera starten</button>
    </div>
    <div id="qr-scan" hidden>
      <div class="qr-rahmen"><video id="qr-video" playsinline muted></video></div>
      <div class="bar" style="margin:12px 0 6px"><span id="qr-bar" style="width:0%"></span></div>
      <p class="qr-zaehler" id="qr-stand">Suche QR-Code …</p>
      <button class="btn secondary block" id="qr-abbruch">Abbrechen</button>
    </div>
    <div id="qr-ergebnis"></div>`;
  return {
    title: 'Empfangen (QR-Code)', back: ctx.profil ? 'backup' : 'profile', hideProfile: !ctx.profil, html,
    bind(root) {
      $('#qr-abbruch', root).onclick = () => { scannerStoppen(); ctx.go(ctx.profil ? 'backup' : 'profile'); };
      $('#qr-kamera', root).onclick = async () => {
        const Q = await import('./qr.js');
        const sammler = new Q.Sammler();
        let fertig = false;
        try {
          $('#qr-scan', root).hidden = false; $('#qr-hinweis', root).hidden = true;
          scanner = await Q.scanne($('#qr-video', root), async (text) => {
            if (fertig) return;
            const r = sammler.hinzu(text);
            if (r.fremd) { $('#qr-stand', root).textContent = 'Das ist kein QR-Code von Vokabel-Studio.'; return; }
            $('#qr-bar', root).style.width = `${Math.round(r.anzahl / r.gesamt * 100)}%`;
            $('#qr-stand', root).textContent = `${r.anzahl} von ${r.gesamt} Teilen empfangen`;
            if (r.neu && navigator.vibrate) navigator.vibrate(15);
            if (!r.fertig) return;
            fertig = true;
            scannerStoppen();
            $('#qr-scan', root).hidden = true;
            zeigeErgebnis(root, ctx, await sammler.ergebnis());
          });
          window.addEventListener('hashchange', scannerStoppen);
        } catch (e) {
          $('#qr-scan', root).hidden = true; $('#qr-hinweis', root).hidden = false;
          $('#qr-ergebnis', root).innerHTML = `<div class="msg err">${e.name === 'NotAllowedError' ? 'Die Kamera wurde nicht erlaubt. Bitte in den Browser-Einstellungen für diese Seite die Kamera freigeben.' : esc(e.message || e)}</div>`;
        }
      };
    }
  };
}

/** Empfangene Daten anzeigen und übernehmen (auch für Tests ohne Kamera nutzbar) */
export async function zeigeErgebnis(root, ctx, obj) {
  const box = $('#qr-ergebnis', root);
  if (obj?.format === 'vokabel-studio-paket') {
    const T = await import('./teilen-views.js');
    T.paketVormerken(obj);
    ctx.go('paket-laden');
    return;
  }
  if (!S.istPaket(obj)) { box.innerHTML = '<div class="msg err">Die empfangenen Daten sind nicht lesbar.</div>'; return; }
  const u = S.uebersicht(obj);
  box.innerHTML = `<div class="card">
    <h2 data-h="3" style="margin-top:0">✓ Alles empfangen</h2>
    <p>${u.profile.length ? `Profile: <strong>${esc(u.profile.join(', '))}</strong><br>` : ''}${plural(u.units, 'Unit', 'Units')} · ${plural(u.vokabeln, 'Vokabel', 'Vokabeln')} · Stand ${esc(zeit(u.stand))}</p>
    <p class="small muted">Wird mit den Daten auf diesem Handy zusammengeführt: Neueres gewinnt, nichts wird einfach überschrieben.</p>
    <button class="btn block" id="qr-uebernehmen">Übernehmen</button></div>`;
  $('#qr-uebernehmen', box).onclick = async () => {
    const r = await S.fuehreZusammen(obj);
    toast(`Übernommen ✓ ${r.neu} neu, ${r.geaendert} aktualisiert${r.geloescht ? `, ${r.geloescht} gelöscht` : ''}`, 4000);
    ctx.go(ctx.profil ? 'home' : 'profile');
  };
}
