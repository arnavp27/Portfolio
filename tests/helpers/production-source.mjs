import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Executes named production handlers in small DOM/Three.js test boundaries.
 * Parse the syntax tree instead of slicing source at whitespace-sensitive markers:
 * formatting and declaration order must not change what a regression test runs.
 */
export function productionSource(url) {
  const source = ts.createSourceFile(
    url.pathname,
    readFileSync(url, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    url.pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  assert.equal(source.parseDiagnostics.length, 0, `Cannot parse ${url.pathname}`);
  const printer = ts.createPrinter();
  function scope(name) {
    let statements = source.statements,
      body;
    for (const part of name.split('.')) {
      const found = statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === part,
      );
      assert(found?.body, `Missing production function ${name} in ${url.pathname}`);
      body = found.body;
      statements = body.statements;
    }
    return body;
  }
  function nodesWithin(root, predicate) {
    const matches = [];
    function visit(node) {
      if (predicate(node)) matches.push(node);
      ts.forEachChild(node, visit);
    }
    visit(root);
    return matches;
  }
  return {
    declarations(functionName, names) {
      const body = scope(functionName);
      const declarations = names.map((name) => {
        for (const statement of body.statements) {
          if (ts.isFunctionDeclaration(statement) && statement.name?.text === name)
            return statement;
          if (ts.isVariableStatement(statement)) {
            const declaration = statement.declarationList.declarations.find(
              (node) => ts.isIdentifier(node.name) && node.name.text === name,
            );
            if (declaration)
              return ts.factory.createVariableStatement(
                statement.modifiers,
                ts.factory.createVariableDeclarationList(
                  [declaration],
                  statement.declarationList.flags,
                ),
              );
          }
        }
        assert.fail(`Missing production declaration ${functionName}.${name}`);
      });
      return ts.transpileModule(
        declarations
          .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source))
          .join('\n'),
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
      ).outputText;
    },
    assertListener(functionName, event, handler) {
      const calls = nodesWithin(scope(functionName), ts.isCallExpression);
      assert(
        calls.some(
          (node) =>
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'addEventListener' &&
            ts.isStringLiteral(node.arguments[0]) &&
            node.arguments[0].text === event &&
            ts.isIdentifier(node.arguments[1]) &&
            node.arguments[1].text === handler,
        ),
        `Production ${functionName} must bind ${event} to ${handler}`,
      );
    },
    assertCall(functionName, callee) {
      const calls = nodesWithin(scope(functionName), ts.isCallExpression);
      assert(
        calls.some((node) => ts.isIdentifier(node.expression) && node.expression.text === callee),
        `Production ${functionName} must call ${callee}`,
      );
    },
  };
}

/** Compile a React-only component without importing browser/CSS entry points. */
export function productionReactComponent(url, createElement, Fragment) {
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    fileName: url.pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'createElement',
      jsxFragmentFactory: 'Fragment',
    },
  });
  const exports = {};
  Function('createElement', 'Fragment', 'exports', outputText)(createElement, Fragment, exports);
  assert.equal(typeof exports.default, 'function', 'Expected a default React component');
  return exports.default;
}
