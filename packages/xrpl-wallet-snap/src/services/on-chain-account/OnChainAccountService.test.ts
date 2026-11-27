import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import type { Mock } from 'vitest';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19MptAssetId,
} from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { NATIVE_ASSET_SYMBOL } from '../../constants';
import {
  getSlip44AssetId,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
} from '../../utils';
import type { AssetMetadataService } from '../asset-metadata';
import type { AssetsService } from '../assets';
import type { CoreMptAsset, CoreNativeAsset } from '../assets/api';
import type { NetworkService } from '../network';
import { AccountNotActivatedException } from '../network';
import type {
  AccountInfoResponse,
  AccountMptoken,
  TrustLine,
} from '../network/api';
import { OnChainAssetType } from './api';
import type { MptAssetBalance } from './api';
import { OnChainAccountException } from './exceptions';
import { MptHolderStatus } from './keyringBalance';
import type { OnChainAccount } from './OnChainAccount';
import { OnChainAccountService } from './OnChainAccountService';

function mptDecimals(
  account: OnChainAccount | null,
  id: KnownCaip19MptAssetId,
): number | undefined {
  const asset = account?.getAsset(id);
  if (asset?.type !== OnChainAssetType.Mpt) {
    return undefined;
  }
  return asset.decimals;
}

const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptAssetId = toCaip19MptAssetId(KnownCaip2ChainId.Mainnet, issuanceId);
const iouAssetId = toCaip19IouAssetId(KnownCaip2ChainId.Mainnet, 'USD', issuer);

type HoldingQuery = {
  accountAddress: string;
  scope: KnownCaip2ChainId;
  assetIds?: KnownCaip19AssetIdOrSlip44Id[];
};

function createOnChainAccountServiceTest({
  accountInfoError,
}: {
  accountInfoError?: Error;
} = {}): {
  service: OnChainAccountService;
  fetchAccountInfo: Mock;
  fetchAccountTrustlines: Mock;
  fetchAccountMptokens: Mock;
  fetchAndPersistMptAssetMetadata: Mock;
  getAccountAssetsByScope: Mock;
} {
  const fetchAccountInfo = vi.fn();
  if (accountInfoError) {
    fetchAccountInfo.mockRejectedValue(accountInfoError);
  } else {
    fetchAccountInfo.mockResolvedValue(accountInfo());
  }
  const fetchAccountTrustlines = vi.fn().mockResolvedValue([]);
  const fetchAccountMptokens = vi.fn().mockResolvedValue([]);
  const fetchAndPersistMptAssetMetadata = vi.fn().mockResolvedValue([]);
  const getAccountAssetsByScope = vi.fn();

  const service = new OnChainAccountService({
    logger: {
      withPrefix() {
        return this;
      },
      debug: vi.fn(),
    } as unknown as Logger,
    networkService: {
      fetchAccountInfo,
      fetchAccountTrustlines,
      fetchAccountMptokens,
    } as unknown as NetworkService,
    assetsService: {
      getAccountAssetsByScope,
    } as unknown as AssetsService,
    assetMetadataService: {
      fetchAndPersistMptAssetMetadata,
    } as unknown as AssetMetadataService,
  });

  return {
    service,
    fetchAccountInfo,
    fetchAccountTrustlines,
    fetchAccountMptokens,
    fetchAndPersistMptAssetMetadata,
    getAccountAssetsByScope,
  };
}

function accountInfo(): AccountInfoResponse {
  return {
    status: 'success',
    validated: true,
    account_data: {
      Account: address,
      Balance: '10000000',
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
}

function holding(): AccountMptoken {
  return {
    mpt_id: '0000000000000000000000000000000000000000000000000000000000000000',
    account: address,
    mpt_issuance_id: issuanceId,
    mpt_amount: '1500000',
  };
}

function trustline(): TrustLine {
  return {
    account: issuer,
    balance: '1.5',
    currency: 'USD',
    limit: '10',
    quality_in: 0,
    quality_out: 0,
  };
}

function mptMetadata(): {
  assetId: typeof mptAssetId;
  units: { symbol: typeof issuanceId; decimals: number }[];
}[] {
  return [
    {
      assetId: mptAssetId,
      units: [{ symbol: issuanceId, decimals: 6 }],
    },
  ];
}

function nativeCoreAsset(): CoreNativeAsset {
  return {
    id: getSlip44AssetId(KnownCaip2ChainId.Mainnet),
    chainId: KnownCaip2ChainId.Mainnet,
    balance: {
      amount: '10',
      metadata: {
        spendableBalance: '9000000',
        minimumReserveBalance: '1000000',
      },
    },
    metadata: { symbol: NATIVE_ASSET_SYMBOL, decimals: 6 },
  };
}

function mptCoreAsset(
  status: number = MptHolderStatus.HolderOptedIn,
): CoreMptAsset {
  return {
    id: mptAssetId,
    chainId: KnownCaip2ChainId.Mainnet,
    balance: {
      amount: '1.5',
      metadata: { status },
    },
    metadata: { symbol: issuanceId, decimals: 6 },
  };
}

describe('OnChainAccountService', () => {
  describe('isAccountActivated', () => {
    it.each([
      {
        name: 'checks activation without reading holdings',
        accountInfoError: undefined,
        activated: true,
      },
      {
        name: 'returns false when the account is not on the ledger',
        accountInfoError: new AccountNotActivatedException(
          address,
          KnownCaip2ChainId.Mainnet,
        ),
        activated: false,
      },
    ])('$name', async ({ accountInfoError, activated }) => {
      const {
        service,
        fetchAccountInfo,
        fetchAccountTrustlines,
        fetchAccountMptokens,
      } = createOnChainAccountServiceTest({ accountInfoError });

      const result = await service.isAccountActivated({
        address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(result).toStrictEqual(activated);
      expect(fetchAccountInfo).toHaveBeenCalledWith(
        address,
        KnownCaip2ChainId.Mainnet,
      );
      expect(fetchAccountTrustlines).not.toHaveBeenCalled();
      expect(fetchAccountMptokens).not.toHaveBeenCalled();
    });

    it('rethrows errors that are not a missing account', async () => {
      const { service } = createOnChainAccountServiceTest({
        accountInfoError: new Error('rpc down'),
      });

      await expect(
        service.isAccountActivated({
          address,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow('rpc down');
    });
  });

  describe('fetchAccountWithBalances', () => {
    it('loads an account with only the requested holdings', async () => {
      const { service, fetchAccountTrustlines, fetchAccountMptokens } =
        createOnChainAccountServiceTest();
      fetchAccountTrustlines.mockResolvedValue([trustline()]);

      const account = await service.fetchAccountWithBalances(
        address,
        KnownCaip2ChainId.Mainnet,
        [iouAssetId],
      );

      expect(account.getAsset(iouAssetId)?.type).toStrictEqual(
        OnChainAssetType.Iou,
      );
      expect(fetchAccountTrustlines).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [iouAssetId],
      });
      expect(fetchAccountMptokens).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });
    });
  });

  describe('fetchAccountWithAllAssetsBalances', () => {
    it('loads every holding for a full account', async () => {
      const { service, fetchAccountTrustlines, fetchAccountMptokens } =
        createOnChainAccountServiceTest();

      const account = await service.fetchAccountWithAllAssetsBalances(
        address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(account.sequenceNumber).toBe('1');
      expect(fetchAccountTrustlines).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });
      expect(fetchAccountMptokens).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });
    });
  });

  describe('fetchAccount', () => {
    it.each([
      {
        name: 'loads the account root without holdings',
        useCache: undefined,
        cache: false,
      },
      {
        name: 'reuses cached account_info when useCache is true',
        useCache: true,
        cache: true,
      },
    ])('$name', async ({ useCache, cache }) => {
      const {
        service,
        fetchAccountInfo,
        fetchAccountTrustlines,
        fetchAccountMptokens,
      } = createOnChainAccountServiceTest();

      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        useCache,
      });

      expect(fetchAccountInfo).toHaveBeenCalledWith(
        address,
        KnownCaip2ChainId.Mainnet,
        undefined,
        { cache },
      );
      expect(fetchAccountTrustlines).not.toHaveBeenCalled();
      expect(fetchAccountMptokens).not.toHaveBeenCalled();
      expect(account.sequenceNumber).toBe('1');
      expect(account.nativeRawBalance.toFixed(0)).toBe('10000000');
    });

    it('keeps lsfRequireDestTag from account_info', async () => {
      const { service, fetchAccountInfo } = createOnChainAccountServiceTest();
      const info = accountInfo();
      info.account_data.Flags = 0x00020000;
      fetchAccountInfo.mockResolvedValue(info);

      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(account.requireDestTag).toBe(true);
    });
  });

  describe('bindAssetsBalancesFromOnChain', () => {
    it.each<{
      name: string;
      assetIds: 'all' | KnownCaip19AssetIdOrSlip44Id[];
      trustlines: HoldingQuery;
      mptokens: HoldingQuery;
    }>([
      {
        name: 'binds every holding when the caller asks for all',
        assetIds: 'all',
        trustlines: {
          accountAddress: address,
          scope: KnownCaip2ChainId.Mainnet,
        },
        mptokens: {
          accountAddress: address,
          scope: KnownCaip2ChainId.Mainnet,
        },
      },
      {
        name: 'binds only the requested MPT holding',
        assetIds: [mptAssetId],
        trustlines: {
          accountAddress: address,
          scope: KnownCaip2ChainId.Mainnet,
          assetIds: [],
        },
        mptokens: {
          accountAddress: address,
          scope: KnownCaip2ChainId.Mainnet,
          assetIds: [mptAssetId],
        },
      },
    ])('$name', async ({ assetIds, trustlines, mptokens }) => {
      const {
        service,
        fetchAccountTrustlines,
        fetchAccountMptokens,
        fetchAndPersistMptAssetMetadata,
      } = createOnChainAccountServiceTest();
      fetchAccountMptokens.mockResolvedValue([holding()]);
      fetchAndPersistMptAssetMetadata.mockResolvedValue(mptMetadata());
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await service.bindAssetsBalancesFromOnChain(
        account,
        KnownCaip2ChainId.Mainnet,
        assetIds,
      );

      expect(fetchAccountTrustlines).toHaveBeenCalledWith(trustlines);
      expect(fetchAccountMptokens).toHaveBeenCalledWith(mptokens);
      expect(fetchAndPersistMptAssetMetadata).toHaveBeenCalledWith({
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [mptAssetId],
      });
      expect(mptDecimals(account, mptAssetId)).toBe(6);
    });

    it.each([
      {
        name: 'binds only the requested trust line',
        line: trustline(),
        raw: { type: OnChainAssetType.Iou },
      },
      {
        name: 'stores a self-freeze on the trust line',
        line: {
          ...trustline(),
          freeze: true,
        },
        raw: {
          type: OnChainAssetType.Iou,
          freeze: true,
        },
      },
    ])('$name', async ({ line, raw }) => {
      const { service, fetchAccountTrustlines, fetchAccountMptokens } =
        createOnChainAccountServiceTest();
      fetchAccountTrustlines.mockResolvedValue([line]);
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await service.bindAssetsBalancesFromOnChain(
        account,
        KnownCaip2ChainId.Mainnet,
        [iouAssetId],
      );

      expect(fetchAccountTrustlines).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [iouAssetId],
      });
      expect(fetchAccountMptokens).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });
      expect(account.getAsset(iouAssetId)?.type).toStrictEqual(
        OnChainAssetType.Iou,
      );
      expect(account.getRawAsset(iouAssetId)).toMatchObject(raw);
    });

    it('skips a requested MPT holding that is not on the ledger', async () => {
      const { service, fetchAndPersistMptAssetMetadata } =
        createOnChainAccountServiceTest();
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await service.bindAssetsBalancesFromOnChain(
        account,
        KnownCaip2ChainId.Mainnet,
        [mptAssetId],
      );

      expect(fetchAndPersistMptAssetMetadata).not.toHaveBeenCalled();
      expect(account.getAsset(mptAssetId)).toBeUndefined();
    });

    it('does not read holdings when the asset id list is empty', async () => {
      const {
        service,
        fetchAccountTrustlines,
        fetchAccountMptokens,
        fetchAndPersistMptAssetMetadata,
      } = createOnChainAccountServiceTest();
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await service.bindAssetsBalancesFromOnChain(
        account,
        KnownCaip2ChainId.Mainnet,
        [],
      );

      expect(fetchAccountTrustlines).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });
      expect(fetchAccountMptokens).toHaveBeenCalledWith({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
        assetIds: [],
      });
      expect(fetchAndPersistMptAssetMetadata).not.toHaveBeenCalled();
    });

    it('fails closed when an MPT issuance is missing', async () => {
      const {
        service,
        fetchAccountTrustlines,
        fetchAccountMptokens,
        fetchAndPersistMptAssetMetadata,
      } = createOnChainAccountServiceTest();
      fetchAccountTrustlines.mockResolvedValue([trustline()]);
      fetchAccountMptokens.mockResolvedValue([holding()]);
      fetchAndPersistMptAssetMetadata.mockResolvedValue([]);
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await expect(
        service.bindAssetsBalancesFromOnChain(
          account,
          KnownCaip2ChainId.Mainnet,
          'all',
        ),
      ).rejects.toThrow(
        new OnChainAccountException('MPT issuance scale missing'),
      );
      expect(account.getAsset(iouAssetId)).toBeUndefined();
      expect(account.getAsset(mptAssetId)).toBeUndefined();
    });

    it('does not leave trust lines bound when an MPT holding fails validation', async () => {
      const {
        service,
        fetchAccountTrustlines,
        fetchAccountMptokens,
        fetchAndPersistMptAssetMetadata,
      } = createOnChainAccountServiceTest();
      fetchAccountTrustlines.mockResolvedValue([trustline()]);
      fetchAccountMptokens.mockResolvedValue([
        {
          ...holding(),
          mpt_amount: '100',
          locked_amount: '200',
        },
      ]);
      fetchAndPersistMptAssetMetadata.mockResolvedValue(mptMetadata());
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await expect(
        service.bindAssetsBalancesFromOnChain(
          account,
          KnownCaip2ChainId.Mainnet,
          'all',
        ),
      ).rejects.toThrow(OnChainAccountException);
      expect(account.getAsset(iouAssetId)).toBeUndefined();
      expect(account.getAsset(mptAssetId)).toBeUndefined();
    });

    it('binds a locked MPT holding with zero spendable balance', async () => {
      const { service, fetchAccountMptokens, fetchAndPersistMptAssetMetadata } =
        createOnChainAccountServiceTest();
      fetchAccountMptokens.mockResolvedValue([
        {
          ...holding(),
          locked_amount: '500000',
          mpt_locked: true,
        },
      ]);
      fetchAndPersistMptAssetMetadata.mockResolvedValue(mptMetadata());
      const account = await service.fetchAccount({
        accountAddress: address,
        scope: KnownCaip2ChainId.Mainnet,
      });

      await service.bindAssetsBalancesFromOnChain(
        account,
        KnownCaip2ChainId.Mainnet,
        [mptAssetId],
      );

      const asset = account.getRawAsset(mptAssetId) as MptAssetBalance;
      expect(asset).toMatchObject({
        type: OnChainAssetType.Mpt,
        mptLocked: true,
        balance: new BigNumber(0),
        mptAmount: new BigNumber('1500000'),
        lockedAmount: new BigNumber('500000'),
      });
    });
  });

  describe('resolveFromController', () => {
    it('returns null when the controller has no native XRP row', async () => {
      const { service, getAccountAssetsByScope } =
        createOnChainAccountServiceTest();
      getAccountAssetsByScope.mockResolvedValue([mptCoreAsset()]);

      const account = await service.resolveFromController(
        'account-id',
        address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(account).toBeNull();
    });

    it('stores the controller asset scale on an MPT holding', async () => {
      const {
        service,
        fetchAndPersistMptAssetMetadata,
        getAccountAssetsByScope,
      } = createOnChainAccountServiceTest();
      getAccountAssetsByScope.mockResolvedValue([
        nativeCoreAsset(),
        mptCoreAsset(),
      ]);

      const account = await service.resolveFromController(
        'account-id',
        address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(fetchAndPersistMptAssetMetadata).not.toHaveBeenCalled();
      expect(account?.nativeRawBalance.toFixed(0)).toBe('10000000');
      expect(mptDecimals(account, mptAssetId)).toBe(6);
      const mpt = account?.getRawAsset(mptAssetId) as MptAssetBalance;
      expect(mpt.type).toBe(OnChainAssetType.Mpt);
      expect(mpt.mptAuthorized).not.toBe(true);
    });

    it('maps controller issuer-authorized status onto mptAuthorized', async () => {
      const { service, getAccountAssetsByScope } =
        createOnChainAccountServiceTest();
      getAccountAssetsByScope.mockResolvedValue([
        nativeCoreAsset(),
        mptCoreAsset(
          // eslint-disable-next-line no-bitwise -- HolderOptedIn | IssuerAuthorized
          MptHolderStatus.HolderOptedIn | MptHolderStatus.IssuerAuthorized,
        ),
      ]);

      const account = await service.resolveFromController(
        'account-id',
        address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(account?.getRawAsset(mptAssetId)).toMatchObject({
        type: OnChainAssetType.Mpt,
        mptAuthorized: true,
      });
    });
  });
});
