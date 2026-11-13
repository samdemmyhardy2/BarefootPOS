/** Read-only copies of the last successful GET responses, kept in IndexedDB for offline viewing. */
const DB_NAME = "restaurant-offline";
const STORE = "responses";
const CHANGE_EVENT = "restaurant-offline-view";

type Entry = { data: unknown; savedAt: string };

/** Live status, device discovery, and stream tokens are useless or misleading when stale. /orders has its own fresher cache in the order store. */
const SKIPPED = [/^\/orders\/?$/, /^\/orders\/events\//, /^\/technical\//, /^\/network\//];

export function cacheable(path: string) {
  const clean = path.split("?")[0];
  return !SKIPPED.some((pattern) => pattern.test(clean));
}

let opening: Promise<IDBDatabase> | null = null;
function open() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => { opening = null; });
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function saveResponse(key: string, data: unknown) {
  try {
    await run("readwrite", (store) => store.put({ data, savedAt: new Date().toISOString() } satisfies Entry, key));
  } catch { /* Offline viewing is best effort; the live response was already delivered. */ }
}

export async function readResponse(key: string) {
  try {
    return (await run<Entry | undefined>("readonly", (store) => store.get(key))) ?? null;
  } catch {
    return null;
  }
}

/** Called on sign-in and sign-out so one person's saved data is never shown to another. */
export async function clearOfflineCache() {
  try {
    await run("readwrite", (store) => store.clear());
  } catch { /* Nothing was saved. */ }
  setSavedView(null);
}

let savedSince: string | null = null;

/** Oldest save time among the saved copies currently on screen, or null when the data is live. */
export function savedViewSince() {
  return savedSince;
}

export function setSavedView(savedAt: string | null) {
  const next = savedAt && savedSince && savedSince < savedAt ? savedSince : savedAt;
  if (next === savedSince) return;
  savedSince = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function watchSavedView(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
