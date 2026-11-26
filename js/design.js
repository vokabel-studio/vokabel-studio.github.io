// Hell/Dunkel/Automatisch. Wird je Profil gespeichert und zusätzlich lokal gemerkt (damit beim Start nichts aufblitzt).
import { LS_PREFIX } from './config.js';

export const DESIGNS = [['auto', 'Automatisch (wie das Gerät)'], ['hell', 'Hell'], ['dunkel', 'Dunkel']];

export function setzeDesign(d = 'auto') {
  const root = document.documentElement;
  if (d === 'hell') root.dataset.theme = 'light';
  else if (d === 'dunkel') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try { localStorage.setItem(LS_PREFIX + 'design', d); } catch { /* privat */ }
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#2f5bd3');
}

// Textgröße (Barrierefreiheit): vergrößert die ganze App wie das Zoomen im Browser. Je Profil, lokal gemerkt.
export const TEXTGROESSEN = [['normal', 'Normal', 1], ['gross', 'Groß', 1.15], ['sehrgross', 'Sehr groß', 1.3]];
export function setzeTextgroesse(t = 'normal') {
  const f = (TEXTGROESSEN.find(([id]) => id === t) || TEXTGROESSEN[0])[2];
  document.documentElement.style.zoom = f === 1 ? '' : String(f);
  try { localStorage.setItem(LS_PREFIX + 'text', t); } catch { /* privat */ }
}
