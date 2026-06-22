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

export default {
  meta: { name: 'eslint-plugin-saldo' },
  rules: { 'no-money-arithmetic': noMoneyArithmetic },
};
