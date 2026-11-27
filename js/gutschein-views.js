// „Meine Gutscheine“: eigene Seite für das Kind – bereit zum Einlösen, auf dem Weg, schon eingelöst.
// Einlösen kann das Kind selbst (kurze Rückfrage); Eltern können es zusätzlich in der Eltern-Ansicht.
import { esc, $$, toast, datum, plural } from './util.js';
import * as G from './gutscheine.js';

export async function gutscheineView(_p, ctx) {
  if (!ctx.profil) { ctx.go('profile'); return null; }
  const neu = await G.pruefe(ctx.profil.id).catch(() => []);   // Erreichtes sofort freischalten, nicht erst nach der nächsten Übung
  const { b, tests } = await G.daten(ctx.profil.id);
  const offen = b.freigeschaltet.filter((f) => !f.eingeloestAm).sort((x, y) => y.am.localeCompare(x.am));
  const aktive = b.gutscheine.filter((g) => !g.erledigt);
  const eingeloest = b.freigeschaltet.filter((f) => f.eingeloestAm).sort((x, y) => y.eingeloestAm.localeCompare(x.eingeloestAm));
  const nichts = !offen.length && !aktive.length && !eingeloest.length;
  const html = nichts ? `
    <div class="card empty"><div class="big" aria-hidden="true">🎟️</div>
      <p>Hier erscheinen deine Gutscheine – zum Beispiel ein Eis oder extra Spielzeit.</p>
      <p class="small">Deine Eltern können im Bereich <strong>„Für Eltern“</strong> Gutscheine anlegen. Du schaltest sie dann durch Lernen frei.</p>
    </div>` : `
    <section aria-labelledby="gs-bereit">
      <h2 data-h="3" id="gs-bereit">🎉 Bereit zum Einlösen ${offen.length ? `<span class="badge ok">${offen.length}</span>` : ''}</h2>
      ${offen.length ? offen.map((f) => G.gutscheinHtml(f, `<div class="small muted">freigeschaltet am ${datum(f.am)}</div>
          <button class="btn gs-knopf" data-einloesen="${esc(f.id)}" aria-label="${esc(f.text)} als eingelöst markieren">✓ Eingelöst</button>`)).join('')
        : '<p class="muted small">Gerade keiner – lern weiter, dann kommt der nächste! 💪</p>'}
      ${offen.length ? '<p class="muted small">Zeig den Gutschein deinen Eltern. Wenn du ihn bekommen hast, tippe auf „Eingelöst“.</p>' : ''}
    </section>
    ${aktive.length ? `<section aria-labelledby="gs-weg">
      <h2 data-h="3" id="gs-weg">🚀 Auf dem Weg</h2>
      <div class="card" style="padding:4px 14px">${aktive.map((g) => G.fortschrittHtml(g, b, tests)).join('')}</div>
    </section>` : ''}
    ${eingeloest.length ? `<section aria-labelledby="gs-alt">
      <h2 data-h="3" id="gs-alt">✅ Schon eingelöst (${eingeloest.length})</h2>
      <div class="card" style="padding:0"><ul class="list">
        ${eingeloest.map((f) => `<li class="list-item"><span class="mehr-icon" aria-hidden="true">${esc(f.emoji || '🎁')}</span>
          <span class="grow"><span class="vok-wort">${esc(f.text)}</span><br><span class="vok-de">eingelöst am ${datum(f.eingeloestAm)}</span></span></li>`).join('')}
      </ul></div>
    </section>` : ''}`;
  return {
    title: 'Meine Gutscheine', back: 'home', html,
    bind(root) {
      G.feiere(neu);
      $$('[data-einloesen]', root).forEach((btn) => btn.onclick = async () => {
        const f = offen.find((x) => x.id === btn.dataset.einloesen);
        if (!confirm(`Hast du „${f.text}“ bekommen? Dann wird der Gutschein als eingelöst markiert.`)) return;
        await G.einloesen(ctx.profil.id, f.id);
        toast('Eingelöst ✓ Viel Spaß!');
        ctx.rerender();
      });
    }
  };
}

/** Kurzinfo für Startseite/Erfolge: { bereit, gesamt } */
export async function gutscheinZahlen(profilId) {
  const { b } = await G.daten(profilId);
  return { bereit: b.freigeschaltet.filter((f) => !f.eingeloestAm).length, gesamt: b.gutscheine.length + b.freigeschaltet.length };
}
export const gutscheinLinkText = (z) => (z.bereit ? `${plural(z.bereit, 'Gutschein', 'Gutscheine')} bereit zum Einlösen` : 'Fortschritt und eingelöste Gutscheine');
