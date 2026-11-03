export const READS_PATH: string;
export const WRITES_PATH: string;

export type PauseArgs = {
  key: string | null;
  project: string | null;
  databaseUrl: string | null;
  reads: boolean | undefined;
  writes: boolean | undefined;
  apply: boolean;
};

export function parseArgs(argv: string[]): PauseArgs;
export function planUpdate(switches: { reads?: boolean; writes?: boolean }): Record<string, true | null>;
export function describeSwitch(value: unknown): string;
