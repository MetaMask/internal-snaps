import { parseCaipAssetType } from '@metamask/utils';
import type { Resource } from 'tronweb/lib/esm/types';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { KnownCaip19Id } from '../../constants';
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
  }: {
    account: TronKeyringAccount;
    assetId: NativeCaipAssetType;
    amount: BigNumber;
    purpose: 'BANDWIDTH' | 'ENERGY';
  }): Promise<void> {
    this.#logger.info(
      `Staking ${amount.toString()} ${assetId} from ${account.address} for ${purpose}...`,
    );
    console.log(
      `[debug] [stake] All params`,
      JSON.stringify({ account, assetId, amount, purpose }),
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
    const transaction = await tronWeb.transactionBuilder.freezeBalanceV2(
      amountInSun,
      purpose,
      account.address,
    );
    console.log(`[debug] [stake] Transaction`, JSON.stringify(transaction));

    const signedTx = await tronWeb.trx.sign(transaction);
    console.log(`[debug] [stake] Transaction`, JSON.stringify(transaction));

    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    console.log(`[debug] [stake] Result`, JSON.stringify(result));

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
    console.log(
      `[debug] [unstake] All params`,
      JSON.stringify({ account, assetId, amount }),
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
        KnownCaip19Id.TrxStakedForBandwidthLocalnet,
      ].includes(assetId as KnownCaip19Id)
    ) {
      purpose = 'BANDWIDTH';
    }

    if (
      [
        KnownCaip19Id.TrxStakedForEnergyMainnet,
        KnownCaip19Id.TrxStakedForEnergyNile,
        KnownCaip19Id.TrxStakedForEnergyShasta,
        KnownCaip19Id.TrxStakedForEnergyLocalnet,
      ].includes(assetId as KnownCaip19Id)
    ) {
      purpose = 'ENERGY';
    }

    console.log(`[debug] [unstake] Purpose`, JSON.stringify(purpose));

    if (!purpose) {
      throw new Error('Invalid asset ID');
    }

    const amountInSun = amount.multipliedBy(10 ** 6).toNumber();
    const transaction = await tronWeb.transactionBuilder.unfreezeBalanceV2(
      amountInSun,
      purpose,
      account.address,
    );
    console.log(`[debug] [unstake] Transaction`, JSON.stringify(transaction));

    const signedTx = await tronWeb.trx.sign(transaction);
    console.log(
      `[debug] [unstake] Signed transaction`,
      JSON.stringify(signedTx),
    );

    const result = await tronWeb.trx.sendRawTransaction(signedTx);
    console.log(`[debug] [unstake] Result`, JSON.stringify(result));

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
