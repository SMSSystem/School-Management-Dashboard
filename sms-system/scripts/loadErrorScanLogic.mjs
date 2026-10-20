// Finds the places where a Firestore read or listener has no way to fail. Pure Node: the caller
// passes the source texts, so src/lib/__tests__/loadErrorHandling.test.ts can use it on the app and
// on small fixtures. The TypeScript parser is used (not a regex).
//
// A site is reported when:
//   listener  onSnapshot(...) has no error callback.
//   chain     a statement starts a read and chains on it (.then / .finally) with neither .catch(...)
//             nor .then(onFulfilled, onRejected). A read is getDoc/getDocs, a fetchSomething()
//             cached-read helper (fetchInstitutionClasses, fetchUserPhotoUrl, ...),
//             queryClient.fetchQuery, or Promise.all/race/any of those.
//   async     a statement calls an async function (or is an async IIFE) that awaits a read outside
//             any try/catch, and neither catches nor awaits the result.
//
// What it cannot see: an async event handler (onClick={async () => ...}) or a function imported from
// another file; the unhandled-error listener in lib/reportError.ts is the net for those.
import ts from 'typescript';

const CHAIN_METHODS = new Set(['then', 'catch', 'finally']);
const COMBINATORS = new Set(['all', 'race', 'any']);
const READ_CALL = /\b(getDocs?|fetch[A-Z]\w*)\(/;

const isReadName = (name) => name === 'getDoc' || name === 'getDocs' || /^fetch[A-Z]/.test(name);
const isFunctionLike = (n) =>
  ts.isArrowFunction(n) || ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
const isAsync = (n) => isFunctionLike(n) && !!n.modifiers && n.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

function stripWrappers(expr) {
  while (ts.isParenthesizedExpression(expr) || ts.isVoidExpression(expr)) expr = expr.expression;
  return expr;
}

/** a(b).then(c).finally(d): whether a rejection is handled, and the call the chain starts from. */
function analyseChain(expr) {
  let handled = false;
  let cur = expr;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && CHAIN_METHODS.has(cur.expression.name.text)) {
    const method = cur.expression.name.text;
    if (method === 'catch' || (method === 'then' && cur.arguments.length >= 2)) handled = true;
    cur = cur.expression.expression;
  }
  return { handled, root: cur, chained: cur !== expr };
}

/** Is this call a read: getDoc(s), a fetchX() helper, queryClient.fetchQuery, or Promise.all of reads. */
function isReadCall(call) {
  if (!ts.isCallExpression(call)) return false;
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return isReadName(callee.text);
  if (ts.isPropertyAccessExpression(callee)) {
    if (callee.name.text === 'fetchQuery') return true;
    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Promise' && COMBINATORS.has(callee.name.text)) {
      return READ_CALL.test(call.getText());
    }
  }
  return false;
}

/** Does this async function await a read that no try/catch inside it covers? */
function awaitsUnprotectedRead(fn) {
  let found = false;
  const visit = (n, inTry) => {
    if (found) return;
    if (n !== fn && isFunctionLike(n) && !isAsync(n)) return;
    if (ts.isTryStatement(n) && n.catchClause) {
      visit(n.tryBlock, true);
      visit(n.catchClause, inTry);
      if (n.finallyBlock) visit(n.finallyBlock, inTry);
      return;
    }
    if (ts.isCallExpression(n)) {
      const chain = analyseChain(n);
      if (chain.chained && chain.handled && isReadCall(chain.root)) {
        // await getDocs(q).catch(h): the rejection is handled here, so the read is covered; only the
        // callbacks (.then(a), .catch(h)) can still hold another, unprotected read.
        for (let cur = n; ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && CHAIN_METHODS.has(cur.expression.name.text); cur = cur.expression.expression) {
          cur.arguments.forEach((a) => visit(a, inTry));
        }
        return;
      }
    }
    if (ts.isCallExpression(n) && !inTry && isReadCall(n) && !(ts.isPropertyAccessExpression(n.expression) && COMBINATORS.has(n.expression.name.text))) {
      found = true;
      return;
    }
    ts.forEachChild(n, (c) => visit(c, inTry));
  };
  visit(fn, false);
  return found;
}

/**
 * @param {Map<string, string>} files path -> source text (a .tsx path is parsed as TSX)
 * @returns {{ category: 'listener' | 'chain' | 'async', file: string, line: number, text: string }[]}
 */
export function findUnhandledLoads(files) {
  const sites = [];
  for (const [file, text] of files) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lines = text.split('\n');
    const add = (category, node) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      sites.push({ category, file, line, text: (lines[line - 1] ?? '').trim().slice(0, 110) });
    };

    // async functions declared in this file that await an unprotected read
    const unprotected = new Set();
    (function collect(n) {
      if (ts.isFunctionDeclaration(n) && n.name && isAsync(n) && awaitsUnprotectedRead(n)) unprotected.add(n.name.text);
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isAsync(n.initializer) && awaitsUnprotectedRead(n.initializer)) {
        unprotected.add(n.name.text);
      }
      ts.forEachChild(n, collect);
    })(sf);

    (function visit(n) {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'onSnapshot') {
        const args = n.arguments;
        const withErrorCallback =
          args.length >= 4 ||
          (args.length === 3 && !ts.isObjectLiteralExpression(args[1])) ||
          (args.length === 2 &&
            ts.isObjectLiteralExpression(args[1]) &&
            args[1].properties.some((p) => p.name && p.name.getText() === 'error'));
        if (!withErrorCallback) add('listener', n);
      }

      if (ts.isExpressionStatement(n)) {
        const expr = stripWrappers(n.expression);
        if (ts.isCallExpression(expr)) {
          const { handled, root, chained } = analyseChain(expr);
          if (!handled) {
            if (chained && isReadCall(root)) {
              add('chain', n);
            } else if (ts.isCallExpression(root)) {
              let callee = root.expression;
              while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
              if (isAsync(callee) && awaitsUnprotectedRead(callee)) add('async', n);
              else if (ts.isIdentifier(callee) && unprotected.has(callee.text)) add('async', n);
            }
          }
        }
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  return sites;
}
