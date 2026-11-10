import { dirname, resolve } from 'node:path';

/**
 * Rules that were previously expressed with ESLint's `no-restricted-syntax`
 * selectors. Oxlint does not implement `no-restricted-syntax`, so these are
 * kept here as a local JS plugin.
 */

const NO_ENUM_MESSAGE =
  "Don't use enums. There are a number of reasons why they are problematic, but the most important is that TypeScript treats them nominally, not structurally, and this can cause unexpected breaking changes. Instead, use an object + type, an array + type, or just a type. Learn more here: https://github.com/MetaMask/eslint-config/issues/417";

const NO_STATE_CHANGE_SUBSCRIBE_MESSAGE =
  "Subscribing to ':stateChange' events is deprecated. Use ':stateChanged' instead.";

const NO_STATE_CHANGE_DELEGATE_MESSAGE =
  "Delegating ':stateChange' events is deprecated. Use ':stateChanged' instead.";

const NO_MESSENGER_ACTIONS_IN_CONSTRUCTOR_MESSAGE =
  'Do not call messenger actions in the constructor, as this forces clients to instantiate controllers or services in a specific order. Move this call to an init() method instead. Read the controller guidelines for more: https://github.com/MetaMask/core/blob/main/docs/code-guidelines/controller-guidelines.md#do-not-call-messenger-actions-in-the-constructor';

const NO_ALLOWED_ACTIONS_EXPORT_MESSAGE =
  'Do not export AllowedActions types from package index files. These types describe external messenger dependencies and are obtainable from the packages that define them directly. Read the controller guidelines for more: https://github.com/MetaMask/core/blob/main/docs/code-guidelines/controller-guidelines.md#define-but-do-not-export-a-type-union-for-external-action-types';

const NO_ALLOWED_EVENTS_EXPORT_MESSAGE =
  'Do not export AllowedEvents types from package index files. These types describe external messenger dependencies and are obtainable from the packages that define them directly. Read the controller guidelines for more: https://github.com/MetaMask/core/blob/main/docs/code-guidelines/controller-guidelines.md#define-but-do-not-export-a-type-union-for-external-event-types';

const NO_METHOD_ACTIONS_EXPORT_MESSAGE =
  'Do not export *MethodActions types from package index files. Internal messenger actions are already available via the *Actions type. Export the individual action types (along with *Actions) instead. Read the controller guidelines for more: https://github.com/MetaMask/core/blob/main/docs/code-guidelines/controller-guidelines.md#expose-controller-methods-through-messenger-in-bulk';

const noEnum = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow TypeScript enums.' },
    schema: [],
    messages: { noEnum: NO_ENUM_MESSAGE },
  },
  create(context) {
    return {
      TSEnumDeclaration(node) {
        context.report({ node, messageId: 'noEnum' });
      },
    };
  },
};

const noInOperator = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow the `in` operator.' },
    schema: [],
    messages: { noInOperator: 'The "in" operator is not allowed' },
  },
  create(context) {
    return {
      "BinaryExpression[operator='in']"(node) {
        context.report({ node, messageId: 'noInOperator' });
      },
    };
  },
};

const noPrivateAccessibility = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow the `private` accessibility modifier.' },
    schema: [],
    messages: { noPrivateAccessibility: 'Use a hash name instead.' },
  },
  create(context) {
    return {
      "PropertyDefinition[accessibility='private'], MethodDefinition[accessibility='private'], TSParameterProperty[accessibility='private']"(
        node,
      ) {
        context.report({ node, messageId: 'noPrivateAccessibility' });
      },
    };
  },
};

const noSequenceExpression = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow sequence expressions.' },
    schema: [],
    messages: {
      noSequenceExpression: 'Sequence expressions are not allowed',
    },
  },
  create(context) {
    return {
      SequenceExpression(node) {
        context.report({ node, messageId: 'noSequenceExpression' });
      },
    };
  },
};

const noWithStatement = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow `with` statements.' },
    schema: [],
    messages: { noWithStatement: 'With statements are not allowed' },
  },
  create(context) {
    return {
      WithStatement(node) {
        context.report({ node, messageId: 'noWithStatement' });
      },
    };
  },
};

const noStateChangeEvents = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow `:stateChange` events.' },
    schema: [],
    messages: {
      subscribe: NO_STATE_CHANGE_SUBSCRIBE_MESSAGE,
      delegate: NO_STATE_CHANGE_DELEGATE_MESSAGE,
    },
  },
  create(context) {
    return {
      'CallExpression[callee.property.name="subscribe"] > Literal[value=/^.+:stateChange$/]'(
        node,
      ) {
        context.report({ node, messageId: 'subscribe' });
      },
      'CallExpression[callee.property.name="delegate"] Property[key.name="events"] ArrayExpression > Literal[value=/^.+:stateChange$/]'(
        node,
      ) {
        context.report({ node, messageId: 'delegate' });
      },
    };
  },
};

const noMessengerActionsInConstructor = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow calling messenger actions in constructors.',
    },
    schema: [],
    messages: {
      noMessengerAction: NO_MESSENGER_ACTIONS_IN_CONSTRUCTOR_MESSAGE,
    },
  },
  create(context) {
    const report = (node) => {
      context.report({ node, messageId: 'noMessengerAction' });
    };

    return {
      'MethodDefinition[kind="constructor"] CallExpression[callee.type="MemberExpression"][callee.property.name="call"][callee.object.type="MemberExpression"][callee.object.object.type="ThisExpression"][callee.object.property.name="messenger"]'(
        node,
      ) {
        report(node);
      },
      'MethodDefinition[kind="constructor"] CallExpression[callee.type="MemberExpression"][callee.property.name="call"][callee.object.type="Identifier"][callee.object.name="messenger"]'(
        node,
      ) {
        report(node);
      },
    };
  },
};

const noExternalActionTypeExports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow exporting external action and event types.',
    },
    schema: [],
    messages: {
      allowedActions: NO_ALLOWED_ACTIONS_EXPORT_MESSAGE,
      allowedEvents: NO_ALLOWED_EVENTS_EXPORT_MESSAGE,
      methodActions: NO_METHOD_ACTIONS_EXPORT_MESSAGE,
    },
  },
  create(context) {
    return {
      'ExportNamedDeclaration > ExportSpecifier[local.name=/AllowedActions$/]'(
        node,
      ) {
        context.report({ node, messageId: 'allowedActions' });
      },
      'ExportNamedDeclaration > ExportSpecifier[local.name=/AllowedEvents$/]'(
        node,
      ) {
        context.report({ node, messageId: 'allowedEvents' });
      },
      'ExportNamedDeclaration > ExportSpecifier[local.name=/MethodActions$/]'(
        node,
      ) {
        context.report({ node, messageId: 'methodActions' });
      },
    };
  },
};

const noRelativePackages = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow relative imports that cross package boundaries.',
    },
    schema: [],
    messages: {
      noRelativePackage:
        'Relative imports across packages are not allowed. Import from the package name instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const [, currentPackage] =
      /packages[\\/]([^\\/]+)[\\/]/u.exec(filename) ?? [];

    const checkSource = (node) => {
      const source = node.source?.value;
      if (
        !currentPackage ||
        typeof source !== 'string' ||
        !source.startsWith('.')
      ) {
        return;
      }

      const [, targetPackage] =
        /packages[\\/]([^\\/]+)[\\/]/u.exec(
          resolve(dirname(filename), source),
        ) ?? [];
      if (targetPackage && targetPackage !== currentPackage) {
        context.report({ node, messageId: 'noRelativePackage' });
      }
    };

    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
    };
  },
};

const plugin = {
  rules: {
    'no-enum': noEnum,
    'no-in-operator': noInOperator,
    'no-messenger-actions-in-constructor': noMessengerActionsInConstructor,
    'no-external-action-type-exports': noExternalActionTypeExports,
    'no-private-accessibility': noPrivateAccessibility,
    'no-relative-packages': noRelativePackages,
    'no-sequence-expression': noSequenceExpression,
    'no-state-change-events': noStateChangeEvents,
    'no-with-statement': noWithStatement,
  },
};

export default plugin;
