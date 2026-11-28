import type { Transaction as XrplTransaction } from 'xrpl';

import { KnownCaip2ChainId } from '../../api';
import type { KnownCaip19IouAssetId } from '../../api';
import { XrplTransactionType } from '../network/api';
import { OnChainAssetType } from '../on-chain-account';
import type { OnChainAccountSerializableFull } from '../on-chain-account/api';
import { OnChainAccount } from '../on-chain-account/OnChainAccount';
import {
  DepositNotAuthorizedException,
  InsufficientBalanceException,
  InsufficientBalanceToCoverBaseReserveException,
  InvalidAmountForCreateAccountException,
  InvalidAssetForCreateAccountException,
  RemoveTrustlineWithNonZeroBalanceException,
  RequiresDestinationTagException,
  TrustlineExceedLimitException,
  TrustlineNotFoundException,
} from './exceptions';
import { Transaction } from './Transaction';
import { TransactionSimulator } from './TransactionSimulator';

const sender = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const assetId = `xrpl:0/token:USD.${issuer}` as KnownCaip19IouAssetId;

function createSnapshot(params: {
  accountId: string;
  rawNativeBalance?: string;
  flags?: Record<string, boolean>;
  balances?: OnChainAccountSerializableFull['balances'];
}): OnChainAccount {
  return OnChainAccount.fromSerializable({
    accountId: params.accountId,
    sequenceNumber: '1',
    scope: KnownCaip2ChainId.Mainnet,
    rawNativeBalance: params.rawNativeBalance ?? '10000000',
    meta: {
      ownerCount: 0,
      sponsoringAccountCount: 0,
      sponsoringOwnerCount: 0,
      sponsoredOwnerCount: 0,
      paysOwnBaseReserve: true,
      flags: params.flags,
    },
    balances: params.balances ?? [],
  });
}

function createIouBalance(
  balance: string,
  limit: string,
  flags: Record<string, boolean> = {},
): OnChainAccountSerializableFull['balances'][number] {
  return {
    type: OnChainAssetType.Iou,
    assetId,
    balance,
    decimals: 15,
    limit,
    qualityIn: 0,
    qualityOut: 0,
    peerAuthorized: flags.peerAuthorized,
    freezePeer: flags.freezePeer,
  };
}

function createPayment(
  amount: XrplTransaction['Amount'],
  destinationTag?: number,
): Transaction {
  return new Transaction(
    {
      TransactionType: XrplTransactionType.Payment,
      Account: sender,
      Destination: destination,
      Amount: amount,
      Fee: '12',
      Sequence: 1,
      ...(destinationTag === undefined
        ? {}
        : { DestinationTag: destinationTag }),
    } as XrplTransaction,
    KnownCaip2ChainId.Mainnet,
  );
}

function createTrustSet(value: string): Transaction {
  return new Transaction(
    {
      TransactionType: XrplTransactionType.TrustSet,
      Account: sender,
      Fee: '12',
      Sequence: 1,
      LimitAmount: {
        currency: 'USD',
        issuer,
        value,
      },
    },
    KnownCaip2ChainId.Mainnet,
  );
}

function createFundedDestination(
  flags?: Record<string, boolean>,
): OnChainAccount {
  return createSnapshot({ accountId: destination, flags });
}

function createSimulatorTest({
  depositAuthorized = true,
}: {
  depositAuthorized?: boolean;
} = {}): {
  simulator: TransactionSimulator;
  fetchDepositAuthorized: ReturnType<typeof vi.fn>;
} {
  const fetchDepositAuthorized = vi.fn().mockResolvedValue(depositAuthorized);
  type TestLogger = {
    withPrefix: () => TestLogger;
    debug: ReturnType<typeof vi.fn>;
  };
  const logger: TestLogger = {
    withPrefix(): TestLogger {
      return this;
    },
    debug: vi.fn(),
  };

  const simulator = new TransactionSimulator({
    networkService: { fetchDepositAuthorized } as never,
    logger: logger as never,
  });

  return { simulator, fetchDepositAuthorized };
}

describe('TransactionSimulator', () => {
  describe('simulate', () => {
    it.each([
      {
        name: 'native payment that does not cover the amount after the fee',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment('1000000'),
            createSnapshot({
              accountId: sender,
              rawNativeBalance: '1000012',
            }),
          ),
        expected: InsufficientBalanceException,
        depositAuthorized: true,
      },
      {
        name: 'unfunded destination when the XRP amount is below the account reserve',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment('1000'),
            createSnapshot({ accountId: sender }),
            [],
          ),
        expected: InvalidAmountForCreateAccountException,
        depositAuthorized: true,
      },
      {
        name: 'missing destination tag when the destination requires one',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment('1000000'),
            createSnapshot({ accountId: sender }),
            [createFundedDestination({ lsfRequireDestTag: true })],
          ),
        expected: RequiresDestinationTagException,
        depositAuthorized: true,
      },
      {
        name: 'unauthorized deposit',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment('1000000'),
            createSnapshot({ accountId: sender }),
            [createFundedDestination()],
          ),
        expected: DepositNotAuthorizedException,
        depositAuthorized: false,
      },
      {
        name: 'IOU payment that would exceed the destination trust-line limit',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment({ currency: 'USD', issuer, value: '20' }),
            createSnapshot({
              accountId: sender,
              balances: [createIouBalance('50', '100')],
            }),
            [
              createSnapshot({
                accountId: destination,
                balances: [createIouBalance('90', '100')],
              }),
              createSnapshot({ accountId: issuer }),
            ],
          ),
        expected: TrustlineExceedLimitException,
        depositAuthorized: true,
      },
      {
        name: 'IOU payment to an unactivated destination',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createPayment({ currency: 'USD', issuer, value: '20' }),
            createSnapshot({
              accountId: sender,
              balances: [createIouBalance('50', '100')],
            }),
            [],
          ),
        expected: InvalidAssetForCreateAccountException,
        depositAuthorized: true,
      },
      {
        name: 'removing a trust line that still has a balance',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createTrustSet('0'),
            createSnapshot({
              accountId: sender,
              balances: [createIouBalance('5', '100')],
            }),
          ),
        expected: RemoveTrustlineWithNonZeroBalanceException,
        depositAuthorized: true,
      },
      {
        name: 'removing a trust line that does not exist',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createTrustSet('0'),
            createSnapshot({ accountId: sender }),
          ),
        expected: TrustlineNotFoundException,
        depositAuthorized: true,
      },
      {
        name: 'new trust line when the sender cannot cover the owner reserve',
        run: (
          simulator: TransactionSimulator,
        ): ReturnType<TransactionSimulator['simulate']> =>
          simulator.simulate(
            createTrustSet('100'),
            createSnapshot({
              accountId: sender,
              rawNativeBalance: '1000012',
            }),
          ),
        expected: InsufficientBalanceToCoverBaseReserveException,
        depositAuthorized: true,
      },
    ])('rejects $name', async ({ run, expected, depositAuthorized }) => {
      const { simulator } = createSimulatorTest({
        depositAuthorized,
      });

      await expect(run(simulator)).rejects.toBeInstanceOf(expected);
    });

    it('accepts a tagged payment when the destination requires a tag', async () => {
      const { simulator } = createSimulatorTest();

      const states = await simulator.simulate(
        createPayment('1000000', 1),
        createSnapshot({ accountId: sender }),
        [createFundedDestination({ lsfRequireDestTag: true })],
      );

      expect(states).toHaveLength(2);
    });

    it('accepts adding a trust line when the sender can pay the fee and the owner reserve', async () => {
      const { simulator } = createSimulatorTest();

      const states = await simulator.simulate(
        createTrustSet('100'),
        createSnapshot({ accountId: sender }),
      );

      expect(states).toHaveLength(2);
    });

    it('does not call deposit authorization for create-account and trust-line removals', async () => {
      const { simulator, fetchDepositAuthorized } = createSimulatorTest();

      await expect(
        simulator.simulate(
          createPayment('1000'),
          createSnapshot({ accountId: sender }),
          [],
        ),
      ).rejects.toBeInstanceOf(InvalidAmountForCreateAccountException);

      await expect(
        simulator.simulate(
          createTrustSet('0'),
          createSnapshot({
            accountId: sender,
            balances: [createIouBalance('5', '100')],
          }),
        ),
      ).rejects.toBeInstanceOf(RemoveTrustlineWithNonZeroBalanceException);

      expect(fetchDepositAuthorized).not.toHaveBeenCalled();
    });

    it('applies batch inners in order so a later payment sees the earlier debit', async () => {
      const { simulator } = createSimulatorTest();
      const inner = (amount: string): XrplTransaction => {
        const raw = createPayment(amount).getRaw();
        return {
          ...raw,
          Fee: '0',
          Flags: { tfInnerBatchTxn: true },
        };
      };
      const batch = new Transaction(
        {
          TransactionType: XrplTransactionType.Batch,
          Account: sender,
          Fee: '12',
          Sequence: 1,
          RawTransactions: [
            { RawTransaction: inner('5000000') },
            { RawTransaction: inner('5000000') },
          ],
        } as XrplTransaction,
        KnownCaip2ChainId.Mainnet,
      );

      await expect(
        simulator.simulate(batch, createSnapshot({ accountId: sender }), [
          createFundedDestination(),
        ]),
      ).rejects.toBeInstanceOf(InsufficientBalanceException);
    });
  });
});
