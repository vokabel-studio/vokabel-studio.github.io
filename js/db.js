// Kleine IndexedDB-Schicht. Alle Daten bleiben auf dem Gerät.
import { DB_NAME } from './config.js';
const DB_VERSION = 2;   // 2: Gelöscht-Liste für den Abgleich zwischen Geräten

// store: [keyPath, [indexName, keyPath]...]
const STORES = {
  faecher: ['id'],
  lehrwerke: ['id', ['fachId', 'fachId']],
  units: ['id', ['lehrwerkId', 'lehrwerkId']],
  parts: ['id', ['unitId', 'unitId']],
  vokabeln: ['id', ['unitId', 'unitId'], ['partId', 'partId']],
  lernsaetze: ['id', ['unitId', 'unitId']],
  satzbau: ['id', ['unitId', 'unitId']],
  material: ['id', ['unitId', 'unitId']],          // später: Lückentexte, Arbeitsblätter
  importe: ['id'],
  profile: ['id'],
  lernstand: ['key', ['profilId', 'profilId'], ['vokabelId', 'vokabelId']],
  ereignisse: ['id', ['profilId', 'profilId']],
  termine: ['id', ['profilId', 'profilId']],
  tests: ['id', ['profilId', 'profilId']],
  belohnungen: ['profilId'],
  meta: ['key'],
  geloescht: ['key']   // „Grabsteine“: was wann gelöscht wurde, damit ein Abgleich es nicht zurückholt
};
export const INHALT_STORES = ['faecher', 'lehrwerke', 'units', 'parts', 'vokabeln', 'lernsaetze', 'satzbau', 'material'];
export const LERN_STORES = ['lernstand', 'ereignisse', 'termine', 'tests', 'belohnungen'];
/** Diese Speicher werden zwischen Geräten abgeglichen (Sicherung, QR-Übertragung, Cloud). */
export const SYNC_STORES = [...INHALT_STORES, 'profile', ...LERN_STORES];
export const SCHLUESSEL = Object.fromEntries(Object.entries(STORES).map(([n, [k]]) => [n, k]));
// Antworten (ereignisse) werden nur angehängt und nach 60 Tagen zusammengefasst – dafür keine Grabsteine
const OHNE_GRABSTEIN = new Set(['ereignisse']);
const jetzt = () => new Date().toISOString();

let dbPromise;
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, [keyPath, ...indexes]] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath });
        for (const [iname, ipath] of indexes) s.createIndex(iname, ipath);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank ist blockiert. Bitte alle anderen Tabs mit Vokabel-Studio schließen.'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function all(name) { return wrap((await store(name)).getAll()); }
export async function byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); }
// Jeder gespeicherte Eintrag eines Sync-Speichers bekommt den Änderungszeitpunkt _g; jedes Löschen einen Grabstein.
export async function put(name, value) { return batch([{ store: name, op: 'put', value }]); }
export async function del(name, key) { return batch([{ store: name, op: 'del', key }]); }
// Zählen und Schlüssel holen, ohne die ganzen Einträge zu laden (schneller bei vielen Vokabeln)
export async function count(name) { return wrap((await store(name)).count()); }
export async function countByIndex(name, index, value) { return wrap((await store(name)).index(index).count(value)); }
export async function keys(name) { return wrap((await store(name)).getAllKeys()); }
export async function keysByIndex(name, index, value) { return wrap((await store(name)).index(index).getAllKeys(value)); }

// Mehrere Schreibvorgänge in einer Transaktion: ops = [{store, op:'put'|'del', value|key}]
// roh: true = so übernehmen, wie es ist (beim Abgleich: fremde Zeitstempel behalten, keine neuen Grabsteine)
export async function batch(ops, { roh = false } = {}) {
  const db = await openDb();
  if (!roh) {
    const t = jetzt();
    const grabsteine = [];
    for (const o of ops) {
      if (!SYNC_STORES.includes(o.store)) continue;
      if (o.op === 'del') { if (!OHNE_GRABSTEIN.has(o.store)) grabsteine.push({ store: 'geloescht', op: 'put', value: { key: `${o.store}|${o.key}`, store: o.store, id: o.key, am: t } }); }
      else if (o.value && typeof o.value === 'object') o.value._g = t;
    }
    ops = [...ops, ...grabsteine];
  }
  const names = [...new Set(ops.map((o) => o.store))];
  if (!names.length) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'del') s.delete(o.key); else s.put(o.value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  });
}

export async function clearStores(names) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) { return put('meta', { key, value }); }

// Löschvorgänge für eine Unit (Inhalt, Einlese-Protokolle, Lernstände der Profile zu diesen Vokabeln)
async function unitLoeschOps(unitId) {
  const [parts, vokIds, saetze, satzbau, material, importe] = await Promise.all([
    keysByIndex('parts', 'unitId', unitId), keysByIndex('vokabeln', 'unitId', unitId),
    keysByIndex('lernsaetze', 'unitId', unitId), keysByIndex('satzbau', 'unitId', unitId),
    keysByIndex('material', 'unitId', unitId), all('importe')
  ]);
  const ops = [
    ...parts.map((key) => ({ store: 'parts', op: 'del', key })),
    ...vokIds.map((key) => ({ store: 'vokabeln', op: 'del', key })),
    ...saetze.map((key) => ({ store: 'lernsaetze', op: 'del', key })),
    ...satzbau.map((key) => ({ store: 'satzbau', op: 'del', key })),
    ...material.map((key) => ({ store: 'material', op: 'del', key })),
    ...importe.filter((i) => i.unitId === unitId).map((i) => ({ store: 'importe', op: 'del', key: i.id })),
    { store: 'units', op: 'del', key: unitId }
  ];
  ops.push(...(await lernstandOps(vokIds)));
  return ops;
}

async function lernstandOps(vokIds) {
  const lists = await Promise.all(vokIds.map((id) => keysByIndex('lernstand', 'vokabelId', id)));
  return lists.flat().map((key) => ({ store: 'lernstand', op: 'del', key }));
}

export async function deleteUnit(unitId) { return batch(await unitLoeschOps(unitId)); }

/** Buch mit allen Units, Vokabeln und Lernständen löschen */
export async function deleteLehrwerk(lehrwerkId) {
  const unitIds = await keysByIndex('units', 'lehrwerkId', lehrwerkId);
  const ops = (await Promise.all(unitIds.map(unitLoeschOps))).flat();
  ops.push({ store: 'lehrwerke', op: 'del', key: lehrwerkId });
  return batch(ops);
}

/** Part mit seinen Vokabeln löschen; Lernsätze/Satzbau des Parts bleiben (ohne Part-Zuordnung) */
export async function deletePart(partId) {
  const vokIds = await keysByIndex('vokabeln', 'partId', partId);
  const ops = [
    ...vokIds.map((key) => ({ store: 'vokabeln', op: 'del', key })),
    ...(await lernstandOps(vokIds)),
    { store: 'parts', op: 'del', key: partId }
  ];
  return batch(ops);
}

/** Lernstand eines Profils für bestimmte Vokabeln löschen (= wieder „neu“) */
export async function resetLernstand(profilId, vokIds) {
  const lists = await Promise.all(vokIds.map((id) => byIndex('lernstand', 'vokabelId', id)));
  const ops = lists.flat().filter((l) => l.profilId === profilId).map((l) => ({ store: 'lernstand', op: 'del', key: l.key }));
  if (ops.length) await batch(ops);
  return ops.length;
}
