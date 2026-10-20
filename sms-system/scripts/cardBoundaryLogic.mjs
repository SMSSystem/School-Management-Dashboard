// Finds dashboard cards that are not inside a <CardErrorBoundary>. Pure Node: the caller passes the
// source texts, so src/lib/__tests__/cardBoundaries.test.ts can use it on the app and on fixtures.
//
// A "card" is a JSX element whose component is imported from "@/components/..." (CardErrorBoundary
// itself excluded). Elements from other packages (react-router's Link, a plain <div>) are not cards.
import ts from 'typescript';

const BOUNDARY = 'CardErrorBoundary';
// components/StaffHomeSections.tsx puts every card it renders inside a CardErrorBoundary itself (HomeCell is the wrapper,
// the rows are made of HomeCells), so its exports count as boundaries here, not as unwrapped cards.
const WRAPPING_MODULE = '@/components/StaffHomeSections';

/**
 * @param {Map<string, string>} files path -> source text (parsed as TSX)
 * @returns {{ file: string, line: number, name: string }[]}
 */
export function findUnwrappedCards(files) {
  const found = [];
  for (const [file, text] of files) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const cards = new Set();
    const wrappers = new Set();
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text.startsWith('@/components/')) {
        const clause = st.importClause;
        const into = st.moduleSpecifier.text === WRAPPING_MODULE ? wrappers : cards;
        if (clause?.name) into.add(clause.name.text);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const e of clause.namedBindings.elements) into.add(e.name.text);
        }
      }
    }
    cards.delete(BOUNDARY);

    (function visit(node, inBoundary) {
      let here = inBoundary;
      const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
      if (opening && ts.isIdentifier(opening.tagName)) {
        const name = opening.tagName.text;
        if (name === BOUNDARY || wrappers.has(name)) here = true;
        else if (cards.has(name) && !inBoundary) {
          found.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, name });
        }
      }
      ts.forEachChild(node, (c) => visit(c, here));
    })(sf, false);
  }
  return found;
}
