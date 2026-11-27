import type { Logger } from '@metamask/snap-networks-utils';
import { InMemoryCache } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { hashes } from 'xrpl';

import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  XrplTransactionString,
} from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { toCaip19MptAssetId } from '../../utils';
import type { BaseTxResult, SubmitResponse } from './api';
import { LedgerState } from './api';
import {
  AccountNotActivatedException,
  DestinationAccountNotActivatedException,
  NetworkServiceException,
  RpcResponseException,
  TransactionNotFoundException,
  TransactionRetryableException,
  TransactionSendException,
} from './exceptions';
import { ClioClient, RpcClient } from './NetworkClient';
import { NetworkService } from './NetworkService';

const signedBlob = '12AA' as XrplTransactionString;
const transactionHash =
  'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const assetId = `xrpl:0/xls33:${issuanceId}` as KnownCaip19MptAssetId;
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

function createNetworkServiceTest() {
  const submitTransaction = vi.fn();
  const fetchServerInfo = vi.fn();
  const batchRead = vi.fn();
  const fetchTrustlinePage = vi.fn();
  const fetchMptokenPage = vi.fn();
  const fetchAccountTransactions = vi.fn();
  const fetchAccountInfo = vi.fn();
  const fetchTransactionInfo = vi.fn();
  const fetchLedgerInfo = vi.fn();
  const fetchDepositAuthorized = vi.fn();

  const logger = {
    withPrefix() {
      return this;
    },
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;

  vi.spyOn(RpcClient.prototype, 'submitTransaction').mockImplementation(
    submitTransaction,
  );
  vi.spyOn(RpcClient.prototype, 'fetchServerInfo').mockImplementation(
    fetchServerInfo,
  );
  vi.spyOn(RpcClient.prototype, 'batchRead').mockImplementation(batchRead);
  vi.spyOn(RpcClient.prototype, 'fetchAccountTrustlines').mockImplementation(
    fetchTrustlinePage,
  );
  vi.spyOn(RpcClient.prototype, 'fetchAccountTransactions').mockImplementation(
    fetchAccountTransactions,
  );
  vi.spyOn(RpcClient.prototype, 'fetchAccountInfo').mockImplementation(
    fetchAccountInfo,
  );
  vi.spyOn(RpcClient.prototype, 'fetchTransactionInfo').mockImplementation(
    fetchTransactionInfo,
  );
  vi.spyOn(RpcClient.prototype, 'fetchLedgerInfo').mockImplementation(
    fetchLedgerInfo,
  );
  vi.spyOn(RpcClient.prototype, 'fetchDepositAuthorized').mockImplementation(
    fetchDepositAuthorized,
  );
  vi.spyOn(ClioClient.prototype, 'fetchAccountMptokens').mockImplementation(
    fetchMptokenPage,
  );

  return {
    service: new NetworkService({
      logger,
      cache: new InMemoryCache(logger),
    }),
    submitTransaction,
    fetchServerInfo,
    batchRead,
    fetchTrustlinePage,
    fetchMptokenPage,
    fetchAccountTransactions,
    fetchAccountInfo,
    fetchTransactionInfo,
    fetchLedgerInfo,
    fetchDepositAuthorized,
  };
}

function submitResponse(engineResult: string, hash?: string): SubmitResponse {
  return {
    status: 'success',
    validated: false,
    engine_result: engineResult,
    engine_result_code: engineResult.startsWith('tes') ? 0 : -1,
    engine_result_message: engineResult,
    tx_blob: signedBlob,
    tx_json: {
      Account: account,
      TransactionType: 'Payment',
      ...(hash === undefined ? {} : { hash }),
    },
  };
}

function validatedServerInfo() {
  return {
    status: 'success',
    validated: true,
    info: {
      validated_ledger: { base_fee_xrp: 0.00001 },
      load_factor: 1,
    },
  };
}

function txEntry(hash: string): BaseTxResult {
  return {
    hash,
    meta: { TransactionResult: 'tesSUCCESS' },
  };
}

describe('NetworkService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendTransaction', () => {
    beforeEach(() => {
      vi.spyOn(hashes, 'hashSignedTx').mockReturnValue(transactionHash);
    });

    it('returns the node hash when the signed transaction is provisionally applied', async () => {
      const { service, submitTransaction } = createNetworkServiceTest();
      submitTransaction.mockResolvedValue(
        submitResponse('tesSUCCESS', transactionHash),
      );

      const result = await service.sendTransaction(
        signedBlob,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(transactionHash);
      expect(submitTransaction).toHaveBeenCalledWith(signedBlob, true);
      expect(hashes.hashSignedTx).not.toHaveBeenCalled();
    });

    it('prefers the API v2 top-level hash over tx_json.hash', async () => {
      const { service, submitTransaction } = createNetworkServiceTest();
      submitTransaction.mockResolvedValue({
        ...submitResponse('tesSUCCESS'),
        hash: transactionHash,
      });

      const result = await service.sendTransaction(
        signedBlob,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(transactionHash);
      expect(hashes.hashSignedTx).not.toHaveBeenCalled();
    });

    it.each([
      {
        scenario: 'when the signed transaction is only queued',
        engineResult: 'terQUEUED',
        hash: transactionHash,
      },
      {
        scenario: 'for tec failures',
        engineResult: 'tecUNFUNDED_PAYMENT',
        hash: transactionHash,
      },
      {
        scenario: 'for tefALREADY',
        engineResult: 'tefALREADY',
        hash: undefined,
      },
    ])(
      'throws TransactionSendException $scenario',
      async ({ engineResult, hash }) => {
        const { service, submitTransaction } = createNetworkServiceTest();
        submitTransaction.mockResolvedValue(submitResponse(engineResult, hash));

        await expect(
          service.sendTransaction(signedBlob, KnownCaip2ChainId.Mainnet),
        ).rejects.toBeInstanceOf(TransactionSendException);
      },
    );

    it('hashes the signed blob when the submit result omits a hash', async () => {
      const { service, submitTransaction } = createNetworkServiceTest();
      submitTransaction.mockResolvedValue(submitResponse('tesSUCCESS'));

      const result = await service.sendTransaction(
        signedBlob,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(transactionHash);
      expect(hashes.hashSignedTx).toHaveBeenCalledWith(signedBlob);
    });

    it.each(['tefPAST_SEQ', 'terPRE_SEQ'])(
      'throws TransactionRetryableException when the signed sequence does not match (%s)',
      async (engineResult) => {
        const { service, submitTransaction } = createNetworkServiceTest();
        submitTransaction.mockResolvedValue(submitResponse(engineResult));

        await expect(
          service.sendTransaction(signedBlob, KnownCaip2ChainId.Mainnet),
        ).rejects.toBeInstanceOf(TransactionRetryableException);
      },
    );

    it('wraps a transport failure as TransactionSendException', async () => {
      const { service, submitTransaction } = createNetworkServiceTest();
      submitTransaction.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.sendTransaction(signedBlob, KnownCaip2ChainId.Mainnet),
      ).rejects.toBeInstanceOf(TransactionSendException);
    });

    it('rethrows NetworkServiceException from the client', async () => {
      const { service, submitTransaction } = createNetworkServiceTest();
      const error = new NetworkServiceException('upstream');
      submitTransaction.mockRejectedValue(error);

      await expect(
        service.sendTransaction(signedBlob, KnownCaip2ChainId.Mainnet),
      ).rejects.toStrictEqual(error);
    });
  });

  describe('getBaseFee', () => {
    it('reads server_info again when cache is omitted', async () => {
      const { service, fetchServerInfo } = createNetworkServiceTest();
      fetchServerInfo.mockResolvedValue(validatedServerInfo());

      const first = await service.getBaseFee(KnownCaip2ChainId.Mainnet);
      const second = await service.getBaseFee(KnownCaip2ChainId.Mainnet);

      expect(first).toStrictEqual(new BigNumber(10));
      expect(second).toStrictEqual(first);
      expect(fetchServerInfo).toHaveBeenCalledTimes(2);
    });

    it('returns the cached base fee when cache is true', async () => {
      const { service, fetchServerInfo } = createNetworkServiceTest();
      fetchServerInfo.mockResolvedValue(validatedServerInfo());

      await service.getBaseFee(KnownCaip2ChainId.Mainnet, {
        cache: true,
      });
      await service.getBaseFee(KnownCaip2ChainId.Mainnet, {
        cache: true,
      });

      expect(fetchServerInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchAccountInfo', () => {
    it('forwards the account and ledger selector to the client', async () => {
      const { service, fetchAccountInfo } = createNetworkServiceTest();
      const info = {
        status: 'success',
        validated: true,
        account_data: {
          Account: account,
          Balance: '1',
          Flags: 0,
          LedgerEntryType: 'AccountRoot',
          OwnerCount: 0,
          Sequence: 1,
        },
        account_flags: {
          defaultRipple: false,
          depositAuth: false,
          disableMasterKey: false,
          disallowIncomingXRP: false,
          globalFreeze: false,
          noFreeze: false,
          passwordSpent: false,
          requireAuthorization: false,
          requireDestinationTag: false,
        },
      };
      fetchAccountInfo.mockResolvedValue(info);

      const result = await service.fetchAccountInfo(
        account,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(info);
      expect(fetchAccountInfo).toHaveBeenCalledWith({
        account,
        ledger_index: LedgerState.Validated,
      });
    });

    it('throws AccountNotActivatedException when the account is missing', async () => {
      const { service, fetchAccountInfo } = createNetworkServiceTest();
      fetchAccountInfo.mockRejectedValue(
        new RpcResponseException('account_info', 'actNotFound', 'missing'),
      );

      await expect(
        service.fetchAccountInfo(account, KnownCaip2ChainId.Mainnet),
      ).rejects.toBeInstanceOf(AccountNotActivatedException);
    });
  });

  describe('fetchDepositAuthorized', () => {
    const destination = 'rN7n7otQDd6FczFgLdlqtyMVea5zArihM';

    it('returns deposit_authorized from the client', async () => {
      const { service, fetchDepositAuthorized } = createNetworkServiceTest();
      fetchDepositAuthorized.mockResolvedValue({
        status: 'success',
        validated: true,
        deposit_authorized: true,
      });

      const authorized = await service.fetchDepositAuthorized(
        account,
        destination,
        KnownCaip2ChainId.Mainnet,
      );

      expect(authorized).toBe(true);
      expect(fetchDepositAuthorized).toHaveBeenCalledWith({
        source_account: account,
        destination_account: destination,
        ledger_index: LedgerState.Validated,
      });
    });

    it('throws DestinationAccountNotActivatedException when the destination is missing', async () => {
      const { service, fetchDepositAuthorized } = createNetworkServiceTest();
      fetchDepositAuthorized.mockRejectedValue(
        new RpcResponseException(
          'deposit_authorized',
          'dstActNotFound',
          'missing',
        ),
      );

      await expect(
        service.fetchDepositAuthorized(
          account,
          destination,
          KnownCaip2ChainId.Mainnet,
        ),
      ).rejects.toBeInstanceOf(DestinationAccountNotActivatedException);
    });
  });

  describe('fetchTransaction', () => {
    it('returns the unwrapped tx result', async () => {
      const { service, fetchTransactionInfo } = createNetworkServiceTest();
      const tx = {
        status: 'success',
        validated: true,
        hash: transactionHash,
        meta: { TransactionResult: 'tesSUCCESS' },
      };
      fetchTransactionInfo.mockResolvedValue(tx);

      const result = await service.fetchTransaction(
        transactionHash,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(tx);
      expect(fetchTransactionInfo).toHaveBeenCalledWith({
        transaction: transactionHash,
      });
    });

    it('throws TransactionNotFoundException when the hash is missing', async () => {
      const { service, fetchTransactionInfo } = createNetworkServiceTest();
      fetchTransactionInfo.mockRejectedValue(
        new RpcResponseException('tx', 'txnNotFound', 'missing'),
      );

      await expect(
        service.fetchTransaction(transactionHash, KnownCaip2ChainId.Mainnet),
      ).rejects.toBeInstanceOf(TransactionNotFoundException);
    });
  });

  describe('fetchValidatedLedgerIndex', () => {
    it('returns ledger.ledger_index from the validated ledger', async () => {
      const { service, fetchLedgerInfo } = createNetworkServiceTest();
      fetchLedgerInfo.mockResolvedValue({
        status: 'success',
        validated: true,
        ledger: {
          ledger_hash: transactionHash,
          ledger_index: 42,
        },
      });

      const ledgerIndex = await service.fetchValidatedLedgerIndex(
        KnownCaip2ChainId.Mainnet,
      );

      expect(ledgerIndex).toStrictEqual(42);
      expect(fetchLedgerInfo).toHaveBeenCalledWith({
        ledger_index: LedgerState.Validated,
      });
    });
  });

  describe('fetchAccountTransactions', () => {
    const marker = { ledger: 108276784, seq: 4 };

    it('returns the only page when the response has no marker', async () => {
      const { service, fetchAccountTransactions } = createNetworkServiceTest();
      fetchAccountTransactions.mockResolvedValue({
        status: 'success',
        validated: true,
        transactions: [txEntry(transactionHash)],
      });

      const transactions = await service.fetchAccountTransactions(
        account,
        KnownCaip2ChainId.Mainnet,
      );

      expect(transactions).toStrictEqual([txEntry(transactionHash)]);
      expect(fetchAccountTransactions).toHaveBeenCalledTimes(1);
      expect(fetchAccountTransactions).toHaveBeenCalledWith({
        account,
        limit: 400,
      });
    });

    it('requests the next page with the ledger marker', async () => {
      const { service, fetchAccountTransactions } = createNetworkServiceTest();
      fetchAccountTransactions
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          transactions: [txEntry(transactionHash)],
          marker,
        })
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          transactions: [txEntry(`${transactionHash.slice(0, 62)}aa`)],
        });

      const transactions = await service.fetchAccountTransactions(
        account,
        KnownCaip2ChainId.Mainnet,
      );

      expect(transactions).toHaveLength(2);
      expect(fetchAccountTransactions).toHaveBeenNthCalledWith(2, {
        account,
        limit: 400,
        marker,
      });
    });
  });

  describe('fetchMptIssuances', () => {
    it('returns an empty list without a request when no assets are given', async () => {
      const { service, batchRead } = createNetworkServiceTest();

      const issuances = await service.fetchMptIssuances(
        [],
        KnownCaip2ChainId.Mainnet,
      );

      expect(issuances).toStrictEqual([]);
      expect(batchRead).not.toHaveBeenCalled();
    });

    it('reads AssetScale and the issuer through one batched ledger_entry call', async () => {
      const { service, batchRead } = createNetworkServiceTest();
      batchRead.mockResolvedValue([
        {
          node: {
            LedgerEntryType: 'MPTokenIssuance',
            AssetScale: 6,
            Issuer: issuer,
          },
        },
      ]);

      const issuances = await service.fetchMptIssuances(
        [assetId],
        KnownCaip2ChainId.Mainnet,
      );

      expect(issuances).toStrictEqual([
        {
          assetId,
          decimals: 6,
          issuer,
          name: undefined,
          symbol: undefined,
        },
      ]);
      expect(batchRead).toHaveBeenCalledTimes(1);
      const [reads] = batchRead.mock.calls[0] as [
        {
          method: string;
          params: { mpt_issuance: string; ledger_index: string };
        }[],
      ];
      expect(reads).toHaveLength(1);
      expect(reads[0]).toMatchObject({
        method: 'ledger_entry',
        params: {
          ledger_index: 'validated',
          mpt_issuance: issuanceId,
        },
      });
    });

    it('sends the 192-bit issuance id when the CAIP id is zero-padded', async () => {
      const { service, batchRead } = createNetworkServiceTest();
      const paddedAssetId = toCaip19MptAssetId(
        KnownCaip2ChainId.Mainnet,
        issuanceId,
      );
      batchRead.mockResolvedValue([
        {
          node: {
            LedgerEntryType: 'MPTokenIssuance',
            AssetScale: 2,
            Issuer: issuer,
          },
        },
      ]);

      await service.fetchMptIssuances(
        [paddedAssetId],
        KnownCaip2ChainId.Mainnet,
      );

      expect(batchRead).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            params: expect.objectContaining({
              mpt_issuance: issuanceId,
            }),
          }),
        ],
        {},
      );
    });

    it('uses 0 when the issuance omits AssetScale', async () => {
      const { service, batchRead } = createNetworkServiceTest();
      batchRead.mockResolvedValue([
        {
          node: {
            LedgerEntryType: 'MPTokenIssuance',
            Issuer: issuer,
          },
        },
      ]);

      const issuances = await service.fetchMptIssuances(
        [assetId],
        KnownCaip2ChainId.Mainnet,
      );

      expect(issuances).toStrictEqual([
        {
          assetId,
          decimals: 0,
          issuer,
          name: undefined,
          symbol: undefined,
        },
      ]);
    });

    it('omits a null slot and still returns the other issuances', async () => {
      const { service, batchRead } = createNetworkServiceTest();
      const otherAssetId = toCaip19MptAssetId(
        KnownCaip2ChainId.Mainnet,
        '11'.repeat(24),
      );
      batchRead.mockResolvedValue([
        null,
        {
          node: {
            LedgerEntryType: 'MPTokenIssuance',
            AssetScale: 4,
            Issuer: issuer,
          },
        },
      ]);

      const issuances = await service.fetchMptIssuances(
        [assetId, otherAssetId],
        KnownCaip2ChainId.Mainnet,
      );

      expect(issuances).toStrictEqual([
        {
          assetId: otherAssetId,
          decimals: 4,
          issuer,
          name: undefined,
          symbol: undefined,
        },
      ]);
    });

    it('omits a ledger entry that is not an issuance', async () => {
      const { service, batchRead } = createNetworkServiceTest();
      batchRead.mockResolvedValue([
        {
          node: {
            LedgerEntryType: 'MPToken',
          },
        },
      ]);

      const issuances = await service.fetchMptIssuances(
        [assetId],
        KnownCaip2ChainId.Mainnet,
      );

      expect(issuances).toStrictEqual([]);
    });
  });

  describe('fetchAccountTrustlines', () => {
    const usd = `xrpl:0/token:USD.${issuer}` as KnownCaip19IouAssetId;

    it('returns no lines without a request when the asset id list is empty', async () => {
      const { service, fetchTrustlinePage } = createNetworkServiceTest();

      const lines = await service.fetchAccountTrustlines({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });

      expect(lines).toStrictEqual([]);
      expect(fetchTrustlinePage).not.toHaveBeenCalled();
    });

    it('stops when the requested currency is on the page', async () => {
      const { service, fetchTrustlinePage } = createNetworkServiceTest();
      fetchTrustlinePage.mockResolvedValue({
        status: 'success',
        validated: true,
        account,
        marker: 'next',
        lines: [
          {
            account: issuer,
            balance: '1.5',
            currency: 'USD',
            limit: '10',
            quality_in: 0,
            quality_out: 0,
          },
          {
            account: issuer,
            balance: '2',
            currency: 'EUR',
            limit: '10',
            quality_in: 0,
            quality_out: 0,
          },
        ],
      });

      const lines = await service.fetchAccountTrustlines({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [usd],
      });

      expect(fetchTrustlinePage).toHaveBeenCalledTimes(1);
      expect(fetchTrustlinePage).toHaveBeenCalledWith({
        account,
        ledger_index: 'validated',
        limit: 400,
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ currency: 'USD', balance: '1.5' });
    });

    it('reads the next page when the currency is still missing', async () => {
      const { service, fetchTrustlinePage } = createNetworkServiceTest();
      fetchTrustlinePage
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          ledger_index: 100,
          marker: 'page-2',
          lines: [
            {
              account: issuer,
              balance: '2',
              currency: 'EUR',
              limit: '10',
              quality_in: 0,
              quality_out: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          marker: 'page-3',
          lines: [
            {
              account: issuer,
              balance: '1.5',
              currency: 'USD',
              limit: '10',
              quality_in: 0,
              quality_out: 0,
            },
          ],
        });

      const lines = await service.fetchAccountTrustlines({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [usd],
      });

      expect(fetchTrustlinePage).toHaveBeenCalledTimes(2);
      expect(fetchTrustlinePage).toHaveBeenNthCalledWith(2, {
        account,
        ledger_index: 100,
        limit: 400,
        marker: 'page-2',
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ currency: 'USD', balance: '1.5' });
    });

    it('reads every page when no asset id is set', async () => {
      const { service, fetchTrustlinePage } = createNetworkServiceTest();
      fetchTrustlinePage
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          ledger_index: 100,
          marker: 'page-2',
          lines: [
            {
              account: issuer,
              balance: '1.5',
              currency: 'USD',
              limit: '10',
              quality_in: 0,
              quality_out: 0,
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          lines: [
            {
              account: issuer,
              balance: '2',
              currency: 'EUR',
              limit: '10',
              quality_in: 0,
              quality_out: 0,
            },
          ],
        });

      const lines = await service.fetchAccountTrustlines({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(fetchTrustlinePage).toHaveBeenCalledTimes(2);
      expect(fetchTrustlinePage).toHaveBeenNthCalledWith(2, {
        account,
        ledger_index: 100,
        limit: 400,
        marker: 'page-2',
      });
      expect(lines).toHaveLength(2);
    });

    it('throws when a page has a marker but no ledger index to pin', async () => {
      const { service, fetchTrustlinePage } = createNetworkServiceTest();
      fetchTrustlinePage.mockResolvedValue({
        status: 'success',
        validated: true,
        account,
        marker: 'page-2',
        lines: [
          {
            account: issuer,
            balance: '1.5',
            currency: 'USD',
            limit: '10',
            quality_in: 0,
            quality_out: 0,
          },
        ],
      });

      await expect(
        service.fetchAccountTrustlines({
          accountAddress: account,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toBeInstanceOf(NetworkServiceException);

      expect(fetchTrustlinePage).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchAccountMptokens', () => {
    it('returns no holdings without a request when the asset id list is empty', async () => {
      const { service, fetchMptokenPage } = createNetworkServiceTest();

      const holdings = await service.fetchAccountMptokens({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });

      expect(holdings).toStrictEqual([]);
      expect(fetchMptokenPage).not.toHaveBeenCalled();
    });

    it('stops when the requested holding is on the page', async () => {
      const { service, fetchMptokenPage } = createNetworkServiceTest();
      const otherIssuanceId =
        '11FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
      fetchMptokenPage.mockResolvedValue({
        status: 'success',
        validated: true,
        account,
        marker: 'next',
        mptokens: [
          {
            mpt_id: transactionHash,
            account,
            mpt_issuance_id: issuanceId,
            mpt_amount: '1500000',
          },
          {
            mpt_id: transactionHash,
            account,
            mpt_issuance_id: otherIssuanceId,
            mpt_amount: '1',
          },
        ],
      });

      const holdings = await service.fetchAccountMptokens({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [assetId],
      });

      expect(fetchMptokenPage).toHaveBeenCalledTimes(1);
      expect(fetchMptokenPage).toHaveBeenCalledWith({
        account,
        ledger_index: 'validated',
        limit: 400,
      });
      expect(holdings).toHaveLength(1);
      expect(holdings[0]).toMatchObject({
        mpt_issuance_id: issuanceId,
        mpt_amount: '1500000',
      });
    });

    it('reads the next page when the holding is still missing', async () => {
      const { service, fetchMptokenPage } = createNetworkServiceTest();
      const otherIssuanceId =
        '11FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
      fetchMptokenPage
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          ledger_index: 100,
          marker: 'page-2',
          mptokens: [
            {
              mpt_id: transactionHash,
              account,
              mpt_issuance_id: otherIssuanceId,
              mpt_amount: '1',
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          marker: 'page-3',
          mptokens: [
            {
              mpt_id: transactionHash,
              account,
              mpt_issuance_id: issuanceId,
              mpt_amount: '1500000',
            },
          ],
        });

      const holdings = await service.fetchAccountMptokens({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [assetId],
      });

      expect(fetchMptokenPage).toHaveBeenCalledTimes(2);
      expect(fetchMptokenPage).toHaveBeenNthCalledWith(2, {
        account,
        ledger_index: 100,
        limit: 400,
        marker: 'page-2',
      });
      expect(holdings).toHaveLength(1);
      expect(holdings[0]).toMatchObject({
        mpt_issuance_id: issuanceId,
        mpt_amount: '1500000',
      });
    });

    it('reads every page when no asset id is set', async () => {
      const { service, fetchMptokenPage } = createNetworkServiceTest();
      const otherIssuanceId =
        '11FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
      fetchMptokenPage
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          ledger_index: 100,
          marker: 'page-2',
          mptokens: [
            {
              mpt_id: transactionHash,
              account,
              mpt_issuance_id: issuanceId,
              mpt_amount: '1500000',
            },
          ],
        })
        .mockResolvedValueOnce({
          status: 'success',
          validated: true,
          account,
          mptokens: [
            {
              mpt_id: transactionHash,
              account,
              mpt_issuance_id: otherIssuanceId,
              mpt_amount: '1',
            },
          ],
        });

      const holdings = await service.fetchAccountMptokens({
        accountAddress: account,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(fetchMptokenPage).toHaveBeenCalledTimes(2);
      expect(fetchMptokenPage).toHaveBeenNthCalledWith(2, {
        account,
        ledger_index: 100,
        limit: 400,
        marker: 'page-2',
      });
      expect(holdings).toHaveLength(2);
    });
  });
});
