/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';
import type { Transaction } from 'tronweb/lib/esm/types';

import type { ComputeFeeResult } from './types';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { ContractInfo } from '../../clients/tron-http/types';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { Network } from '../../constants';
import {
  ACCOUNT_ACTIVATION_FEE_TRX,
  Networks,
  SUN_IN_TRX,
  ZERO,
} from '../../constants';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

/**
 * Bandwidth calculation constants.
 *
 * Transaction byte size is calculated based on the protobuf Transaction structure:
 *
 * ```
 * message Transaction {
 *   raw raw_data = 1;
 *   repeated bytes signature = 2;
 *   repeated Result ret = 5;
 * }
 * ```
 *
 * The formula is: raw_data_bytes + signature_bytes + MAX_RESULT_SIZE_IN_TX + protobuf_overhead
 *
 * See: https://github.com/tronprotocol/wallet-cli/issues/292
 */

/**
 * Standard ECDSA signature size (r, s, v) = 65 bytes
 */
const SIGNATURE_SIZE = 65;

/**
 * From java-tron source code: transaction byte size includes MAX_RESULT_SIZE_IN_TX (64 bytes)
 * which is added for each contract when VM is supported.
 * The ret field is cleared before serialization and this constant is added instead.
 */
const MAX_RESULT_SIZE_IN_TX = 64;

/**
 * Protobuf overhead for LEN-typed tags and length prefixes.
 *
 * Protobuf represents data as: (tag)(len-prefix if needed)(data)
 * - raw_data field: 1 byte tag + 2 bytes len-prefix (data usually > 127 bytes)
 * - signature field: 1 byte tag + 1 byte len-prefix (signature is 65 bytes < 127)
 * Total: 5 bytes
 */
const PROTOBUF_OVERHEAD = 5;

const UNSIGNED_TX_OVERHEAD =
  SIGNATURE_SIZE + MAX_RESULT_SIZE_IN_TX + PROTOBUF_OVERHEAD;

/**
 * System contracts that only consume bandwidth (zero energy).
 * These are native TRON protocol operations that don't execute VM code.
 *
 * Only CreateSmartContract and TriggerSmartContract consume energy
 * because they execute smart contract bytecode.
 *
 * See: https://tronprotocol.github.io/documentation-en/mechanism-algorithm/system-contracts/
 */
const ZERO_ENERGY_SYSTEM_CONTRACTS = new Set([
  // Staking
  'FreezeBalanceContract',
  'FreezeBalanceV2Contract',
  'UnfreezeBalanceContract',
  'UnfreezeBalanceV2Contract',
  'WithdrawExpireUnfreezeContract',
  'CancelAllUnfreezeV2Contract',
  // Resource delegation
  'DelegateResourceContract',
  'UnDelegateResourceContract',
  // Voting
  'VoteWitnessContract',
  // Account management
  'AccountCreateContract',
  'AccountUpdateContract',
  'AccountPermissionUpdateContract',
  'SetAccountIdContract',
  // Witness/SR operations
  'WitnessCreateContract',
  'WitnessUpdateContract',
  'UpdateBrokerageContract',
  // TRC10/Asset operations
  'AssetIssueContract',
  'ParticipateAssetIssueContract',
  'UnfreezeAssetContract',
  'UpdateAssetContract',
  // Proposals
  'ProposalCreateContract',
  'ProposalApproveContract',
  'ProposalDeleteContract',
  // Exchange
  'ExchangeCreateContract',
  'ExchangeInjectContract',
  'ExchangeWithdrawContract',
  'ExchangeTransactionContract',
  // Smart contract management (no VM execution)
  'ClearABIContract',
  'UpdateSettingContract',
  'UpdateEnergyLimitContract',
  // Other
  'WithdrawBalanceContract',
  'ShieldedTransferContract',
]);

export class FeeCalculatorService {
  readonly #logger: ILogger;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  constructor({
    logger,
    trongridApiClient,
    tronHttpClient,
  }: {
    logger: ILogger;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💸 FeeCalculatorService]');
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
  }

  /**
   * Calculate the bandwidth needed for a transaction (size in bytes).
   *
   * Based on java-tron implementation, the transaction byte size is:
   * raw_data_bytes + signature_bytes + MAX_RESULT_SIZE_IN_TX + protobuf_overhead
   *
   * For unsigned transactions, we use the standard ECDSA signature size (65 bytes).
   * For signed transactions, we use the actual signature bytes.
   *
   * See: https://github.com/tronprotocol/wallet-cli/issues/292
   *
   * @param transaction - The transaction (signed or unsigned)
   * @returns BigNumber - The calculated bandwidth in bytes
   */
  #calculateBandwidth(transaction: Transaction): BigNumber {
    // eslint-disable-next-line no-restricted-globals
    const rawDataBytes = Buffer.from(
      transaction.raw_data_hex,
      'hex',
    ).byteLength;

    // If transaction is already signed, use actual signature bytes
    const signedTx = transaction as Transaction & { signature?: string[] };
    if (signedTx.signature && Array.isArray(signedTx.signature)) {
      const signatureBytes = signedTx.signature.reduce(
        (sum, signatureHex) => sum + signatureHex.length / 2,
        0,
      );
      return BigNumber(
        rawDataBytes +
          signatureBytes +
          MAX_RESULT_SIZE_IN_TX +
          PROTOBUF_OVERHEAD,
      );
    }

    // Unsigned transaction: assume single standard ECDSA signature (65 bytes)
    return BigNumber(rawDataBytes + UNSIGNED_TX_OVERHEAD);
  }

  /**
   * Calculate the energy requirements for a TRON transaction.
   * Depends on the type of contracts in the transaction.
   *
   * @param scope - The network scope for the transaction
   * @param transaction - The transaction (signed or unsigned)
   * @param feeLimit - Optional fee limit in SUN to use for fallback calculation
   * @returns Promise<BigNumber> - The calculated energy consumption
   */
  async #calculateEnergy(
    scope: Network,
    transaction: Transaction,
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

      if (
        contractType === 'TransferContract' ||
        contractType === 'TransferAssetContract'
      ) {
        /**
         * Native TRX transfers + TRC10 token transfers
         */
        currentContractEnergy = ZERO;
      } else if (contractType === 'TriggerSmartContract') {
        /**
         * Smart contract calls (TRC20, swaps, etc.)
         */
        currentContractEnergy = BigNumber(
          await this.#estimateTriggerSmartContractEnergy(
            scope,
            contract,
            feeLimit,
          ),
        );
      } else if (ZERO_ENERGY_SYSTEM_CONTRACTS.has(contractType)) {
        /**
         * System contracts - don't consume energy
         */
        this.#logger.log(
          `System contract ${contractType} detected, zero energy consumption`,
        );
        currentContractEnergy = ZERO;
      } else {
        /**
         * Unknown contract type, use conservative energy estimate.
         */
        this.#logger.warn(
          `Unknown contract type: ${contractType}, using conservative estimate`,
        );
        currentContractEnergy = BigNumber(130000);
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
   * Get fallback energy estimate when simulation fails or is unavailable.
   * Uses fee limit to calculate max energy if provided, otherwise returns a conservative default.
   *
   * @param scope - The network scope for the contract
   * @param feeLimit - Optional fee limit in SUN to use for calculation
   * @returns Promise<number> - The fallback energy estimate
   */
  async #getFallbackEnergy(scope: Network, feeLimit?: number): Promise<number> {
    if (feeLimit !== undefined && feeLimit > 0) {
      return this.#calculateFallbackEnergyFromFeeLimit(scope, feeLimit);
    }
    return 130000; // Default conservative estimate
  }

  /**
   * Calculate how energy is shared between user and contract deployer.
   *
   * TRON's Energy Sharing Mechanism:
   * - consume_user_resource_percent: % of energy the USER pays (0-100).
   * 100 = user pays all (default if missing), 0 = deployer pays all.
   * - origin_energy_limit: max energy deployer subsidizes per tx.
   * 0 = no subsidy (default if missing).
   *
   * @see https://developers.tron.network/docs/energy-consumption-mechanism
   * @param totalEnergy - Total energy needed for the transaction
   * @param contractInfo - Contract info with energy sharing parameters (null = user pays all)
   * @returns Object containing the energy the user must pay
   */
  #calculateEnergySharing(
    totalEnergy: number,
    contractInfo: ContractInfo | null,
  ): { userEnergy: number } {
    // If no contract info or API failed, user pays everything
    if (!contractInfo) {
      return { userEnergy: totalEnergy };
    }

    // consume_user_resource_percent: % the USER pays (default 100 = user pays all)
    const userPercent = contractInfo.consume_user_resource_percent ?? 100;
    // origin_energy_limit: max deployer subsidy (default 0 = no subsidy)
    const maxDeployerSubsidy = contractInfo.origin_energy_limit ?? 0;

    // If user pays 100% or deployer has no subsidy budget, user pays all
    if (userPercent >= 100 || maxDeployerSubsidy <= 0) {
      return { userEnergy: totalEnergy };
    }

    // Calculate theoretical split
    const userTheoretical = Math.ceil(totalEnergy * (userPercent / 100));
    const deployerTheoretical = totalEnergy - userTheoretical;

    // Deployer's contribution is capped by origin_energy_limit
    const deployerActual = Math.min(deployerTheoretical, maxDeployerSubsidy);

    // User pays the rest
    const userActual = totalEnergy - deployerActual;

    this.#logger.log(
      {
        totalEnergy,
        userPercent,
        maxDeployerSubsidy,
        userTheoretical,
        deployerTheoretical,
        deployerActual,
        userActual,
      },
      'Energy sharing calculation',
    );

    return { userEnergy: userActual };
  }

  /**
   * Estimate energy consumption for contract calls of type TriggerSmartContract.
   * Uses direct TronGrid API call for accurate energy estimation.
   * Accounts for energy sharing mechanism at the contract level.
   * Based on TIP-544: https://github.com/tronprotocol/tips/blob/master/tip-544.md
   *
   * @param scope - The network scope for the contract
   * @param contract - The contract object from the transaction
   * @param feeLimit - Optional fee limit in SUN to use for fallback calculation
   * @returns Promise<number> - The estimated energy the USER will pay (after deployer subsidy)
   */
  async #estimateTriggerSmartContractEnergy(
    scope: Network,
    contract: any,
    feeLimit?: number,
  ): Promise<number> {
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
        throw new Error('No data field found in contract');
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

      // Fetch contract info and energy estimation in parallel
      const [result, contractInfo] = await Promise.all([
        this.#tronHttpClient.triggerConstantContract(scope, {
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
        }),
        // Graceful fallback: if getContract fails, contractInfo will be null
        this.#tronHttpClient.getContract(scope, contractAddress).catch(() => {
          this.#logger.warn(
            'Failed to fetch contract info for energy sharing, assuming user pays all',
          );
          return null;
        }),
      ]);

      /**
       * If the transaction simulation failed, we use the fallback energy estimate.
       */
      if (result.transaction.ret[0]?.ret === 'FAILED') {
        throw new Error('Simulation yields failed result');
      }

      if ('energy_used' in result) {
        const totalEnergy = result.energy_used;

        // Calculate user's portion based on energy sharing
        const { userEnergy } = this.#calculateEnergySharing(
          totalEnergy,
          contractInfo,
        );

        this.#logger.log(
          {
            data: data.slice(0, 8),
            totalEnergy,
            userEnergy,
            energyPenalty: result.energy_penalty,
            hasEnergySharing: contractInfo !== null,
          },
          `Energy estimate for ${data.slice(0, 8)}: user pays ${userEnergy} of ${totalEnergy} units`,
        );

        return userEnergy;
      }

      this.#logger.warn('No energy_used in result, using fallback');
      return this.#getFallbackEnergy(scope, feeLimit);
    } catch (error) {
      this.#logger.error(
        { error },
        'Failed to estimate smart contract energy, using fallback',
      );
      return this.#getFallbackEnergy(scope, feeLimit);
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
    transaction: Transaction;
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
   * Calculate complete fee breakdown for a TRON transaction.
   * Supports both signed and unsigned transactions.
   * Handles both free resource consumption and TRX costs for overages.
   *
   * @param params - The parameters for the fee calculation
   * @param params.scope - The network scope for the transaction
   * @param params.transaction - The transaction (signed or unsigned)
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
    transaction: Transaction;
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

    /**
     * Calculate the total TRX cost from all sources...
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
        .div(SUN_IN_TRX); // Convert SUN to TRX
      const energyCostTRX = energyToPayInTRX
        .multipliedBy(energyCost)
        .div(SUN_IN_TRX); // Convert SUN to TRX

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
     * Build result array - TRX MUST always be first element, even if 0
     */
    const result: ComputeFeeResult = [
      {
        type: FeeType.Base,
        asset: {
          unit: Networks[scope].nativeToken.symbol,
          type: Networks[scope].nativeToken.id,
          amount: Number(totalTrxCost.toFixed(6)).toString(),
          fungible: true as const,
        },
      },
    ];

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

    return result;
  }
}
