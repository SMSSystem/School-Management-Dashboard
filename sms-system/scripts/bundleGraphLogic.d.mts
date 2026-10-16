// Types for bundleGraphLogic.mjs, so the TypeScript tests can import it.

export interface StaticGraph {
  entry: string;
  /** 'src/lib/foo.ts' -> source text */
  files: Map<string, string>;
  /** reachable file -> the file that first reached it (null for the entry) */
  parent: Map<string, string | null>;
  /** npm package -> reachable files that import it statically */
  packageImporters: Map<string, Set<string>>;
  /** module specifiers a file imports statically and that survive into the bundle */
  staticImports(file: string): string[];
}

export function buildStaticGraph(options?: { srcDir?: string; entry?: string }): StaticGraph;
export function chainTo(graph: StaticGraph, file: string): string;
export function offendersFor(graph: StaticGraph, pkg: string): string[];
