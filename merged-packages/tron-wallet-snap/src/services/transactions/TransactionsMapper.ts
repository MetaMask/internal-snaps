import type { Transaction } from '@metamask/keyring-api';
import { TronWeb } from 'tronweb';

import type {
  ContractTransactionInfo,
  TransactionInfo,
  TransferContractInfo,
  TransferAssetContractInfo,
} from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';

export class TransactionMapper {
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
    // Convert from sun to TRX (divide by 10^6)
    const amountInSun = contractValue.amount;
    const amountInTrx = (amountInSun / 1_000_000).toString();
    const fee = trongridTransaction.ret[0]?.fee?.toString() ?? '0';
    // Convert fee from sun to TRX as well
    const feeInTrx = (parseInt(fee, 10) / 1_000_000).toString();

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
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: amountInTrx,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: amountInTrx,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp: trongridTransaction.block_timestamp,
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp: trongridTransaction.block_timestamp,
      fees: [
        {
          type: 'base',
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: feeInTrx,
            fungible: true,
          },
        },
      ],
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
    // Convert from smallest unit to human-readable amount (TRC10 typically uses 6 decimals)
    const amountInSmallestUnit = contractValue.amount;
    const amountInReadableUnit = (amountInSmallestUnit / 1_000_000).toString();
    const assetName = contractValue.asset_name;
    const fee = trongridTransaction.ret[0]?.fee?.toString() ?? '0';
    // Convert fee from sun to TRX
    const feeInTrx = (parseInt(fee, 10) / 1_000_000).toString();

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
            unit: assetName, // Using the actual TRC10 asset name
            type: `${scope}/slip44:195`,
            amount: amountInReadableUnit,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: assetName, // Using the actual TRC10 asset name
            type: `${scope}/slip44:195`,
            amount: amountInReadableUnit,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp: trongridTransaction.block_timestamp,
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp: trongridTransaction.block_timestamp,
      fees: [
        {
          type: 'base',
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: feeInTrx,
            fungible: true,
          },
        },
      ],
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
    const { decimals } = trc20AssistanceData.token_info;
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

    // Calculate total fees from raw transaction data
    const totalFee = trongridTransaction.ret[0]?.fee ?? 0;
    const netFee = trongridTransaction.net_fee ?? 0;
    const energyFee = trongridTransaction.energy_fee ?? 0;
    const combinedFee = totalFee + netFee + energyFee;
    const feeInTrx = (combinedFee / 1_000_000).toString();

    return {
      type,
      id: trc20AssistanceData.transaction_id,
      from: [
        {
          address: from as any,
          asset: {
            unit: trc20AssistanceData.token_info.symbol,
            type: `${scope}/slip44:195`,
            amount: valueInReadableUnit,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: trc20AssistanceData.token_info.symbol,
            type: `${scope}/slip44:195`,
            amount: valueInReadableUnit,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: 'confirmed',
          timestamp: trc20AssistanceData.block_timestamp,
        },
      ],
      chain: scope,
      status: 'confirmed',
      account: account.id,
      timestamp: trc20AssistanceData.block_timestamp,
      fees: [
        {
          type: 'base',
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: feeInTrx,
            fungible: true,
          },
        },
      ],
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
