/**
 * Scans a Storage object (localStorage/sessionStorage) for keys starting
 * with `prefix` and removes those for which `shouldRemove` returns true
 * (defaults to removing every matching key). Matches are collected before
 * any removal so deleting doesn't reindex the storage object mid-scan.
 *
 * Shared by filterPersistence.ts's clearAllPersistedFilters() (unconditional
 * removal, sessionStorage) and attendanceDraft.ts's purgeExpiredDrafts()
 * (date-conditional removal, localStorage), which each independently
 * re-implemented this same prefix-scan-and-delete pattern.
 */
export function removeStorageKeysByPrefix(
  storage: Storage,
  prefix: string,
  shouldRemove: (key: string) => boolean = () => true,
): void {
  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix) && shouldRemove(key)) toRemove.push(key);
  }
  toRemove.forEach((key) => storage.removeItem(key));
}
