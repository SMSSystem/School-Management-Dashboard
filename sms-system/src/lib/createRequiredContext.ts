import { createContext, useContext } from 'react';

/**
 * Factory for a React context that must be supplied by a provider higher up
 * the tree — reading it outside that provider throws instead of silently
 * returning null/undefined. SidebarContext.tsx and CurrentTermContext.tsx
 * previously each hand-rolled this same createContext/useContext/"must be
 * used within provider" boilerplate independently; this is the shared form.
 */
export function createRequiredContext<T>(hookName: string, providerDescription: string) {
  const Context = createContext<T | null>(null);

  function useRequiredContext(): T {
    const ctx = useContext(Context);
    if (!ctx) throw new Error(`${hookName} must be used within ${providerDescription}`);
    return ctx;
  }

  return [Context, useRequiredContext] as const;
}
