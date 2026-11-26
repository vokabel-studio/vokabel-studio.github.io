// OneDrive-Anschluss (Microsoft Graph). Anmeldung: OAuth 2.0 mit PKCE direkt im Browser, ohne eigenen Server.
// Die App sieht nur ihren eigenen App-Ordner („Apps/Vokabel-Studio“), keine anderen Dateien.
// Hinweis Microsoft: Bei Web-Apps gilt eine Anmeldung bis zu 24 Stunden ohne Nachfragen; danach meldet die App
// „Bitte kurz neu anmelden“ (ein Tipp, meist ohne Passwort, wenn man bei Microsoft angemeldet bleibt).
import * as db from './db.js';
import { CLOUD, LS_PREFIX } from './config.js';
import { verbunden } from './cloud.js';

const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const DATEI = 'vokabel-studio-sync.json';
const SCOPE = 'Files.ReadWrite.AppFolder User.Read offline_access';
const PKCE_KEY = LS_PREFIX + 'onedrive-pkce';

export class CloudFehler extends Error {
  constructor(text, { anmelden = false, konflikt = false, status = 0 } = {}) { super(text); this.anmelden = anmelden; this.konflikt = konflikt; this.status = status; }
}

/** Client-ID der App-Registrierung bei Microsoft (öffentlich, kein Geheimnis) */
export function clientId() {
  // Für Tests überschreibbar; „aus“ = so tun, als wäre OneDrive nicht freigeschaltet
  try {
    const x = localStorage.getItem(LS_PREFIX + 'onedrive-client-id');
    if (x === 'aus') return '';
    return x || CLOUD.onedrive || '';
  } catch { return CLOUD.onedrive || ''; }
}
export const eingerichtet = () => !!clientId();
const rueckAdresse = () => location.origin + location.pathname;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const zufall = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Zur Anmeldeseite von Microsoft wechseln; danach kommt man in die App zurück */
export async function anmelden() {
  if (!eingerichtet()) throw new CloudFehler('OneDrive ist in dieser App-Version noch nicht freigeschaltet.');
  const verifier = zufall(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = zufall(16);
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, zurueck: location.hash || '#/backup', am: Date.now() }));
  const q = new URLSearchParams({
    client_id: clientId(), response_type: 'code', redirect_uri: rueckAdresse(), scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
  });
  location.assign(`${AUTH}/authorize?${q}`);
}

/** Beim App-Start: Kommen wir gerade von der Microsoft-Anmeldung zurück? Dann Anmeldung abschließen. */
export function istRueckkehr() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return false;
  try { return JSON.parse(localStorage.getItem(PKCE_KEY) || 'null')?.state === q.get('state'); } catch { return false; }
}

export async function anmeldungAbschliessen() {
  const q = new URLSearchParams(location.search);
  const pkce = JSON.parse(localStorage.getItem(PKCE_KEY) || 'null');
  localStorage.removeItem(PKCE_KEY);
  history.replaceState(null, '', location.pathname + (pkce?.zurueck || '#/backup'));
  if (q.get('error')) {
    throw new CloudFehler(q.get('error') === 'access_denied' ? 'Anmeldung abgebrochen.' : `Microsoft meldet: ${q.get('error_description') || q.get('error')}`);
  }
  await tokenHolen({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: rueckAdresse(), code_verifier: pkce.verifier });
  const ich = await api('/me?$select=displayName,userPrincipalName,mail');
  await verbunden('onedrive', ich.mail || ich.userPrincipalName || ich.displayName || 'Microsoft-Konto');
}

async function tokenHolen(felder) {
  let res;
  try {
    res = await fetch(`${AUTH}/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), scope: SCOPE, ...felder })
    });
  } catch { throw new CloudFehler('Keine Verbindung zu Microsoft. Ist das Internet an?'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new CloudFehler('Die Anmeldung bei OneDrive ist abgelaufen. Bitte kurz neu anmelden.', { anmelden: true, status: res.status });
  await db.setMeta('onedrive', { access: j.access_token, refresh: j.refresh_token, ablauf: Date.now() + (j.expires_in || 3600) * 1000 });
}

async function zugang() {
  const t = await db.getMeta('onedrive');
  if (!t?.access) throw new CloudFehler('Nicht bei OneDrive angemeldet.', { anmelden: true });
  if (t.ablauf - 60_000 > Date.now()) return t.access;
  if (!t.refresh) throw new CloudFehler('Bitte kurz neu bei OneDrive anmelden.', { anmelden: true });
  await tokenHolen({ grant_type: 'refresh_token', refresh_token: t.refresh });
  return (await db.getMeta('onedrive')).access;
}

async function api(pfad, opts = {}, nochmal = true) {
  let res;
  try {
    res = await fetch(GRAPH + pfad, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await zugang()}` } });
  } catch (e) {
    if (e instanceof CloudFehler) throw e;
    throw new CloudFehler('Keine Verbindung zu OneDrive. Ist das Internet an?');
  }
  if (res.status === 401 && nochmal) {
    const t = await db.getMeta('onedrive');
    if (t) await db.setMeta('onedrive', { ...t, ablauf: 0 });   // Zugang erneuern und einmal wiederholen
    return api(pfad, opts, false);
  }
  if (res.status === 404) return null;
  if (res.status === 412) throw new CloudFehler('Ein anderes Gerät hat gerade gespeichert.', { konflikt: true, status: 412 });
  if (res.status === 507) throw new CloudFehler('Der OneDrive-Speicher ist voll.', { status: 507 });
  if (!res.ok) throw new CloudFehler(`OneDrive meldet einen Fehler (${res.status}).`, { status: res.status, anmelden: res.status === 401 });
  return res.json();
}

const pfadDatei = `/me/drive/special/approot:/${DATEI}`;

/** Stand der Sync-Datei in OneDrive (oder null, wenn es sie noch nicht gibt) */
export async function info() {
  const j = await api(pfadDatei);
  if (!j) return null;
  return {
    etag: j.eTag,
    async lade() {
      const url = j['@microsoft.graph.downloadUrl'];
      let res;
      try { res = url ? await fetch(url) : null; } catch { res = null; }
      if (res?.ok) return res.json();
      return api(`${pfadDatei}:/content`);
    }
  };
}

export async function speichere(paket, etag) {
  const j = await api(`${pfadDatei}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
    body: JSON.stringify(paket)
  });
  return { etag: j?.eTag };
}

export async function abmelden() {
  await db.del('meta', 'onedrive');
}
