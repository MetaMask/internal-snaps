import { InMemoryState } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../../api';
import { KEYRING_ACCOUNT_TYPE } from '../../../constants';
import { noOpLogger } from '../../../utils/logger';
import { DEFAULT_UNENCRYPTED_STATE } from '../../state/stateTypes';
import { WalletService, getDerivationPath } from '../../wallet';
import { createRandomXrplAddress } from '../../wallet/__mocks__/wallet.fixtures';
import { AccountService } from '../AccountService';
import { AccountsRepository } from '../AccountsRepository';
import { MultiChainMethod } from '../api';
import type { XrplKeyringAccount } from '../api';

/**
 * Builds a deterministic XRPL keyring account for tests.
 *
 * @param id - Account id.
 * @param address - Classic address.
 * @param entropySource - Entropy source id.
 * @param index - Derivation index.
 * @returns Keyring account.
 */
export function generateXrplKeyringAccount(
  id: string,
  address: string,
  entropySource: string,
  index: number,
): XrplKeyringAccount {
  const derivationPath = getDerivationPath(index);
  return {
    id,
    address,
    type: KEYRING_ACCOUNT_TYPE,
    options: {
      entropy: {
        type: 'mnemonic',
        id: entropySource,
        derivationPath,
        groupIndex: index,
      },
      exportable: true,
    },
    methods: [MultiChainMethod.SignTransaction],
    scopes: [KnownCaip2ChainId.Mainnet],
    entropySource,
    derivationPath,
    index,
  };
}

/**
 * Generates `count` mock XRPL keyring accounts for an entropy source.
 *
 * @param count - Number of accounts.
 * @param entropySource - Entropy source id.
 * @returns Mock accounts with indices `0..count-1`.
 */
export function generateMockXrplKeyringAccounts(
  count: number,
  entropySource: string,
): XrplKeyringAccount[] {
  return Array.from({ length: count }, (_, index) =>
    generateXrplKeyringAccount(
      globalThis.crypto.randomUUID(),
      createRandomXrplAddress(),
      entropySource,
      index,
    ),
  );
}

/**
 * Account-layer stack only.
 *
 * @returns Account service and wallet service wired to the same state.
 */
export function mockAccountService(): {
  accountService: AccountService;
  walletService: WalletService;
  accountsRepository: AccountsRepository;
} {
  const walletService = new WalletService();
  const state = new InMemoryState({ ...DEFAULT_UNENCRYPTED_STATE });
  const accountsRepository = new AccountsRepository(state);
  const accountService = new AccountService({
    logger: noOpLogger,
    accountsRepository,
    walletService,
  });

  return {
    accountService,
    walletService,
    accountsRepository,
  };
}
