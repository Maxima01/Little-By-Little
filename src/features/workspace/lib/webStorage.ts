import type { StorageAdapter } from './saveHistory.ts';

const STORAGE_KEY = 'little-by-little.workspace.v1';
const DRAFT_KEY = `${STORAGE_KEY}.draft`;

// IndexedDB holds the durable record; localStorage holds only the short-lived crash draft.
// Keeping the adapter outside React lets recovery and stale-window writes be tested directly.
export function createWebStorageAdapter(factory: IDBFactory, drafts: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): StorageAdapter {
  let databasePromise: Promise<IDBDatabase> | undefined;
  // Reuses the original database schema and permits retrying after an open failure.
  function database(): Promise<IDBDatabase> {
    if (!databasePromise) {
      databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('little-by-little', 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open the local story library.'));
      }).catch((error) => { databasePromise = undefined; throw error; });
    }
    return databasePromise;
  }
  // Reads the last committed record without touching its contents.
  async function read(): Promise<string | null> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction('workspace', 'readonly').objectStore('workspace').get(STORAGE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the local story library.'));
    });
  }
  // Compares and writes inside one transaction; a newer window's commit aborts a stale write.
  async function write(value: string, expected?: string | null, key = STORAGE_KEY): Promise<void> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace');
      let failure: Error | undefined;
      const request = store.get(key);
      request.onsuccess = () => {
        if (expected !== undefined && (request.result ?? null) !== expected) {
          failure = new Error('Another window saved newer work. Download a backup of your open changes, then reload this window.');
          transaction.abort();
        } else store.put(value, key);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('Could not save the local story library.'));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Saving the local story library was interrupted.'));
    });
  }
  return {
    read, write,
    quarantine: (value) => write(value, undefined, `${STORAGE_KEY}.damaged.${Date.now()}`),
    // A blocked draft store must not prevent opening a healthy primary database.
    readDraft: () => { try { return drafts.getItem(DRAFT_KEY); } catch { return null; } },
    writeDraft: (value) => drafts.setItem(DRAFT_KEY, value),
    // Finishing one window's save must not erase a different window's pending recovery copy.
    clearDraft: (id) => { if (JSON.parse(drafts.getItem(DRAFT_KEY) ?? 'null')?.id === id) drafts.removeItem(DRAFT_KEY); },
  };
}
