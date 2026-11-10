import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error -- Oxlint plugins are plain JavaScript.
import pluginModule from './oxlint-rules.mjs';

type Rule = {
  create: (context: unknown) => Record<string, (node: unknown) => void>;
};

type Plugin = {
  rules: Record<string, Rule>;
};

const plugin = pluginModule as Plugin;

function getVisitors(
  rule: Rule,
  context: unknown,
): Record<string, (node: unknown) => void> {
  return rule.create(context);
}

const getRule = (name: string): Rule => plugin.rules[name] as Rule;

describe('oxlint rules', () => {
  it('reports enums', () => {
    const context = { report: vi.fn() };
    getVisitors(getRule('no-enum'), context).TSEnumDeclaration?.({});

    expect(context.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noEnum' }),
    );
  });

  it.each(['no-with-statement', 'no-in-operator', 'no-sequence-expression'])(
    'reports disallowed syntax with %s',
    (ruleName) => {
      const context = { report: vi.fn() };
      const visitors = getVisitors(getRule(ruleName), context);
      Object.values(visitors)[0]?.({});

      expect(context.report).toHaveBeenCalledOnce();
    },
  );

  it('reports private accessibility modifiers', () => {
    const context = { report: vi.fn() };
    const visitors = getVisitors(getRule('no-private-accessibility'), context);
    Object.values(visitors)[0]?.({});

    expect(context.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'noPrivateAccessibility' }),
    );
  });

  it('reports :stateChange subscriptions and delegations', () => {
    const context = { report: vi.fn() };
    const visitors = getVisitors(getRule('no-state-change-events'), context);

    visitors[
      'CallExpression[callee.property.name="subscribe"] > Literal[value=/^.+:stateChange$/]'
    ]?.({});
    visitors[
      'CallExpression[callee.property.name="delegate"] Property[key.name="events"] ArrayExpression > Literal[value=/^.+:stateChange$/]'
    ]?.({});

    expect(context.report).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ messageId: 'subscribe' }),
    );
    expect(context.report).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ messageId: 'delegate' }),
    );
  });

  it('reports messenger actions called in constructors', () => {
    const context = { report: vi.fn() };
    const visitors = getVisitors(
      getRule('no-messenger-actions-in-constructor'),
      context,
    );

    for (const visitor of Object.values(visitors)) {
      visitor({});
    }

    expect(context.report).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['AllowedActions', 'allowedActions'],
    ['AllowedEvents', 'allowedEvents'],
    ['MethodActions', 'methodActions'],
  ])('reports exported %s types', (name, messageId) => {
    const context = { report: vi.fn() };
    const visitors = getVisitors(
      getRule('no-external-action-type-exports'),
      context,
    );

    visitors[
      `ExportNamedDeclaration > ExportSpecifier[local.name=/${name}$/]`
    ]?.({});

    expect(context.report).toHaveBeenCalledWith(
      expect.objectContaining({ messageId }),
    );
  });

  it('reports relative imports that cross package boundaries', () => {
    const context = {
      filename: '/repo/packages/a/src/index.ts',
      report: vi.fn(),
    };
    const visitors = getVisitors(getRule('no-relative-packages'), context);

    visitors.ImportDeclaration?.({ source: { value: '../../b/src' } });
    visitors.ImportDeclaration?.({ source: { value: '../utils' } });
    visitors.ImportDeclaration?.({ source: { value: '@metamask/b' } });

    expect(context.report).toHaveBeenCalledOnce();
  });
});
