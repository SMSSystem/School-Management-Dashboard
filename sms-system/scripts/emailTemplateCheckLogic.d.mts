// Types for emailTemplateCheckLogic.mjs, so the TypeScript tests can import it.

export const EMAIL_TEMPLATE_VARIABLES: string[];
export const REQUIRED_VARIABLES: string[];
export const MAX_TEMPLATE_BYTES: number;
export const MUSTACHE_RULE: string;
export function escapeHtml(value: unknown): string;
export function renderVariables(html: string, params: Record<string, unknown>): string;
export function findTemplateProblems(
  html: string,
  allowedVariables?: string[],
  options?: { allowSections?: boolean },
): string[];
