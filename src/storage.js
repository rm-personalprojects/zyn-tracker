// On-device storage. Replaces the artifact's window.storage with localStorage.
// Everything lives under keys starting with "zyn-", which is also what backups contain.

const PREFIX = 'zyn-';

export function getJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Returns false if the write failed (storage full or blocked). */
export function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage write failed', key, e);
    return false;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

export function listKeys(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
}

export function buildBackup() {
  const data = {};
  for (const k of listKeys(PREFIX)) data[k] = getJSON(k, null);
  return { app: 'zyn-tracker', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Replaces all tracker data with a backup. Throws with a readable message if the file isn't one. */
export function restoreBackup(backup) {
  if (!backup || backup.app !== 'zyn-tracker' || typeof backup.data !== 'object') {
    throw new Error("That file isn't a Zyn Tracker backup.");
  }
  const entries = Object.entries(backup.data).filter(([k]) => k.startsWith(PREFIX));
  for (const k of listKeys(PREFIX)) removeKey(k);
  for (const [k, v] of entries) setJSON(k, v);
  return entries.length;
}
