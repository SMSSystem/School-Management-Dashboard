// Types for maxLinesLogic.mjs, so the TypeScript tests can import it.

export interface AllowListRow {
  file: string;
  cap: number;
  exists: boolean;
  /** lines the max-lines rule counts; null when the file is gone */
  size: number | null;
}

export function measureAllowList(allowList: Record<string, number>): Promise<AllowListRow[]>;
