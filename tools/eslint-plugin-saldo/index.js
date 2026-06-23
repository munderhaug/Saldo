/**
 * eslint-plugin-saldo — project-local rules that enforce hard domain invariants.
 *
 * no-money-arithmetic: forbids `+ - * /` (and their compound assignments) when an operand is
 * the branded `Øre` type. Money must be combined via addØre/subØre/mulRate/roundØre.
 *
 * Requires type information (the flat config enables `projectService`). If type info is
 * unavailable for a node the rule conservatively does nothing — the type system + code review
 * remain the backstop.
 */

const ARITHMETIC = new Set(['+', '-', '*', '/', '%']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=']);

/** Heuristic: does this resolved TS type refer to the `Øre` brand? */
function isØreType(type, checker) {
  if (!type) return false;
  try {
    const text = checker.typeToString(type);
    if (text.includes('Øre')) return true;
    // Intersection brand: number & { __brand: 'øre' }
    const types = type.types ?? [type];
    return types.some((t) => {
      const sym = t.getProperty?.('__brand');
      return Boolean(sym);
    });
  } catch {
    return false;
  }
}

const noMoneyArithmetic = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw arithmetic on Øre money; use the domain helpers.' },
    schema: [],
    messages: {
      banned:
        'Raw `{{op}}` on money (Øre) is forbidden. Use addØre/subØre/mulRate/roundØre from @saldo/domain.',
    },
  },
  create(context) {
    const services = context.sourceCode?.parserServices ?? context.parserServices;
    const checker = services?.program?.getTypeChecker?.();
    if (!checker || !services?.esTreeNodeToTSNodeMap) return {};

    const typeOf = (node) => {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      return tsNode ? checker.getTypeAtLocation(tsNode) : undefined;
    };

    function check(node, op, left, right) {
      if (isØreType(typeOf(left), checker) || isØreType(typeOf(right), checker)) {
        context.report({ node, messageId: 'banned', data: { op } });
      }
    }

    return {
      BinaryExpression(node) {
        if (ARITHMETIC.has(node.operator)) check(node, node.operator, node.left, node.right);
      },
      AssignmentExpression(node) {
        if (COMPOUND.has(node.operator)) check(node, node.operator, node.left, node.right);
      },
    };
  },
};

// ── Design-system rules (syntactic; no type info needed) ─────────────────────
// Enforce "tokens, not literals" and the semantic-colour set on JSX className strings, so the FIRST
// component written is already held to the bar (the UI lands soon). See .claude/rules/design-system.md.

// Functions whose string arguments are Tailwind class lists (shadcn idiom).
const CLASS_FNS = new Set(['cn', 'clsx', 'cx', 'cva', 'tv', 'twMerge', 'classNames', 'classnames']);
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_PREFIX =
  'bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent|shadow';
// A raw colour utility that bypasses the semantic tokens: pure black/white or a numbered palette shade.
const RAW_COLOR = new RegExp(`^(${COLOR_PREFIX})-(black|white|(${PALETTE})-\\d{1,3})(\\/\\d+)?$`);
// An arbitrary VALUE/property like bg-[#fff], h-[100vh], text-[13px], [mask-type:luminance] — where
// the bracket group is NOT immediately followed by `:`. Arbitrary VARIANT selectors (a legitimate
// shadcn idiom: `[&_tr]:border-b`, `group-[.open]:block`, `data-[state=open]:bg-muted`) end the
// bracket with `:` and are allowed — those style children/state, they don't hardcode a value.
const ARBITRARY = /\[[^\]]+\](?!:)/;

/** Strip Tailwind variant modifiers (hover:, dark:, md:, focus-visible:) and a leading `!`. */
function baseUtility(token) {
  const u = token.slice(token.lastIndexOf(':') + 1);
  return u.startsWith('!') ? u.slice(1) : u;
}

/** Collect class-list strings from a node: literals, template quasis, and nested cn/cva structures. */
function collectClassStrings(node, out, depth = 0) {
  if (!node || depth > 6) return;
  if (node.type === 'Literal' && typeof node.value === 'string') out.push([node.value, node]);
  else if (node.type === 'TemplateLiteral')
    for (const q of node.quasis) out.push([q.value.cooked ?? q.value.raw, node]);
  else if (node.type === 'ArrayExpression')
    for (const el of node.elements) collectClassStrings(el, out, depth + 1);
  else if (node.type === 'ObjectExpression')
    for (const p of node.properties) collectClassStrings(p.value, out, depth + 1);
  else if (node.type === 'ConditionalExpression') {
    collectClassStrings(node.consequent, out, depth + 1);
    collectClassStrings(node.alternate, out, depth + 1);
  } else if (node.type === 'LogicalExpression') collectClassStrings(node.right, out, depth + 1);
}

/** Build a rule that tests each whitespace-separated class token in every className/cn(...) string. */
function classRule(description, messageId, message, test) {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      schema: [],
      messages: { [messageId]: message },
    },
    create(context) {
      const scan = (strings) => {
        for (const [value, node] of strings)
          for (const token of value.split(/\s+/))
            if (token && test(token)) context.report({ node, messageId, data: { token } });
      };
      return {
        JSXAttribute(node) {
          const name = node.name?.name;
          if (name !== 'className' && name !== 'class') return;
          const out = [];
          const v = node.value;
          if (v?.type === 'Literal') collectClassStrings(v, out);
          else if (v?.type === 'JSXExpressionContainer') collectClassStrings(v.expression, out);
          scan(out);
        },
        CallExpression(node) {
          if (node.callee?.type !== 'Identifier' || !CLASS_FNS.has(node.callee.name)) return;
          const out = [];
          for (const arg of node.arguments) collectClassStrings(arg, out);
          scan(out);
        },
      };
    },
  };
}

const noArbitraryTailwind = classRule(
  'Disallow arbitrary Tailwind values in className; use theme tokens.',
  'arbitrary',
  'Arbitrary Tailwind value `{{token}}` bypasses the token system. Add a token in app.css and use it (.claude/rules/design-system.md).',
  (token) => ARBITRARY.test(token),
);

const noRawColorUtility = classRule(
  'Disallow raw Tailwind colour utilities; use the semantic tokens.',
  'rawColor',
  'Raw colour `{{token}}` bypasses the semantic tokens. Use bg-background / text-foreground / text-paid / text-overdue / etc. (.claude/rules/design-system.md).',
  (token) => RAW_COLOR.test(baseUtility(token)),
);

export default {
  meta: { name: 'eslint-plugin-saldo' },
  rules: {
    'no-money-arithmetic': noMoneyArithmetic,
    'no-arbitrary-tailwind': noArbitraryTailwind,
    'no-raw-color-utility': noRawColorUtility,
  },
};
