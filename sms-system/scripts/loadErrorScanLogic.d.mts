// Types for loadErrorScanLogic.mjs, so the TypeScript tests can import it.

export interface UnhandledLoad {
  /** listener: onSnapshot with no error callback; chain: a read chained without a rejection handler; async: an async call that awaits a read outside any try/catch */
  category: 'listener' | 'chain' | 'async';
  file: string;
  /** 1-based */
  line: number;
  /** the source line, trimmed */
  text: string;
}

export function findUnhandledLoads(files: Map<string, string>): UnhandledLoad[];
