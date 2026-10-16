const acorn = require('acorn');

function findObject(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  for (const child of Object.values(root)) {
    const found = findObject(child, predicate);
    if (found) return found;
  }
  return null;
}

// Parse only JSON records in React's server stream. Never evaluate page scripts.
function acbData(html, type) {
  const records = Object.create(null);
  const parts = [];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)) {
    try { const part = JSON.parse(match[1]); if (typeof part[1] === 'string') parts.push(part[1]); } catch { /* Non-data chunk. */ }
  }
  for (const line of parts.join('').split('\n')) {
    const match = line.match(/^([a-f\d]+):(.*)$/);
    if (match) { try { records[match[1]] = JSON.parse(match[2]); } catch { /* Not a JSON model. */ } }
  }
  const root = findObject(records, x => x.selectedFilters && Array.isArray(x[type]));
  if (!root) throw new Error('ACB data format changed');
  function resolve(value, depth = 0) {
    if (depth > 80) throw new Error('ACB reference nesting');
    if (typeof value === 'string') {
      const ref = value.match(/^\$([a-f\d]+)(?::(.+))?$/);
      if (!ref) return value;
      let target = records[ref[1]];
      for (const key of (ref[2] || '').split(':').filter(Boolean)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid reference');
        target = key === 'props' && Array.isArray(target) && target[0] === '$' ? target[3] : target?.[key];
      }
      if (target === undefined) throw new Error('Missing ACB reference');
      return resolve(target, depth + 1);
    }
    if (Array.isArray(value)) return value.map(x => resolve(x, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, depth + 1)]));
    return value;
  }
  return resolve(root);
}

// TanStack's SSR payload is an object/array graph. Interpret a strict data-only
// AST subset; calls, functions, global access and arbitrary property writes fail.
function febData(html) {
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.startsWith('$_TSR.router='));
  if (!script) throw new Error('FEB SSR payload missing');
  const expression = acorn.parseExpressionAt(script, script.indexOf('=') + 1, { ecmaVersion: 2022 });
  if (expression.type !== 'CallExpression' || expression.callee.type !== 'ArrowFunctionExpression' || expression.callee.params[0]?.name !== '$R') throw new Error('Unexpected FEB SSR wrapper');
  const refs = Object.create(null);
  let count = 0;
  function evaluate(n) {
    if (++count > 150000) throw new Error('FEB payload too complex');
    if (n.type === 'Literal') return n.value;
    if (n.type === 'Identifier' && n.name === 'undefined') return undefined;
    if (n.type === 'ArrayExpression') return n.elements.map(x => x ? evaluate(x) : null);
    if (n.type === 'ObjectExpression') {
      const value = Object.create(null);
      for (const p of n.properties) {
        if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init') throw new Error('Non-data property');
        const key = p.key.name ?? p.key.value;
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid data key');
        value[key] = evaluate(p.value);
      }
      return value;
    }
    if (n.type === 'UnaryExpression' && ['!', '-', 'void'].includes(n.operator)) {
      const value = evaluate(n.argument);
      return n.operator === '!' ? !value : n.operator === '-' ? -value : undefined;
    }
    function refIndex(node) {
      if (node.type !== 'MemberExpression' || node.object.name !== '$R' || !node.computed || node.property.type !== 'Literal' || !Number.isInteger(node.property.value)) throw new Error('Invalid data reference');
      return node.property.value;
    }
    if (n.type === 'MemberExpression') return refs[refIndex(n)];
    if (n.type === 'AssignmentExpression' && n.operator === '=') {
      const index = refIndex(n.left);
      return (refs[index] = evaluate(n.right));
    }
    throw new Error('Unsupported FEB data syntax: ' + n.type);
  }
  return evaluate(expression.callee.body);
}

function febQueries(html) {
  const root = febData(html);
  return Object.values(root.dehydratedData || {}).flatMap(x => x.queries || []);
}

module.exports = { acbData, febData, febQueries, findObject };
