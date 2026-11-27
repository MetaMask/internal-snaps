import { TransactionStatus } from '@metamask/keyring-api';
import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { encode } from 'xrpl';

import { KnownCaip2ChainId } from '../../api';
import { IOU_DECIMAL_PLACES, LEDGER_SEQUENCE_OFFSET } from '../../constants';
import { getSlip44AssetId, toCaip19IouAssetId } from '../../utils';
import { AccountNotActivatedException, XrplTransactionType } from '../network';
import type { NetworkService } from '../network';
import { OnChainAssetType } from '../on-chain-account';
import type { OnChainAccountService } from '../on-chain-account';
import type { OnChainAccountSerializableFull } from '../on-chain-account/api';
import { OnChainAccount } from '../on-chain-account/OnChainAccount';
import {
  InvalidAssetForCreateAccountException,
  TransactionBuilderException,
} from './exceptions';
import { TransactionAutofillerFillItems } from './TransactionAutofiller';
import type { TransactionRepository } from './TransactionRepository';
import { TransactionService } from './TransactionService';

const accountAddress = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const peerAddress = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const scope = KnownCaip2ChainId.Mainnet;
const iouAssetId = toCaip19IouAssetId(scope, 'USD', issuer);
const nativeAssetId = getSlip44AssetId(scope);
const baseFeeDrops = 12;
const feeMultiplier = 10;

function account(params: {
  accountId: string;
  sequenceNumber?: string;
  rawNativeBalance?: string;
  iouBalance?: string;
  requireDestTag?: boolean;
}): OnChainAccount {
  const balances: OnChainAccountSerializableFull['balances'] = [];
  if (params.iouBalance !== undefined) {
    balances.push({
      type: OnChainAssetType.Iou,
      assetId: iouAssetId,
      balance: params.iouBalance,
      decimals: IOU_DECIMAL_PLACES,
      limit: '100',
      qualityIn: 0,
      qualityOut: 0,
    });
  }
  return OnChainAccount.fromSerializable({
    accountId: params.accountId,
    sequenceNumber: params.sequenceNumber ?? '42',
    scope,
    rawNativeBalance: params.rawNativeBalance ?? '20000000',
    meta: {
      ownerCount: params.iouBalance === undefined ? 0 : 1,
      sponsoringAccountCount: 0,
      sponsoringOwnerCount: 0,
      sponsoredOwnerCount: 0,
      paysOwnBaseReserve: true,
      ...(params.requireDestTag === true
        ? { flags: { lsfRequireDestTag: true } }
        : {}),
    },
    balances,
  });
}

describe('TransactionService', () => {
  const fetchValidatedLedgerIndex = vi.fn(async () => 1_000);
  const getBaseFee = vi.fn(async () => new BigNumber(baseFeeDrops));
  const fetchDepositAuthorized = vi.fn(async () => true);
  const sendTransaction = vi.fn(async () => 'abc');
  const fetchTransaction = vi.fn();
  const fetchAccountWithBalances = vi.fn();
  const findByAccountId = vi.fn(async () => []);

  const logger = {
    withPrefix() {
      return this;
    },
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;

  let service: TransactionService;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchAccountWithBalances.mockImplementation(async (address: string) =>
      account({ accountId: address, sequenceNumber: '1' }),
    );
    service = new TransactionService({
      logger,
      transactionRepository: {
        findByAccountId,
      } as unknown as TransactionRepository,
      networkService: {
        fetchValidatedLedgerIndex,
        getBaseFee,
        fetchDepositAuthorized,
        sendTransaction,
        fetchTransaction,
      } as unknown as NetworkService,
      onChainAccountService: {
        fetchAccountWithBalances,
      } as unknown as OnChainAccountService,
    });
  });

  it('builds a native payment without NetworkID', async () => {
    const { transaction } = await service.createValidatedSendTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      amount: new BigNumber(1_000_000),
      assetId: nativeAssetId,
      destination: peerAddress,
    });

    expect(transaction.transactionType).toBe(XrplTransactionType.Payment);
    expect(transaction.account).toBe(accountAddress);
    expect(transaction.sequence).toBe(42);
    expect(transaction.fee.toFixed(0)).toBe(
      String(baseFeeDrops * feeMultiplier),
    );
    expect(transaction.lastLedgerSequence).toBe(1_000 + LEDGER_SEQUENCE_OFFSET);
    expect(transaction.getRaw()).not.toHaveProperty('NetworkID');
    expect(transaction.getRaw().Amount).toBe('1000000');
  });

  it('builds an IOU payment with a 15-digit value', async () => {
    const { transaction } = await service.createValidatedSendTransaction({
      onChainAccount: account({
        accountId: accountAddress,
        iouBalance: '20',
      }),
      scope,
      amount: new BigNumber('12.5'),
      assetId: iouAssetId,
      destination: issuer,
    });

    expect(transaction.getRaw().Amount).toStrictEqual({
      currency: 'USD',
      issuer,
      value: '12.500000000000000',
    });
    expect(transaction.getRaw()).not.toHaveProperty('NetworkID');
    expect(transaction.fee.toFixed(0)).toBe(
      String(baseFeeDrops * feeMultiplier),
    );
  });

  it('attaches a numeric destination tag', async () => {
    const { transaction } = await service.createValidatedSendTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      amount: new BigNumber(1_000_000),
      assetId: nativeAssetId,
      destination: peerAddress,
      destinationTag: 1234,
    });

    expect(transaction.destinationTag).toBe(1234);
  });

  it('passes preflight with fee-only autofill (amount-input path)', async () => {
    const { transaction } = await service.createValidatedSendTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      amount: new BigNumber(1_000_000),
      assetId: nativeAssetId,
      // Self-send like onAmountInput — no dest preload.
      destination: accountAddress,
      useCache: true,
      autoFill: {
        fillItems: new Set([TransactionAutofillerFillItems.fee]),
      },
    });

    expect(transaction.fee.toFixed(0)).toBe(
      String(baseFeeDrops * feeMultiplier),
    );
    // Sequence comes from the builder snapshot; LLS is intentionally omitted.
    expect(transaction.sequence).toBe(42);
    expect(transaction.getRaw().LastLedgerSequence).toBeUndefined();
    expect(fetchAccountWithBalances).not.toHaveBeenCalled();
    expect(fetchValidatedLedgerIndex).not.toHaveBeenCalled();
  });

  it('rejects an IOU payment to an unactivated destination', async () => {
    fetchAccountWithBalances.mockRejectedValueOnce(
      new AccountNotActivatedException(peerAddress, scope),
    );

    await expect(
      service.createValidatedSendTransaction({
        onChainAccount: account({
          accountId: accountAddress,
          iouBalance: '20',
        }),
        scope,
        amount: new BigNumber('1'),
        assetId: iouAssetId,
        destination: peerAddress,
      }),
    ).rejects.toBeInstanceOf(InvalidAssetForCreateAccountException);
  });

  it('preloads peer accounts with the requested asset ids', async () => {
    await service.createValidatedSendTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      amount: new BigNumber(1_000_000),
      assetId: nativeAssetId,
      destination: peerAddress,
      useCache: true,
    });

    expect(fetchAccountWithBalances).toHaveBeenCalledWith(
      peerAddress,
      scope,
      [],
    );
  });

  it('builds a TrustSet', async () => {
    const transaction = await service.createValidatedChangeTrustTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      assetId: iouAssetId,
      limit: '1000',
    });

    expect(transaction.transactionType).toBe(XrplTransactionType.TrustSet);
    expect(transaction.getRaw().LimitAmount).toStrictEqual({
      currency: 'USD',
      issuer,
      value: '1000',
    });
    expect(transaction.getRaw()).not.toHaveProperty('NetworkID');
    expect(transaction.lastLedgerSequence).toBe(1_000 + LEDGER_SEQUENCE_OFFSET);
  });

  it('rejects swap transactions', async () => {
    await expect(
      service.createValidatedSwapTransaction({
        onChainAccount: account({ accountId: accountAddress }),
        scope,
        transaction: '00',
      }),
    ).rejects.toBeInstanceOf(TransactionBuilderException);
  });

  it('submits a pre-signed transaction without filling again', async () => {
    const { transaction } = await service.createValidatedSendTransaction({
      onChainAccount: account({ accountId: accountAddress }),
      scope,
      amount: new BigNumber(1_000_000),
      assetId: nativeAssetId,
      destination: peerAddress,
    });
    const signedTransaction = encode(transaction.getRaw());
    fetchValidatedLedgerIndex.mockClear();
    getBaseFee.mockClear();

    const hash = await service.sendTransaction({
      scope,
      signedTransaction,
    });

    expect(hash).toBe('abc');
    expect(sendTransaction).toHaveBeenCalledWith(signedTransaction, scope);
    expect(fetchValidatedLedgerIndex).not.toHaveBeenCalled();
    expect(getBaseFee).not.toHaveBeenCalled();
  });

  it('maps a validated ledger result when fetching a transaction', async () => {
    fetchTransaction.mockResolvedValue({
      status: 'success',
      validated: true,
      meta: { TransactionResult: 'tesSUCCESS' },
      tx_json: {
        TransactionType: 'Payment',
        Account: accountAddress,
        Destination: peerAddress,
        Amount: '10',
        Fee: '12',
        Sequence: 1,
      },
    });

    const transaction = await service.fetchTransaction('abc', scope);

    expect(transaction.status).toBe(TransactionStatus.Confirmed);
    expect(fetchTransaction).toHaveBeenCalledWith('abc', scope);
  });

  it('reads pending transactions for an account', async () => {
    await service.findByAccountId('account-1');

    expect(findByAccountId).toHaveBeenCalledWith('account-1');
  });
});
