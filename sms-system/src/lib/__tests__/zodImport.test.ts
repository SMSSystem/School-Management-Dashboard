import { describe, expect, it, vi } from 'vitest';
import { z } from '../zod';
import { readSourceTexts } from '../../../scripts/readSourcesLogic.mjs';

// Zod 4 probes with `new Function("")` whether it may compile object parsers, and a Content-Security-Policy
// without 'unsafe-eval' reports that probe on every page that builds a schema (vercel.json). lib/zod.ts turns the
// compiled parsers off and is the only place the app imports zod from.

describe('lib/zod', () => {
  it('is the only module that imports zod', () => {
    const importers = [...readSourceTexts(['src'])]
      .filter(([, text]) => /from ['"]zod['"]/.test(text))
      .map(([file]) => file.slice(file.indexOf('/src/') + 1));
    expect(importers).toEqual(['src/lib/zod.ts']);
  });

  it('builds and parses an object schema without ever asking the browser to compile code', () => {
    const calls: unknown[][] = [];
    const RealFunction = globalThis.Function;
    const Spy = new Proxy(RealFunction, {
      construct(target, args) {
        calls.push(args);
        return Reflect.construct(target, args);
      },
      apply(target, thisArg, args) {
        calls.push(args);
        return Reflect.apply(target, thisArg, args);
      },
    });
    vi.stubGlobal('Function', Spy);
    try {
      const schema = z.object({ name: z.string().min(1), age: z.coerce.number().min(0) });
      expect(schema.parse({ name: 'Ann', age: '12' })).toEqual({ name: 'Ann', age: 12 });
      expect(schema.safeParse({ name: '', age: 1 }).success).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls).toEqual([]);
  });
});
