// Beta-Testversion läuft unter eigener Adresse (…/vokabel-studio-beta/) auf derselben Domain.
// Damit Test- und Live-Daten sich nicht mischen, bekommt die Beta eigene Speichernamen.
export const BETA = /beta/i.test(location.pathname);
export const DB_NAME = BETA ? 'vokabel-studio-beta' : 'vokabel-studio';
export const LS_PREFIX = BETA ? 'vsb-' : 'vs-';
// Gleiche Nummer wie VERSION in sw.js – bei jeder Änderung beide erhöhen.
export const APP_VERSION = BETA ? '2.10.2-beta' : '2.10.2';

// Umzug (23.11.2026): neue Adresse in der GitHub-Organisation „vokabel-studio“.
// Die alte Adresse bleibt vorerst erreichbar und zeigt einen Umzugshinweis, damit man dort noch eine Sicherung machen kann.
export const ALTE_ADRESSE = location.hostname === 'thereal-menntos.github.io';
export const NEUE_ADRESSE = BETA ? 'https://vokabel-studio.github.io/beta/' : 'https://vokabel-studio.github.io/';
