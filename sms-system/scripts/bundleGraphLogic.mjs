// The static import graph of the app source, starting from src/main.tsx. Pure Node (no I/O
// beyond reading src), so src/lib/__tests__/bundleBoundaries.test.ts can import it.
//
// What the first page load downloads is everything main.tsx reaches through static imports;
// code behind `import()` / React.lazy is fetched only when it is needed. The TypeScript parser
// is used (not a regex), so `import type`, inline `{ type X }` imports and `import()` calls are
// left out, as the bundler leaves them out.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEFAULT_SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

function normalize(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * @param {{ srcDir?: string, entry?: string }} [options] entry is a key like 'src/main.tsx'
 */
export function buildStaticGraph({ srcDir = DEFAULT_SRC_DIR, entry = 'src/main.tsx' } = {}) {
  // 'src/lib/foo.ts' -> source text (tests and type declarations are not part of the bundle)
  const files = new Map();
  (function load(dir, rel) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (item.name !== '__tests__') load(join(dir, item.name), `${rel}/${item.name}`);
      } else if ((item.name.endsWith('.ts') || item.name.endsWith('.tsx')) && !item.name.endsWith('.d.ts')) {
        files.set(`${rel}/${item.name}`, readFileSync(join(dir, item.name), 'utf8'));
      }
    }
  })(srcDir, 'src');

  function resolveLocal(spec, from) {
    let base;
    if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
    else if (spec.startsWith('.')) base = normalize(from.split('/').slice(0, -1).join('/') + '/' + spec);
    else return null;
    for (const candidate of [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) {
      if (files.has(candidate)) return candidate;
    }
    return null;
  }

  // Module specifiers a file imports statically and that survive into the bundle.
  function staticImports(file) {
    const text = files.get(file) ?? '';
    const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
    const specs = [];
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const clause = st.importClause;
        if (clause?.isTypeOnly) continue;
        const named = clause?.namedBindings;
        const onlyInlineTypes =
          !!clause &&
          !clause.name &&
          !!named &&
          ts.isNamedImports(named) &&
          named.elements.length > 0 &&
          named.elements.every((e) => e.isTypeOnly);
        if (onlyInlineTypes) continue;
        specs.push(st.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(st) &&
        !st.isTypeOnly &&
        st.moduleSpecifier &&
        ts.isStringLiteral(st.moduleSpecifier)
      ) {
        specs.push(st.moduleSpecifier.text);
      }
    }
    return specs;
  }

  // file -> the file that first reached it (used to print a chain when a rule fails)
  const parent = new Map([[entry, null]]);
  // npm package -> the reachable files that import it
  const packageImporters = new Map();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    for (const spec of staticImports(file)) {
      const local = resolveLocal(spec, file);
      if (local) {
        if (!parent.has(local)) {
          parent.set(local, file);
          queue.push(local);
        }
      } else if (!spec.startsWith('.') && !spec.startsWith('@/')) {
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!packageImporters.has(pkg)) packageImporters.set(pkg, new Set());
        packageImporters.get(pkg).add(file);
      }
    }
  }

  return { entry, files, parent, packageImporters, staticImports };
}

/** 'main.tsx > App.tsx > ...' from the entry down to `file`. */
export function chainTo(graph, file) {
  const chain = [];
  for (let f = file; f; f = graph.parent.get(f)) chain.push(f.replace(/^src\//, ''));
  return chain.reverse().join(' > ');
}

/** One line per reachable file that imports `pkg` statically, each with the chain that reaches it. */
export function offendersFor(graph, pkg) {
  return [...(graph.packageImporters.get(pkg) ?? [])].map((f) => `${pkg} <- ${chainTo(graph, f)}`);
}
