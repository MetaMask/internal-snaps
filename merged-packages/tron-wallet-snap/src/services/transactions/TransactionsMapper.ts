import type { CaipAssetType, Transaction } from '@metamask/keyring-api';
import { TronWeb } from 'tronweb';

import type {
  ContractTransactionInfo,
  TransactionInfo,
  TransferContractInfo,
  TransferAssetContractInfo,
} from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import { Networks } from '../../constants';
import type { TronKeyringAccount } from '../../entities';

export class TransactionMapper {
  /**
   * Calculate fees for Tron transactions including Energy and Bandwidth as separate assets.
   *
   * @param network The network configuration.
   * @param transactionInfo The raw transaction info.
   * @returns Array of fee objects.
   */
  static #calculateTronFees(
    network: Network,
    transactionInfo: TransactionInfo,
  ): Transaction['fees'] {
    const fees: Transaction['fees'] = [];

    const {
      nativeToken: tronAsset,
      bandwidth: bandwidthAsset,
      energy: energyAsset,
    } = Networks[network];

    // Base TRX fee calculation
    const transactionFee = transactionInfo.ret.reduce(
      (total, result) => total + (result.fee || 0),
      0,
    );

    const setFeeIfPresent = (
      amount: number,
      asset: { id: CaipAssetType; symbol: string },
    ): void => {
      if (amount > 0) {
        fees.push({
          type: 'base',
          asset: {
            type: asset.id,
            unit: asset.symbol,
            amount: amount.toString(),
            fungible: true,
          },
        });
      }
    };

    setFeeIfPresent(transactionFee, tronAsset);
    setFeeIfPresent(transactionInfo.net_usage, bandwidthAsset);
    setFeeIfPresent(transactionInfo.energy_usage, energyAsset);

    return fees;
  }

  /**
   * Maps a TransferContract (native TRX transfer) transaction.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.trongridTransaction - The raw transaction data from Trongrid.
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static #mapTransferContract({
    scope,
    account,
    trongridTransaction,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
  }): Transaction | null {
    const firstContract = trongridTransaction.raw_data
      .contract[0] as TransferContractInfo;
    const contractValue = firstContract.parameter.value;

    const from = TronWeb.address.fromHex(contractValue.owner_address);
    const to = TronWeb.address.fromHex(contractValue.to_address);
    const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);

    // Convert from sun to TRX (divide by 10^6)
    const amountInSun = contractValue.amount;
    const amountInTrx = (amountInSun / 1_000_000).toString();

    // Calculate comprehensive fees including Energy and Bandwidth
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    let type: 'send' | 'receive' | 'unknown';

    if (from === account.address) {
      type = 'send';
    } else if (to === account.address) {
      type = 'receive';
    } else {
      type = 'unknown';
    }

    const tronAsset = Networks[scope].nativeToken;

    return {
      type,
      id: trongridTransaction.txID,
      from: [
        {
          address: from as any,
          asset: {
            unit: tronAsset.symbol,
            type: tronAsset.id,
            amount: amountInTrx,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: tronAsset.symbol,
            type: tronAsset.id,
            amount: amountInTrx,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp,
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a TransferAssetContract (TRC10 token transfer) transaction.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.trongridTransaction - The raw transaction data from Trongrid.
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static #mapTransferAssetContract({
    scope,
    account,
    trongridTransaction,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
  }): Transaction | null {
    const firstContract = trongridTransaction.raw_data
      .contract[0] as TransferAssetContractInfo;
    const contractValue = firstContract.parameter.value;

    const from = TronWeb.address.fromHex(contractValue.owner_address);
    const to = TronWeb.address.fromHex(contractValue.to_address);
    const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);

    // Convert from smallest unit to human-readable amount (TRC10 typically uses 6 decimals)
    const amountInSmallestUnit = contractValue.amount;
    const amountInReadableUnit = (amountInSmallestUnit / 1_000_000).toString();
    const assetName = contractValue.asset_name;

    // Calculate comprehensive fees including Energy and Bandwidth
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    let type: 'send' | 'receive' | 'unknown';

    if (from === account.address) {
      type = 'send';
    } else if (to === account.address) {
      type = 'receive';
    } else {
      type = 'unknown';
    }

    return {
      type,
      id: trongridTransaction.txID,
      from: [
        {
          address: from as any,
          asset: {
            unit: 'UNKNOWN',
            type: `${scope}/trc10:${assetName}`,
            amount: amountInReadableUnit,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: 'UNKNOWN',
            type: `${scope}/trc10:${assetName}`,
            amount: amountInReadableUnit,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp,
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a TriggerSmartContract transaction, which can be a TRC20 transfer.
   * Uses TRC20 assistance data when available for enhanced parsing.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.trongridTransaction - The raw transaction data from Trongrid.
   * @param params.trc20AssistanceData - Optional TRC20 data for this transaction ID.
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static #mapTriggerSmartContract({
    scope,
    account,
    trongridTransaction,
    trc20AssistanceData,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc20AssistanceData?: ContractTransactionInfo;
  }): Transaction | null {
    // If no TRC20 assistance data is available, we can't parse this smart contract interaction
    // In the future, we could add generic smart contract parsing here
    if (!trc20AssistanceData) {
      return null;
    }

    const { from } = trc20AssistanceData;
    const { to } = trc20AssistanceData;

    // Convert from smallest unit to human-readable amount using token decimals
    const valueInSmallestUnit = trc20AssistanceData.value;
    const { decimals, address, symbol } = trc20AssistanceData.token_info;
    const divisor = Math.pow(10, decimals);
    const valueInReadableUnit = (
      parseFloat(valueInSmallestUnit) / divisor
    ).toString();

    let type: 'send' | 'receive' | 'unknown';
    if (from === account.address) {
      type = 'send';
    } else if (to === account.address) {
      type = 'receive';
    } else {
      type = 'unknown';
    }

    // Calculate comprehensive fees including Energy and Bandwidth from raw transaction data
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    return {
      type,
      id: trc20AssistanceData.transaction_id,
      from: [
        {
          address: from as any,
          asset: {
            unit: symbol,
            type: `${scope}/trc20:${address}`,
            amount: valueInReadableUnit,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: symbol,
            type: `${scope}/trc20:${address}`,
            amount: valueInReadableUnit,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp: Math.floor(trc20AssistanceData.block_timestamp / 1000),
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp: Math.floor(trc20AssistanceData.block_timestamp / 1000),
      fees,
    };
  }

  /**
   * Maps a raw transaction using the appropriate mapping method based on contract type.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.trongridTransaction - The raw transaction data from Trongrid.
   * @param params.trc20AssistanceData - Optional TRC20 data for this transaction ID.
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static mapTransaction({
    scope,
    account,
    trongridTransaction,
    trc20AssistanceData,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc20AssistanceData?: ContractTransactionInfo;
  }): Transaction | null {
    /**
     * Cheat Sheet of "raw_data" > "contract" > "type"
     *
     * TransferContract - Native TRX transfer
     * TransferAssetContract - TRC10 token transfer
     * TriggerSmartContract - Smart contract interaction (can be TRC20 transfer)
     */

    // ASSUME: Only use the first contract to classify the transaction type.

    const firstContract = trongridTransaction.raw_data.contract?.[0];
    const contractType = firstContract?.type;

    if (!firstContract || !contractType) {
      return null;
    }

    switch (contractType) {
      case 'TransferContract':
        return this.#mapTransferContract({
          scope,
          account,
          trongridTransaction,
        });

      case 'TransferAssetContract':
        return this.#mapTransferAssetContract({
          scope,
          account,
          trongridTransaction,
        });

      case 'TriggerSmartContract':
        return this.#mapTriggerSmartContract({
          scope,
          account,
          trongridTransaction,
          trc20AssistanceData,
        });

      default:
        // Unsupported transaction type
        return null;
    }
  }

  /**
   * Maps raw transaction data with TRC20 assistance data to create a complete transaction mapping.
   * This method treats raw transactions as the primary source and uses TRC20 data as assistance.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.rawTransactions - Array of raw transaction data (primary source).
   * @param params.trc20Transactions - Array of TRC20 transaction data (assistance).
   * @returns Array of mapped Transactions.
   */
  static mapTransactions({
    scope,
    account,
    rawTransactions,
    trc20Transactions,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    rawTransactions: TransactionInfo[];
    trc20Transactions: ContractTransactionInfo[];
  }): Transaction[] {
    // Create a map of TRC20 transactions by transaction_id for quick lookup as assistance data
    const trc20AssistanceMap = new Map<string, ContractTransactionInfo>();
    for (const trc20Tx of trc20Transactions) {
      trc20AssistanceMap.set(trc20Tx.transaction_id, trc20Tx);
    }

    // Process each raw transaction as the primary source
    const transactions: Transaction[] = [];
    for (const rawTx of rawTransactions) {
      // Check if we have TRC20 assistance data for this transaction
      const trc20AssistanceData = trc20AssistanceMap.get(rawTx.txID);

      // Map the raw transaction using assistance data when available
      const mappedTx = this.mapTransaction({
        scope,
        account,
        trongridTransaction: rawTx,
        trc20AssistanceData,
      });

      if (mappedTx) {
        transactions.push(mappedTx);
      }
    }

    return transactions;
  }
}
