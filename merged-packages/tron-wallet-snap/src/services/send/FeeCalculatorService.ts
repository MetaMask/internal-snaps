import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';
import type { Contract } from 'tronweb';

import type { ComputeFeeResult } from './types';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { Networks } from '../../constants';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

export class FeeCalculatorService {
  readonly #logger: ILogger;

  readonly #tronWebFactory: TronWebFactory;

  readonly #trongridApiClient: TrongridApiClient;

  constructor({
    logger,
    tronWebFactory,
    trongridApiClient,
  }: {
    logger: ILogger;
    tronWebFactory: TronWebFactory;
    trongridApiClient: TrongridApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💸 FeeCalculatorService]');
    this.#tronWebFactory = tronWebFactory;
    this.#trongridApiClient = trongridApiClient;
  }

  /**
   * Calculate the energy requirements for a TRON transaction
   *
   * @param scope - The network scope for the transaction
   * @param transaction - The base64 encoded transaction
   * @returns Promise<number> - The calculated energy consumption
   */
  async #calculateEnergy(
    scope: Network,
    transaction: string,
  ): Promise<BigNumber> {
    try {
      // Decode the transaction from base64
      let txObj: any = null;

      try {
        // eslint-disable-next-line no-restricted-globals
        txObj = JSON.parse(Buffer.from(transaction, 'base64').toString());
      } catch (parseError) {
        this.#logger.warn({ error: parseError }, 'Failed to parse transaction');
        throw new Error('Invalid transaction format');
      }

      if (!txObj?.raw_data?.contract?.[0]) {
        throw new Error('Invalid transaction structure');
      }

      const contract = txObj.raw_data.contract[0];
      const contractType = contract.type;

      this.#logger.log(`Calculating energy for contract type: ${contractType}`);

      switch (contractType) {
        case 'TransferContract':
          // Native TRX transfers don't consume energy
          return BigNumber(0);

        case 'TransferAssetContract':
          // TRC10 token transfers don't consume energy
          return BigNumber(0);

        case 'TriggerSmartContract': {
          // For smart contracts, try to estimate energy using triggerconstantcontract
          return BigNumber(
            await this.#estimateSmartContractEnergy(scope, contract),
          );
        }

        default:
          this.#logger.warn(
            `Unknown contract type: ${contractType}, using conservative estimate`,
          );
          return BigNumber(100000); // Conservative estimate
      }
    } catch (error) {
      this.#logger.error({ error }, 'Failed to calculate energy usage');
      throw error;
    }
  }

  /**
   * The bandwidth needed for a transaction is the size of the transaction in bytes
   * multiplied by the price per byte, which is currently 1000 SUN per byte.
   *
   * @param transaction - The base64 encoded transaction
   * @returns number - The calculated bandwidth in SUN
   */
  #calculateBandwidth(transaction: string): BigNumber {
    // eslint-disable-next-line no-restricted-globals
    const decodedBytes = Buffer.from(transaction, 'base64');
    const byteSize = decodedBytes.length;
    return BigNumber(byteSize * 1000);
  }

  /**
   * Estimate energy consumption for smart contract execution
   * Uses the triggerconstantcontract API to simulate execution
   *
   * @param scope - The network scope for the contract
   * @param contract - The contract object from the transaction
   * @returns Promise<number> - The estimated energy consumption
   */
  async #estimateSmartContractEnergy(
    scope: Network,
    contract: Contract,
  ): Promise<number> {
    try {
      this.#logger.log(
        'Estimating smart contract energy',
        JSON.stringify(contract),
      );

      const tronWeb = this.#tronWebFactory.createClient(scope);

      const contractAddress = contract.parameter.value.contract_address;
      const functionSelector = contract.parameter.value.data;
      const ownerAddress = contract.parameter.value.owner_address;
      const callValue = contract.parameter.value.call_value ?? 0;

      // Convert addresses from hex to base58 if needed
      const contractAddressBase58 = tronWeb.address.fromHex(
        `41${contractAddress}`,
      );
      const ownerAddressBase58 = tronWeb.address.fromHex(`41${ownerAddress}`);

      this.#logger.log(
        {
          contractAddress: contractAddressBase58,
          ownerAddress: ownerAddressBase58,
          functionSelector,
          callValue,
        },
        'Estimating smart contract energy',
      );

      // Call triggerconstantcontract to simulate execution
      const result = await tronWeb.transactionBuilder.triggerConstantContract(
        contractAddressBase58,
        functionSelector,
        {},
        [],
        ownerAddressBase58,
      );

      if (result?.energy_used) {
        const energyUsed = result.energy_used;
        this.#logger.log({ energyUsed }, 'Energy estimation from network');

        // Add a 10% buffer for safety (execution might vary slightly)
        return Math.ceil(energyUsed * 1.1);
      }

      // If no energy_used in result, use typical TRC20 transfer energy
      this.#logger.warn(
        'No energy_used in simulation result, using typical TRC20 value',
      );
      return 65000; // Typical for TRC20 transfer
    } catch (error) {
      this.#logger.error(
        { error },
        'Failed to estimate smart contract energy, using fallback',
      );

      // Fallback to conservative estimate
      // TRC20 transfers typically use ~31,000-65,000 energy
      // Complex contracts can use much more
      return 100000; // Conservative estimate for unknown contracts
    }
  }

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
    transaction: string;
    availableEnergy: BigNumber;
    availableBandwidth: BigNumber;
  }): Promise<ComputeFeeResult> {
    this.#logger.log(
      'Calculating fee for transaction ',
      JSON.stringify(transaction),
    );

    const bandwidthNeeded = this.#calculateBandwidth(transaction);
    const energyNeeded = await this.#calculateEnergy(scope, transaction);

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

    const result: ComputeFeeResult = [
      {
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].energy.symbol,
          type: Networks[scope].energy.id,
          amount: energyConsumed.toString(),
          fungible: true as const,
        },
      },
      {
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].bandwidth.symbol,
          type: Networks[scope].bandwidth.id,
          amount: bandwidthConsumed.toString(),
          fungible: true as const,
        },
      },
    ];

    // If we need to pay TRX for bandwidth or energy overages
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
        },
      });
    }

    // Filter out any fees with zero amounts
    return result.filter(
      (fee) => fee.asset.fungible && fee.asset.amount !== '0',
    );
  }
}
