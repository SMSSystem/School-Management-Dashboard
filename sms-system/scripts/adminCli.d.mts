// Types for adminCli.mjs, so the TypeScript tests can import it.
export function usageExit(usage: string): (code: number) => never;
export function requireKeyPath(optionPath: string | null | undefined): string;
