import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';
import type { SignedTransaction, Transaction } from 'tronweb/lib/esm/types';

import type { ComputeFeeResult } from './types';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
// import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { Networks } from '../../constants';
import { getIconUrlForKnownAsset } from '../../ui/confirmation/utils/getIconUrlForKnownAsset';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

export class FeeCalculatorService {
  readonly #logger: ILogger;

  // readonly #tronWebFactory: TronWebFactory;

  readonly #trongridApiClient: TrongridApiClient;

  constructor({
    logger,
    // tronWebFactory,
    trongridApiClient,
  }: {
    logger: ILogger;
    // tronWebFactory: TronWebFactory;
    trongridApiClient: TrongridApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💸 FeeCalculatorService]');
    // this.#tronWebFactory = tronWebFactory;
    this.#trongridApiClient = trongridApiClient;
  }

  /**
   * The bandwidth needed for a transaction is the size of the transaction in bytes.
   * You can get the total length of a transaction by adding the following lengths:
   * - The length of the raw_data_hex
   * - The length of the first signature which is 65 bytes
   * - MAX_RESULT_SIZE_IN_TX in the data which is 64 bytes
   * - Protobuf LEN typed tag and len-prefix which is 5 bytes
   *
   * See: https://github.com/tronprotocol/wallet-cli/issues/292
   *
   * @param transaction - The base64 encoded transaction
   * @returns number - The calculated bandwidth in TRX
   */
  #calculateBandwidth(transaction: SignedTransaction & Transaction): BigNumber {
    const transactionByteLength =
      // eslint-disable-next-line no-restricted-globals
      Buffer.from(transaction.raw_data_hex, 'hex').byteLength + 134;
    return BigNumber(transactionByteLength);
  }

  /**
   * Calculate the energy requirements for a TRON transaction.
   * Depends on the type of contracts in the transaction.
   *
   * @param transaction - The base64 encoded transaction
   * @returns Promise<BigNumber> - The calculated energy consumption
   */
  async #calculateEnergy(
    // scope: Network,
    transaction: SignedTransaction & Transaction,
  ): Promise<BigNumber> {
    const contracts = transaction.raw_data.contract;

    if (!contracts || contracts.length === 0) {
      this.#logger.log(
        'No contracts found in transaction, assuming zero energy usage',
      );
      return BigNumber(0);
    }

    let totalEnergy = BigNumber(0);

    for (const contract of contracts) {
      const contractType = contract.type as string;
      this.#logger.log(`Calculating energy for contract type: ${contractType}`);

      let currentContractEnergy: BigNumber;

      switch (contractType) {
        /**
         * Native TRX transfers + TRC10 token transfers don't consume energy
         */
        case 'TransferContract':
        case 'TransferAssetContract':
          currentContractEnergy = BigNumber(0);
          break;
        /**
         * TRC20
         */
        case 'TriggerSmartContract': {
          // currentContractEnergy = BigNumber(
          //   await this.#estimateTriggerSmartContractEnergy(
          //     scope,
          //     contract as TransactionContract<TriggerSmartContract>,
          //   ),
          // );
          currentContractEnergy = BigNumber(130000);
          break;
        }
        default:
          this.#logger.warn(
            `Unknown contract type: ${contractType}, using conservative estimate`,
          );
          currentContractEnergy = BigNumber(130000); // Conservative estimate
          break;
      }

      this.#logger.log(
        `Contract ${contractType} energy: ${currentContractEnergy.toString()}`,
      );
      totalEnergy = totalEnergy.plus(currentContractEnergy);
    }

    this.#logger.log(`Total energy for transaction: ${totalEnergy.toString()}`);

    return totalEnergy;
  }

  // /**
  //  * Estimate energy consumption for contract calls of type TriggerSmartContract (V2).
  //  * Uses direct TronGrid API call bypassing TronWeb for better reliability.
  //  *
  //  * @param scope - The network scope for the contract
  //  * @param contract - The contract object from the transaction
  //  * @returns Promise<number> - The estimated energy consumption (defaults to 65000 if estimation fails)
  //  */
  // async #estimateTriggerSmartContractEnergy(
  //   scope: Network,
  //   contract: TransactionContract<TriggerSmartContract>,
  // ): Promise<number> {
  //   try {
  //     const {
  //       data,
  //       owner_address: ownerAddress,
  //       contract_address: contractAddress,
  //     } = contract.parameter.value;

  //     if (!data) {
  //       this.#logger.warn('No data field found in contract, using fallback');
  //       return 130000;
  //     }

  //     this.#logger.log(
  //       {
  //         contractAddress,
  //         ownerAddress,
  //         data,
  //       },
  //       'Estimating smart contract energy (V2 - Direct TronGrid)',
  //     );

  //     const result = await this.#trongridApiClient.triggerConstantContract(
  //       scope,
  //       {
  //         /**
  //          * These addresses are in hex format. If they weren't we would need to
  //          * pass `visible: true` to the request.
  //          */
  //         owner_address: ownerAddress,
  //         contract_address: contractAddress,
  //         function_selector: 'transfer(address,uint256)',
  //         parameter: data,
  //       },
  //     );

  //     if (result.energy_used) {
  //       this.#logger.log(
  //         {
  //           energyUsed: result.energy_used,
  //           energyPenalty: result.energy_penalty,
  //         },
  //         'Energy estimation from TronGrid API',
  //       );
  //       return result.energy_used;
  //     }

  //     this.#logger.warn('No energy_used in result, using fallback');
  //     return 130000;
  //   } catch (error) {
  //     this.#logger.error(
  //       { error },
  //       'Failed to estimate smart contract energy (V2), using fallback',
  //     );
  //     return 130000;
  //   }
  // }

  /**
   * Calculate complete fee breakdown for a TRON transaction
   * Handles both free resource consumption and TRX costs for overages
   *
   * @param params - The parameters for the fee calculation
   * @param params.scope - The network scope for the transaction
   * @param params.transaction - The base64 encoded transaction
   * @param params.availableEnergy - Available energy from account
   * @param params.availableBandwidth - Available bandwidth from account
   * @returns Promise<ComputeFeeResult> - Complete fee breakdown
   */
  async computeFee({
    scope,
    transaction,
    availableEnergy,
    availableBandwidth,
  }: {
    scope: Network;
    transaction: SignedTransaction & Transaction;
    availableEnergy: BigNumber;
    availableBandwidth: BigNumber;
  }): Promise<ComputeFeeResult> {
    this.#logger.log(
      'Calculating fee for transaction ',
      JSON.stringify(transaction),
    );

    const bandwidthNeeded = this.#calculateBandwidth(transaction);
    // const energyNeeded = await this.#calculateEnergy(scope, transaction);
    const energyNeeded = await this.#calculateEnergy(transaction);

    // Calculate consumption and overages:
    // - Bandwidth: If we don't have enough, we pay for ALL of it in TRX (no partial consumption)
    // - Energy: We consume what we have available, and pay TRX only for the overage
    const hasEnoughBandwidth =
      availableBandwidth.isGreaterThanOrEqualTo(bandwidthNeeded);
    const bandwidthConsumed = hasEnoughBandwidth
      ? bandwidthNeeded
      : BigNumber(0);
    const bandwidthToPayInTRX = hasEnoughBandwidth
      ? BigNumber(0)
      : bandwidthNeeded;

    const energyConsumed = BigNumber.min(energyNeeded, availableEnergy);
    const energyToPayInTRX = BigNumber.max(
      energyNeeded.minus(availableEnergy),
      0,
    );

    const result: ComputeFeeResult = [];

    // Add energy consumption fee if we're consuming any energy
    if (energyConsumed.isGreaterThan(0)) {
      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].energy.symbol,
          type: Networks[scope].energy.id,
          amount: energyConsumed.toString(),
          fungible: true as const,
          imageSvg: getIconUrlForKnownAsset(Networks[scope].energy.id) ?? '',
        },
      });
    }

    // Add bandwidth consumption fee if we're consuming any bandwidth
    if (bandwidthConsumed.isGreaterThan(0)) {
      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].bandwidth.symbol,
          type: Networks[scope].bandwidth.id,
          amount: bandwidthConsumed.toString(),
          fungible: true as const,
          imageSvg: getIconUrlForKnownAsset(Networks[scope].bandwidth.id) ?? '',
        },
      });
    }

    // Add TRX fee if we need to pay for bandwidth or energy overages
    if (
      bandwidthToPayInTRX.isGreaterThan(0) ||
      energyToPayInTRX.isGreaterThan(0)
    ) {
      const chainParameters =
        await this.#trongridApiClient.getChainParameters(scope);

      const bandwidthCost =
        chainParameters.find((param) => param.key === 'getTransactionFee')
          ?.value ?? 1000; // Fallback to 1000 SUN per bandwidth
      const energyCost =
        chainParameters.find((param) => param.key === 'getEnergyFee')?.value ??
        100; // Fallback to 100 SUN per energy

      // Calculate TRX cost for bandwidth and energy that needs to be paid
      const bandwidthCostTRX = bandwidthToPayInTRX
        .multipliedBy(bandwidthCost)
        .div(1_000_000); // Convert SUN to TRX
      const energyCostTRX = energyToPayInTRX
        .multipliedBy(energyCost)
        .div(1_000_000); // Convert SUN to TRX
      const totalCostTRX = bandwidthCostTRX.plus(energyCostTRX);

      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].nativeToken.symbol,
          type: Networks[scope].nativeToken.id,
          amount: totalCostTRX.toFixed(6),
          fungible: true as const,
          imageSvg:
            getIconUrlForKnownAsset(Networks[scope].nativeToken.id) ?? '',
        },
      });
    }

    return result;
  }
}
