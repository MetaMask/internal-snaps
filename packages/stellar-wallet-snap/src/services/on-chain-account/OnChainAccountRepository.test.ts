import { InMemoryState } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../api';
import type { OnChainAccountState } from './api';
import { OnChainAccountRepository } from './OnChainAccountRepository';
import type { OnChainAccountSerializableFull } from './OnChainAccountSerializable';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

const snapshot = (scope: KnownCaip2ChainId): OnChainAccountSerializableFull =>
  ({ scope, accountId: 'GSNAPSHOT' }) as unknown as OnChainAccountSerializableFull;

describe('OnChainAccountRepository', () => {
  const setup = (
    initial: Partial<OnChainAccountState> = {},
  ): {
    state: InMemoryState<OnChainAccountState>;
    repository: OnChainAccountRepository;
  } => {
    const state = new InMemoryState<OnChainAccountState>({
      onChainAccounts: {},
      ...initial,
    } as OnChainAccountState);
    return { state, repository: new OnChainAccountRepository(state) };
  };

  describe('markUnfunded / isConfirmedUnfunded', () => {
    it('reports accounts as not confirmed unfunded by default', async () => {
      const { repository } = setup();

      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(false);
    });

    it('marks accounts as unfunded per scope and returns the newly marked ids', async () => {
      const { repository } = setup();

      const marked = await repository.markUnfunded(
        [ACCOUNT_A, ACCOUNT_B],
        KnownCaip2ChainId.Mainnet,
        1000,
      );

      expect(marked).toStrictEqual([ACCOUNT_A, ACCOUNT_B]);
      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(true);
      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Testnet,
        ),
      ).toBe(false);
    });

    it('returns only ids that were not already marked', async () => {
      const { repository } = setup();
      await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Mainnet);

      const marked = await repository.markUnfunded(
        [ACCOUNT_A, ACCOUNT_B],
        KnownCaip2ChainId.Mainnet,
      );

      expect(marked).toStrictEqual([ACCOUNT_B]);
    });

    it('does nothing for an empty list', async () => {
      const { repository, state } = setup();
      const updateSpy = jest.spyOn(state, 'update');

      expect(
        await repository.markUnfunded([], KnownCaip2ChainId.Mainnet),
      ).toStrictEqual([]);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('keeps an existing snapshot when an account is marked unfunded', async () => {
      const { repository } = setup();
      await repository.save(ACCOUNT_A, snapshot(KnownCaip2ChainId.Mainnet));

      await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Mainnet);

      expect(
        await repository.findByKeyringAccountId(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toStrictEqual(snapshot(KnownCaip2ChainId.Mainnet));
    });
  });

  describe('clearing the unfunded marker', () => {
    it('clears the marker for the saved scope on save', async () => {
      const { repository } = setup();
      await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Mainnet);
      await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Testnet);

      await repository.save(ACCOUNT_A, snapshot(KnownCaip2ChainId.Mainnet));

      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(false);
      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Testnet,
        ),
      ).toBe(true);
    });

    it('clears the marker for each saved account on saveMany', async () => {
      const { repository } = setup();
      await repository.markUnfunded(
        [ACCOUNT_A, ACCOUNT_B],
        KnownCaip2ChainId.Mainnet,
      );

      await repository.saveMany({
        [ACCOUNT_A]: snapshot(KnownCaip2ChainId.Mainnet),
      });

      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(false);
      expect(
        await repository.isConfirmedUnfunded(
          ACCOUNT_B,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(true);
    });

    it('re-marking after a save reports the account as newly unfunded', async () => {
      const { repository } = setup();
      await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Mainnet);
      await repository.save(ACCOUNT_A, snapshot(KnownCaip2ChainId.Mainnet));

      expect(
        await repository.markUnfunded([ACCOUNT_A], KnownCaip2ChainId.Mainnet),
      ).toStrictEqual([ACCOUNT_A]);
    });
  });
});
