// Small IndexedDB helpers shared by the stores that keep data on the device (noteFileStore.ts, offline/offlineStore.ts).

/** A request's result, as a promise. */
export const idbDone = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Opens a database, creating its object stores (each keyed on `keyPath`) the first time. */
export function openIndexedDb(
  name: string,
  stores: string[],
  keyPath: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      for (const store of stores)
        request.result.createObjectStore(store, { keyPath });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}
