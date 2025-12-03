/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';
import type { SignedTransaction, Transaction } from 'tronweb/lib/esm/types';

import type { ComputeFeeResult } from './types';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { Network } from '../../constants';
import { ACCOUNT_ACTIVATION_FEE_TRX, Networks, ZERO } from '../../constants';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

export class FeeCalculatorService {
  readonly #logger: ILogger;

  readonly #trongridApiClient: TrongridApiClient;

  constructor({
    logger,
    trongridApiClient,
  }: {
    logger: ILogger;
    trongridApiClient: TrongridApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💸 FeeCalculatorService]');
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
   * @param scope - The network scope for the transaction
   * @param transaction - The base64 encoded transaction
   * @param feeLimit - Optional fee limit in SUN to use for fallback calculation
   * @returns Promise<BigNumber> - The calculated energy consumption
   */
  async #calculateEnergy(
    scope: Network,
    transaction: SignedTransaction & Transaction,
    feeLimit?: number,
  ): Promise<BigNumber> {
    const contracts = transaction.raw_data.contract;

    if (!contracts || contracts.length === 0) {
      this.#logger.log(
        'No contracts found in transaction, assuming zero energy usage',
      );
      return ZERO;
    }

    let totalEnergy = ZERO;

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
          currentContractEnergy = ZERO;
          break;
        /**
         * TRC20
         */
        case 'TriggerSmartContract': {
          currentContractEnergy = BigNumber(
            await this.#estimateTriggerSmartContractEnergy(
              scope,
              contract,
              feeLimit,
            ),
          );
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

  /**
   * Check if an account is activated (exists on the network).
   * An account is considered not activated if it has never received any assets.
   *
   * @param scope - The network scope to check
   * @param address - The TRON address to check
   * @returns Promise<boolean> - True if the account is activated, false otherwise
   */
  async #isAccountActivated(scope: Network, address: string): Promise<boolean> {
    try {
      await this.#trongridApiClient.getAccountInfoByAddress(scope, address);
      return true;
    } catch {
      // If the account is not found, it means it's not activated
      this.#logger.log(`Account ${address} is not activated on ${scope}`);
      return false;
    }
  }

  /**
   * Calculate fallback energy from fee limit.
   * Uses fee limit and energy price to derive maximum energy that could be consumed.
   *
   * @param scope - The network scope for the contract
   * @param feeLimit - The fee limit in SUN
   * @returns Promise<number> - The calculated max energy from fee limit
   */
  async #calculateFallbackEnergyFromFeeLimit(
    scope: Network,
    feeLimit: number,
  ): Promise<number> {
    const chainParameters =
      await this.#trongridApiClient.getChainParameters(scope);
    const energyPrice =
      chainParameters.find((param) => param.key === 'getEnergyFee')?.value ??
      420; // Fallback to 420 SUN per energy unit

    const maxEnergyFromFeeLimit = Math.floor(feeLimit / energyPrice);

    this.#logger.log(
      {
        feeLimit,
        energyPrice,
        maxEnergyFromFeeLimit,
      },
      `Calculated fallback energy from fee limit`,
    );

    return maxEnergyFromFeeLimit;
  }

  /**
   * Estimate energy consumption for contract calls of type TriggerSmartContract.
   * Uses direct TronGrid API call for accurate energy estimation.
   * Based on TIP-544: https://github.com/tronprotocol/tips/blob/master/tip-544.md
   *
   * @param scope - The network scope for the contract
   * @param contract - The contract object from the transaction
   * @param feeLimit - Optional fee limit in SUN to use for fallback calculation
   * @returns Promise<number> - The estimated energy consumption (defaults to 130000 if estimation fails without feeLimit)
   */
  async #estimateTriggerSmartContractEnergy(
    scope: Network,
    contract: any,
    feeLimit?: number,
  ): Promise<number> {
    const getFallbackEnergy = async (): Promise<number> => {
      if (feeLimit !== undefined && feeLimit > 0) {
        return this.#calculateFallbackEnergyFromFeeLimit(scope, feeLimit);
      }
      return 130000; // Default conservative estimate
    };

    try {
      const {
        data,
        owner_address: ownerAddress,
        contract_address: contractAddress,
        call_value: callValue,
        token_id: tokenId,
        call_token_id: callTokenId,
        call_token_value: callTokenValue,
      } = contract.parameter.value;

      if (!data) {
        this.#logger.warn('No data field found in contract, using fallback');
        return getFallbackEnergy();
      }

      this.#logger.log(
        {
          contractAddress,
          ownerAddress,
          callValue,
          tokenId,
          callTokenId,
          callTokenValue,
        },
        `Estimating energy`,
      );

      const result = await this.#trongridApiClient.triggerConstantContract(
        scope,
        {
          /**
           * These addresses are in hex format. If they weren't we would need to
           * pass `visible: true` to the request.
           */
          owner_address: ownerAddress,
          contract_address: contractAddress,
          data,
          call_value: callValue,
          token_id: tokenId,
          call_token_id: callTokenId,
          call_token_value: callTokenValue,
        },
      );

      if (result.energy_used) {
        this.#logger.log(
          {
            data: data.slice(0, 8),
            energyUsed: result.energy_used,
            energyPenalty: result.energy_penalty,
          },
          `Energy estimate for ${data.slice(0, 8)}: ${result.energy_used} units`,
        );
        return result.energy_used;
      }

      this.#logger.warn('No energy_used in result, using fallback');
      return getFallbackEnergy();
    } catch (error) {
      this.#logger.error(
        { error },
        'Failed to estimate smart contract energy, using fallback',
      );
      return getFallbackEnergy();
    }
  }

  /**
   * Calculate account activation fees for the transaction.
   * This happens when sending native TRX to addresses that haven't been activated yet.
   *
   * @param options - The options object
   * @param options.scope - The network scope to check
   * @param options.transaction - The transaction to check for activation fee requirement
   * @returns Promise<BigNumber> - The total activation fees in TRX
   */
  async #accountActivationFees({
    scope,
    transaction,
  }: {
    scope: Network;
    transaction: SignedTransaction & Transaction;
  }): Promise<BigNumber> {
    const contracts = transaction.raw_data.contract;

    if (!contracts || contracts.length === 0) {
      return ZERO;
    }

    // Collect all recipient addresses from TransferContract operations
    const recipientAddresses: string[] = [];

    for (const contract of contracts) {
      if ((contract.type as string) === 'TransferContract') {
        const { amount, to_address: toAddress } = contract.parameter.value as {
          amount: number;
          to_address: string;
        };

        if (amount > 0 && toAddress) {
          recipientAddresses.push(toAddress);
        }
      }
    }

    if (recipientAddresses.length === 0) {
      return ZERO;
    }

    // Check all addresses in parallel
    const activationResults = await Promise.all(
      recipientAddresses.map(async (address) => {
        const isActivated = await this.#isAccountActivated(scope, address);
        return { address, isActivated };
      }),
    );

    // Count unactivated accounts and calculate total fees
    const unactivatedCount = activationResults.filter(
      ({ address, isActivated }) => {
        if (!isActivated) {
          this.#logger.log(
            `Account ${address} is not activated, activation fee required`,
          );
          return true;
        }
        return false;
      },
    ).length;

    return ACCOUNT_ACTIVATION_FEE_TRX.multipliedBy(unactivatedCount);
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
   * @param params.feeLimit - Optional fee limit in SUN to use for fallback energy calculation
   * @returns Promise<ComputeFeeResult> - Complete fee breakdown
   */
  async computeFee({
    scope,
    transaction,
    availableEnergy,
    availableBandwidth,
    feeLimit,
  }: {
    scope: Network;
    transaction: SignedTransaction & Transaction;
    availableEnergy: BigNumber;
    availableBandwidth: BigNumber;
    feeLimit?: number;
  }): Promise<ComputeFeeResult> {
    this.#logger.log(
      'Calculating fee for transaction ',
      JSON.stringify(transaction),
    );

    const bandwidthNeeded = this.#calculateBandwidth(transaction);
    const energyNeeded = await this.#calculateEnergy(
      scope,
      transaction,
      feeLimit,
    );

    /**
     * Calculate consumption and overages:
     * - Bandwidth: If we don't have enough, we pay for ALL of it in TRX (no partial consumption)
     * - Energy: We consume what we have available, and pay TRX only for the overage
     */
    const hasEnoughBandwidth =
      availableBandwidth.isGreaterThanOrEqualTo(bandwidthNeeded);
    const bandwidthConsumed = hasEnoughBandwidth ? bandwidthNeeded : ZERO;
    const bandwidthToPayInTRX = hasEnoughBandwidth ? ZERO : bandwidthNeeded;

    const energyConsumed = BigNumber.min(energyNeeded, availableEnergy);
    const energyToPayInTRX = BigNumber.max(
      energyNeeded.minus(availableEnergy),
      ZERO,
    );

    const result: ComputeFeeResult = [];

    /**
     * Add energy consumption fee if we're consuming any energy
     */
    if (energyConsumed.isGreaterThan(0)) {
      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].energy.symbol,
          type: Networks[scope].energy.id,
          amount: energyConsumed.toString(),
          fungible: true as const,
        },
      });
    }

    /**
     * Add bandwidth consumption fee if we're consuming any bandwidth
     */
    if (bandwidthConsumed.isGreaterThan(0)) {
      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].bandwidth.symbol,
          type: Networks[scope].bandwidth.id,
          amount: bandwidthConsumed.toString(),
          fungible: true as const,
        },
      });
    }

    /**
     * Now calculate the total TRX cost from all sources...
     */
    let totalTrxCost = ZERO;

    /**
     * First, overages in bandwidth and energy
     */
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

      totalTrxCost = totalTrxCost.plus(bandwidthCostTRX).plus(energyCostTRX);
    }

    /**
     * Second, account activation fees
     */
    const accountActivationFees = await this.#accountActivationFees({
      scope,
      transaction,
    });

    if (accountActivationFees.isGreaterThan(0)) {
      totalTrxCost = totalTrxCost.plus(accountActivationFees);
    }

    /**
     * Finally, add the TRX cost to the result
     */
    if (totalTrxCost.isGreaterThan(0)) {
      result.push({
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].nativeToken.symbol,
          type: Networks[scope].nativeToken.id,
          amount: Number(totalTrxCost.toFixed(6)).toString(),
          fungible: true as const,
        },
      });
    }

    return result;
  }
}
