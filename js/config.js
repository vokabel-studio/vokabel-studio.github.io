// Beta-Testversion läuft unter eigener Adresse (…/vokabel-studio-beta/) auf derselben Domain.
// Damit Test- und Live-Daten sich nicht mischen, bekommt die Beta eigene Speichernamen.
export const BETA = /beta/i.test(location.pathname);
export const DB_NAME = BETA ? 'vokabel-studio-beta' : 'vokabel-studio';
export const LS_PREFIX = BETA ? 'vsb-' : 'vs-';
// Gleiche Nummer wie VERSION in sw.js – bei jeder Änderung beide erhöhen.
export const APP_VERSION = BETA ? '2.13.0-beta' : '2.13.0';

// Umzug (23.11.2026): neue Adresse in der GitHub-Organisation „vokabel-studio“.
// Die alte Adresse bleibt vorerst erreichbar und zeigt einen Umzugshinweis, damit man dort noch eine Sicherung machen kann.
export const ALTE_ADRESSE = location.hostname === 'thereal-menntos.github.io';
export const NEUE_ADRESSE = BETA ? 'https://vokabel-studio.github.io/beta/' : 'https://vokabel-studio.github.io/';

// Cloud-Abgleich: öffentliche App-Kennungen der Anbieter (keine Geheimnisse – sie stehen bei jeder Web-App im Code).
// OneDrive: „Anwendungs-ID (Client)“ aus der App-Registrierung bei Microsoft (Microsoft Entra › App-Registrierungen).
// Weiterleitungs-URI als Typ „Single-Page-Anwendung“: Beta-App → https://vokabel-studio.github.io/beta/, Live-App → https://vokabel-studio.github.io/
// Berechtigungen (Microsoft Graph, delegiert): Files.ReadWrite.AppFolder, offline_access, User.Read
export const CLOUD = {
  // Zwei App-Registrierungen bei Microsoft (26.11.2026): eine für die Beta, eine für die Live-App
  onedrive: BETA ? '09734763-35cd-4acf-9567-ca06532069de' : '625efbb8-9ad1-4993-bc82-42b27a26d177'
};

