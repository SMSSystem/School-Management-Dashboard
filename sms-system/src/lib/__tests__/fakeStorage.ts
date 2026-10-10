// Minimal in-memory Storage for the node test environment (no DOM). Shared by the
// browser-storage tests; implements the subset the app code uses.
export function createFakeStorage(): Storage & { dump(): Record<string, string> } {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
    dump: () => Object.fromEntries(store),
  };
  return fake as unknown as Storage & { dump(): Record<string, string> };
}
