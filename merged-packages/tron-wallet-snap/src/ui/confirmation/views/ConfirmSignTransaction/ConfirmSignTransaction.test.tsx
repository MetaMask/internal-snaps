import { ConfirmSignTransaction } from './ConfirmSignTransaction';
import { ConfirmSignTransactionFormNames } from './events';
import type { ConfirmSignTransactionContext } from './types';
import { Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities/keyring-account';
import { TronMultichainMethod } from '../../../../handlers/keyring-types';
import { TRANSACTION_TAPOS_EXPIRED } from '../../../../services/transaction-scan/isTransactionDeadlinePassedError';
import {
  SimulationStatus,
  type TransactionScanError,
  type TransactionScanResult,
} from '../../../../services/transaction-scan/types';
import { FetchStatus, type Preferences } from '../../../../types/snap';

/**
 * Recursively searches a rendered JSX tree for an element with a given name.
 *
 * @param node - The current JSX node (element, array, or primitive).
 * @param name - The element `name` prop to look for.
 * @returns The matching element, or undefined.
 */
function findByName(node: any, name: string): any {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByName(child, name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (node.props?.name === name) {
    return node;
  }
  return findByName(node.props?.children, name);
}

/**
 * Recursively collects all string leaves from a rendered JSX tree.
 *
 * @param node - The current JSX node (element, array, or primitive).
 * @returns All string children found in the tree.
 */
function collectTexts(node: any): string[] {
  if (node === null || node === undefined) {
    return [];
  }
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectTexts(child));
  }
  if (typeof node === 'object') {
    const title =
      typeof node.props?.title === 'string' ? [node.props.title] : [];
    return [...title, ...collectTexts(node.props?.children)];
  }
  return [];
}

describe('ConfirmSignTransaction', () => {
  const mockAccount: TronKeyringAccount = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    options: {},
    methods: [
      TronMultichainMethod.SignMessage,
      TronMultichainMethod.SignTransaction,
    ],
    type: 'tron:eoa',
    scopes: [Network.Mainnet],
    entropySource: 'entropy-source-1' as any,
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  const mockPreferences: Preferences = {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    useExternalPricingData: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: true,
    useNftDetection: true,
  };

  const buildScanResult = (
    overrides: Partial<TransactionScanResult> = {},
  ): TransactionScanResult => ({
    status: 'SUCCESS',
    simulationStatus: SimulationStatus.Completed,
    estimatedChanges: { assets: [] },
    validation: { type: 'Benign', reason: null },
    error: null,
    ...overrides,
  });

  const buildContext = (
    overrides: Partial<ConfirmSignTransactionContext> = {},
  ): ConfirmSignTransactionContext =>
    ({
      scope: Network.Mainnet,
      account: mockAccount,
      transaction: { rawDataHex: '0a02beef', type: 'TransferContract' },
      origin: 'https://example.com',
      preferences: mockPreferences,
      networkImage: '',
      scan: buildScanResult(),
      scanFetchStatus: FetchStatus.Fetched,
      tokenPrices: {} as any,
      tokenPricesFetchStatus: FetchStatus.Fetched,
      fees: [] as any,
      feesFetchStatus: FetchStatus.Fetched,
      ...overrides,
    }) as ConfirmSignTransactionContext;

  const isConfirmDisabled = (
    context: ConfirmSignTransactionContext,
  ): boolean => {
    const tree = ConfirmSignTransaction({ context });
    const confirmButton = findByName(
      tree,
      ConfirmSignTransactionFormNames.Confirm,
    );
    return Boolean(confirmButton?.props?.disabled);
  };

  const deadlineError: TransactionScanError = {
    type: null,
    code: null,
    message: 'Reverted: TransactionDeadlinePassed',
  };

  const otherError: TransactionScanError = {
    type: 'Revert',
    code: 'INSUFFICIENT_BALANCE',
    message: 'Reverted: insufficient balance',
  };

  const taposExpiredError: TransactionScanError = {
    type: TRANSACTION_TAPOS_EXPIRED,
    code: null,
    message: null,
  };

  const SIMULATION_ERROR_TITLE =
    'This transaction was reverted during simulation.';
  const FRIENDLY_EXPIRED_MESSAGE = 'Please go back and try again';

  const renderTexts = (context: ConfirmSignTransactionContext): string[] => {
    const tree = ConfirmSignTransaction({ context });
    return collectTexts(tree);
  };

  it('disables the confirm button during the initial scan load', () => {
    expect(
      isConfirmDisabled(buildContext({ scanFetchStatus: FetchStatus.Loading })),
    ).toBe(true);
  });

  it('keeps the confirm button enabled during a scan refresh (Fetching)', () => {
    expect(
      isConfirmDisabled(
        buildContext({ scanFetchStatus: FetchStatus.Fetching }),
      ),
    ).toBe(false);
  });

  it('enables the confirm button for a successful scan', () => {
    expect(isConfirmDisabled(buildContext())).toBe(false);
  });

  it('disables the confirm button when the scan fails on a deadline (expired)', () => {
    expect(
      isConfirmDisabled(
        buildContext({
          scan: buildScanResult({
            status: 'ERROR',
            simulationStatus: SimulationStatus.Failed,
            error: deadlineError,
          }),
        }),
      ),
    ).toBe(true);
  });

  it('disables the confirm button for other failed simulations', () => {
    expect(
      isConfirmDisabled(
        buildContext({
          scan: buildScanResult({
            status: 'ERROR',
            simulationStatus: SimulationStatus.Failed,
            error: otherError,
          }),
        }),
      ),
    ).toBe(true);
  });

  it('renders the expiry banner with the friendly message even when security alerts are off', () => {
    const texts = renderTexts(
      buildContext({
        preferences: { ...mockPreferences, useSecurityAlerts: false },
        scan: buildScanResult({
          status: 'ERROR',
          simulationStatus: SimulationStatus.Failed,
          error: taposExpiredError,
        }),
      }),
    );

    // The banner is gated on `useSecurityAlerts || scan?.error`, so the
    // locally-detected TAPOS-expired error surfaces it even with security
    // alerts disabled, using the friendly copy.
    expect(texts).toContain(SIMULATION_ERROR_TITLE);
    expect(texts).toContain(FRIENDLY_EXPIRED_MESSAGE);
  });

  it('renders no simulation banner when security alerts are off and the scan is benign', () => {
    const texts = renderTexts(
      buildContext({
        preferences: { ...mockPreferences, useSecurityAlerts: false },
      }),
    );

    expect(texts).not.toContain(SIMULATION_ERROR_TITLE);
  });
});
