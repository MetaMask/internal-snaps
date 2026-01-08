import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type { Resource } from 'tronweb/lib/esm/types';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { CONSENSYS_SR_NODE_ADDRESS, KnownCaip19Id } from '../../constants';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import { BackgroundEventMethod } from '../../handlers/cronjob';
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
    this.#logger.info(
      `Staking ${amount.toString()} ${assetId} from ${account.address} for ${purpose}...`,
    );

    const { chainId } = parseCaipAssetType(assetId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(
      chainId as Network,
      privateKeyHex,
    );

    const amountInSun = amount.multipliedBy(10 ** 6).toNumber();
    const stakingTransaction = await tronWeb.transactionBuilder.freezeBalanceV2(
      amountInSun,
      purpose,
      account.address,
    );

    const signedStakingTransaction = await tronWeb.trx.sign(stakingTransaction);

    await tronWeb.trx.sendRawTransaction(signedStakingTransaction);

    /**
     * The amount of votes available from a stake is the closest integer to the amount of TRX staked.
     */
    const availableVotes = amount.integerValue(BigNumber.ROUND_DOWN).toNumber();

    /**
     * Use the provided SR node address or default to Consensys SR node.
     */
    const voteRecipient = srNodeAddress ?? CONSENSYS_SR_NODE_ADDRESS;

    const voteAllocationTransaction = await tronWeb.transactionBuilder.vote(
      {
        [voteRecipient]: availableVotes,
      },
      account.address,
    );

    const voteAllocationSignedTransaction = await tronWeb.trx.sign(
      voteAllocationTransaction,
    );

    await tronWeb.trx.sendRawTransaction(voteAllocationSignedTransaction);

    /**
     * Sync account after the transaction happens
     */
    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.SynchronizeAccount,
      params: { accountId: account.id },
      duration: 'PT5S',
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
    this.#logger.info(
      `Unstaking ${amount.toString()} ${assetId} from ${account.address}...`,
    );

    const { chainId } = parseCaipAssetType(assetId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(
      chainId as Network,
      privateKeyHex,
    );

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

    const amountInSun = amount.multipliedBy(10 ** 6).toNumber();
    const transaction = await tronWeb.transactionBuilder.unfreezeBalanceV2(
      amountInSun,
      purpose,
      account.address,
    );

    const signedTx = await tronWeb.trx.sign(transaction);

    await tronWeb.trx.sendRawTransaction(signedTx);

    /**
     * Sync account after the transaction happens
     */
    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.SynchronizeAccount,
      params: { accountId: account.id },
      duration: 'PT5S',
    });
  }
}
