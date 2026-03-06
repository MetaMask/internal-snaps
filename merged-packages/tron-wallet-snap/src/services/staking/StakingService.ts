import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type { Resource } from 'tronweb/lib/esm/types';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { CONSENSYS_SR_NODE_ADDRESS, KnownCaip19Id } from '../../constants';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import { trxToSun } from '../../utils/conversion';
import { executeOnChainActions } from '../../utils/executeOnChainActions';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';
import type { AccountsService } from '../accounts/AccountsService';
import type { NativeCaipAssetType, StakedCaipAssetType } from '../assets/types';

export class StakingService {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #tronWebFactory: TronWebFactory;

  readonly #snapClient: SnapClient;

  constructor({
    logger,
    accountsService,
    tronWebFactory,
    snapClient,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    tronWebFactory: TronWebFactory;
    snapClient: SnapClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💸 StakingService]');
    this.#accountsService = accountsService;
    this.#tronWebFactory = tronWebFactory;
    this.#snapClient = snapClient;
  }

  async stake({
    account,
    assetId,
    amount,
    purpose,
    srNodeAddress,
  }: {
    account: TronKeyringAccount;
    assetId: NativeCaipAssetType;
    amount: BigNumber;
    purpose: 'BANDWIDTH' | 'ENERGY';
    /**
     * Optional SR node address to allocate votes to.
     * If not provided, defaults to the Consensys SR node.
     */
    srNodeAddress?: string;
  }): Promise<void> {
    const { chainId } = parseCaipAssetType(assetId);
    const amountInSun = Number(trxToSun(amount));
    const availableVotes = amount.integerValue(BigNumber.ROUND_DOWN).toNumber();
    const voteRecipient = srNodeAddress ?? CONSENSYS_SR_NODE_ADDRESS;

    this.#logger.info(
      `Staking ${amount.toString()} ${assetId} for ${purpose} for ${account.address} on ${chainId}...`,
    );

    await executeOnChainActions({
      accountsService: this.#accountsService,
      tronWebFactory: this.#tronWebFactory,
      snapClient: this.#snapClient,
      account,
      scope: chainId as Network,
      buildTransactions: async (tronWeb) => [
        await tronWeb.transactionBuilder.freezeBalanceV2(
          amountInSun,
          purpose,
          account.address,
        ),
        await tronWeb.transactionBuilder.vote(
          { [voteRecipient]: availableVotes },
          account.address,
        ),
      ],
    });
  }

  async unstake({
    account,
    assetId,
    amount,
  }: {
    account: TronKeyringAccount;
    assetId: StakedCaipAssetType;
    amount: BigNumber;
  }): Promise<void> {
    const { chainId } = parseCaipAssetType(assetId);

    /**
     * Check which resource we are unstaking.
     */
    let purpose: Resource | undefined;

    if (
      [
        KnownCaip19Id.TrxStakedForBandwidthMainnet,
        KnownCaip19Id.TrxStakedForBandwidthNile,
        KnownCaip19Id.TrxStakedForBandwidthShasta,
      ].includes(assetId as KnownCaip19Id)
    ) {
      purpose = 'BANDWIDTH';
    }

    if (
      [
        KnownCaip19Id.TrxStakedForEnergyMainnet,
        KnownCaip19Id.TrxStakedForEnergyNile,
        KnownCaip19Id.TrxStakedForEnergyShasta,
      ].includes(assetId as KnownCaip19Id)
    ) {
      purpose = 'ENERGY';
    }

    if (!purpose) {
      throw new Error('Invalid asset ID');
    }

    const amountInSun = Number(trxToSun(amount));

    this.#logger.info(
      `Unstaking ${amount.toString()} ${assetId} for ${account.address} on ${chainId}...`,
    );

    await executeOnChainActions({
      accountsService: this.#accountsService,
      tronWebFactory: this.#tronWebFactory,
      snapClient: this.#snapClient,
      account,
      scope: chainId as Network,
      buildTransactions: async (tronWeb) => [
        await tronWeb.transactionBuilder.unfreezeBalanceV2(
          amountInSun,
          purpose,
          account.address,
        ),
      ],
    });
  }

  async claimUnstakedTrx({
    account,
    scope,
  }: {
    account: TronKeyringAccount;
    scope: Network;
  }): Promise<void> {
    this.#logger.info(
      `Claiming unstaked TRX for ${account.address} on ${scope}...`,
    );

    await executeOnChainActions({
      accountsService: this.#accountsService,
      tronWebFactory: this.#tronWebFactory,
      snapClient: this.#snapClient,
      account,
      scope,
      buildTransactions: async (tronWeb) => [
        await tronWeb.transactionBuilder.withdrawExpireUnfreeze(
          account.address,
        ),
      ],
    });
  }
}
