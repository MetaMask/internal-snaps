import type { CaipAssetType, Transaction } from '@metamask/keyring-api';
import { TransactionStatus, TransactionType } from '@metamask/keyring-api';
import { TronWeb } from 'tronweb';

import type { TRC10TokenMetadata } from '../../clients/tron-http/types';
import type {
  ContractTransactionInfo,
  ContractValue,
  GeneralContractInfo,
  TransactionInfo,
  TransferAssetContractInfo,
  TransferContractInfo,
} from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import { Networks, SUN_IN_TRX } from '../../constants';
import type { TronKeyringAccount } from '../../entities';

export class TransactionMapper {
  /**
   * Creates a minimal pending transaction immediately after broadcast.
   * This shows a placeholder transaction to the user while we wait for the
   * background job to fetch full details from the blockchain.
   *
   * @param params - The parameters for creating the pending transaction
   * @param params.txId - The transaction ID from the broadcast result
   * @param params.account - The account that initiated the transaction
   * @param params.scope - The network scope
   * @returns A minimal pending transaction in keyring API format
   */
  static createPendingTransaction({
    txId,
    account,
    scope,
  }: {
    txId: string;
    account: TronKeyringAccount;
    scope: Network;
  }): Transaction {
    const timestamp = Math.floor(Date.now() / 1000);

    return {
      type: TransactionType.Unknown,
      id: txId,
      from: [
        {
          address: account.address,
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: '0',
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: account.address,
          asset: {
            unit: 'TRX',
            type: `${scope}/slip44:195`,
            amount: '0',
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: TransactionStatus.Unconfirmed,
          timestamp,
        },
      ],
      chain: scope,
      status: TransactionStatus.Unconfirmed,
      account: account.id,
      timestamp,
      fees: [],
    };
  }

  /**
   * Creates a detailed pending Send transaction immediately after broadcast.
   * Uses the known transaction details to show a complete transaction to the user
   * before blockchain confirmation.
   *
   * @param params - The parameters for creating the pending send transaction
   * @param params.txId - The transaction ID from the broadcast result
   * @param params.account - The account that initiated the transaction
   * @param params.scope - The network scope
   * @param params.toAddress - The recipient address
   * @param params.amount - The amount being sent (in human-readable format)
   * @param params.assetType - The CAIP asset type
   * @param params.assetSymbol - The asset symbol (e.g., 'TRX', 'USDT')
   * @returns A detailed pending Send transaction in keyring API format
   */
  static createPendingSendTransaction({
    txId,
    account,
    scope,
    toAddress,
    amount,
    assetType,
    assetSymbol,
  }: {
    txId: string;
    account: TronKeyringAccount;
    scope: Network;
    toAddress: string;
    amount: string;
    assetType: CaipAssetType;
    assetSymbol: string;
  }): Transaction {
    const timestamp = Math.floor(Date.now() / 1000);

    return {
      type: TransactionType.Send,
      id: txId,
      from: [
        {
          address: account.address,
          asset: {
            unit: assetSymbol,
            type: assetType,
            amount,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: toAddress,
          asset: {
            unit: assetSymbol,
            type: assetType,
            amount,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: TransactionStatus.Unconfirmed,
          timestamp,
        },
      ],
      chain: scope,
      status: TransactionStatus.Unconfirmed,
      account: account.id,
      timestamp,
      fees: [],
    };
  }

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
    const transactionFeeInSun = transactionInfo.ret.reduce(
      (total, result) => total + (result.fee || 0),
      0,
    );
    const transactionFee = transactionFeeInSun / SUN_IN_TRX;

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
   * Computes the transaction status based on blockNumber and contractRet.
   *
   * @param trongridTransaction - The raw transaction data from Trongrid.
   * @returns The transaction status (pending/confirmed/failed).
   */
  static #computeTransactionStatus(
    trongridTransaction: TransactionInfo,
  ): TransactionStatus {
    const isPending = !trongridTransaction.blockNumber;
    const contractRet = trongridTransaction.ret?.[0]?.contractRet;
    const isFailed = contractRet && contractRet !== 'SUCCESS';

    if (isPending) {
      return TransactionStatus.Unconfirmed;
    }
    if (isFailed) {
      return TransactionStatus.Failed;
    }

    return TransactionStatus.Confirmed;
  }

  /**
   * Computes the transaction type based on the account and transaction participants.
   *
   * @param params - The parameters for type computation.
   * @param params.accountAddress - The account address.
   * @param params.from - The sender address.
   * @param params.to - The receiver address.
   * @returns The transaction type (send/receive/swap/unknown).
   */
  static #computeTransactionType({
    accountAddress,
    from,
    to,
  }: {
    accountAddress: string;
    from: string;
    to: string;
  }): TransactionType {
    if (from === accountAddress && to === accountAddress) {
      return TransactionType.Swap; // This is a self-transfer, but in the context of a DEX, it's a swap
    }
    if (from === accountAddress) {
      return TransactionType.Send;
    }
    if (to === accountAddress) {
      return TransactionType.Receive;
    }
    return TransactionType.Unknown;
  }

  /**
   * Converts a hex address to a Tron base58 address.
   *
   * @param hexAddress - The hex address to convert.
   * @returns The Tron base58 address.
   */
  static #toTronAddress(hexAddress: string): string {
    return TronWeb.address.fromHex(hexAddress);
  }

  /**
   * Checks if there's TRX movement in the transaction's internal_transactions.
   *
   * @param trongridTransaction - The transaction to check.
   * @param accountAddress - The account address to check for.
   * @returns True if TRX movement is detected, false otherwise.
   */
  static #hasTrxMovementInTransaction(
    trongridTransaction: TransactionInfo,
    accountAddress: string,
  ): boolean {
    const internalTransactions = trongridTransaction.internal_transactions;
    if (!internalTransactions || internalTransactions.length === 0) {
      return false;
    }

    // Convert account address to hex for comparison
    const accountHex = TronWeb.address.toHex(accountAddress).toLowerCase();

    // Check for TRX movements where this account is involved
    // Note: internal_transactions from Full Node API uses caller_address/transferTo_address
    return internalTransactions.some((internal: any) => {
      const fromHex = internal.caller_address?.toLowerCase();
      const toHex = internal.transferTo_address?.toLowerCase();
      const hasCallValue = internal.callValueInfo?.some(
        (valueInfo: any) => (valueInfo.callValue ?? 0) > 0,
      );

      return hasCallValue && (fromHex === accountHex || toHex === accountHex);
    });
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

    const from = this.#toTronAddress(contractValue.owner_address);
    const to = this.#toTronAddress(contractValue.to_address);

    // Determine transaction status using helper
    const status = this.#computeTransactionStatus(trongridTransaction);

    // Use transaction timestamp for confirmed, current time for pending
    const isPending = status === TransactionStatus.Unconfirmed;
    const timestamp = isPending
      ? Math.floor(Date.now() / 1000)
      : Math.floor(trongridTransaction.block_timestamp / 1000);

    // Convert from sun to TRX (divide by 10^6)
    const amountInSun = contractValue.amount;
    const amountInTrx = (amountInSun / SUN_IN_TRX).toString();

    // Calculate comprehensive fees including Energy and Bandwidth
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    // Determine transaction type using helper
    const type = this.#computeTransactionType({
      accountAddress: account.address,
      from,
      to,
    });

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
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
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
   * @param params.trc10TokenMetadata - Optional map of TRC10 token ID to metadata (including decimals).
   * @returns The mapped Transaction.
   */
  static #mapTransferAssetContract({
    scope,
    account,
    trongridTransaction,
    trc10TokenMetadata,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc10TokenMetadata?: Map<string, TRC10TokenMetadata>;
  }): Transaction {
    const firstContract = trongridTransaction.raw_data
      .contract[0] as TransferAssetContractInfo;
    const contractValue = firstContract.parameter.value;

    const from = this.#toTronAddress(contractValue.owner_address);
    const to = this.#toTronAddress(contractValue.to_address);

    // Determine transaction status using helper
    const status = this.#computeTransactionStatus(trongridTransaction);

    // Use transaction timestamp for confirmed, current time for pending
    const isPending = status === TransactionStatus.Unconfirmed;
    const timestamp = isPending
      ? Math.floor(Date.now() / 1000)
      : Math.floor(trongridTransaction.block_timestamp / 1000);

    // Get token metadata for decimals and symbol
    const assetName = contractValue.asset_name;
    const tokenMetadata = trc10TokenMetadata?.get(assetName);
    const decimals = tokenMetadata?.decimals ?? 6;
    const symbol = tokenMetadata?.symbol ?? 'UNKNOWN';

    // Convert from smallest unit to human-readable amount using actual token decimals
    const amountInSmallestUnit = contractValue.amount;
    const amountInReadableUnit = (
      amountInSmallestUnit / Math.pow(10, decimals)
    ).toString();

    // Calculate comprehensive fees including Energy and Bandwidth
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    // Determine transaction type using helper
    const type = this.#computeTransactionType({
      accountAddress: account.address,
      from,
      to,
    });

    return {
      type,
      id: trongridTransaction.txID,
      from: [
        {
          address: from as any,
          asset: {
            unit: symbol,
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
            unit: symbol,
            type: `${scope}/trc10:${assetName}`,
            amount: amountInReadableUnit,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a TRC20-only transaction (transactions where user received tokens but wasn't the initiator).
   * Examples: airdrops, contract withdrawals, etc.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope.
   * @param params.account - The account involved.
   * @param params.trc20Transfer - The TRC20 transfer.
   * @returns The mapped Transaction or null if not supported.
   */
  static #mapTrc20OnlyTransaction({
    scope,
    account,
    trc20Transfer,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trc20Transfer: ContractTransactionInfo;
  }): Transaction | null {
    const {
      from,
      to,
      value,
      token_info: tokenInfo,
      block_timestamp: blockTimestamp,
      transaction_id: transactionId,
    } = trc20Transfer;

    // Calculate amount in human-readable format
    const divisor = Math.pow(10, tokenInfo.decimals);
    const amount = (parseFloat(value) / divisor).toString();

    // Determine transaction type
    const type = this.#computeTransactionType({
      accountAddress: account.address,
      from,
      to,
    });

    // TRC20-only transactions are always confirmed (they have a block timestamp)
    const status = TransactionStatus.Confirmed;

    // TRC20-only transactions typically don't incur fees for the recipient
    const fees: Transaction['fees'] = [];

    return {
      type,
      id: transactionId,
      from: [
        {
          address: from,
          asset: {
            unit: tokenInfo.symbol,
            type: `${scope}/trc20:${tokenInfo.address}`,
            amount,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: to,
          asset: {
            unit: tokenInfo.symbol,
            type: `${scope}/trc20:${tokenInfo.address}`,
            amount,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status,
          timestamp: Math.floor(blockTimestamp / 1000),
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp: Math.floor(blockTimestamp / 1000),
      fees,
    };
  }

  /**
   * Maps a TRC20 ↔ TRC20 swap transaction.
   *
   * @param params - The parameters for mapping the swap.
   * @param params.scope - The network scope.
   * @param params.account - The account involved in the swap.
   * @param params.trongridTransaction - The raw transaction data.
   * @param params.sentTransfer - The TRC20 transfer that was sent.
   * @param params.receivedTransfer - The TRC20 transfer that was received.
   * @returns The mapped swap Transaction.
   */
  static #mapSwapTransaction({
    scope,
    account,
    trongridTransaction,
    sentTransfer,
    receivedTransfer,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    sentTransfer: ContractTransactionInfo;
    receivedTransfer: ContractTransactionInfo;
  }): Transaction {
    const status = this.#computeTransactionStatus(trongridTransaction);
    const isPending = status === TransactionStatus.Unconfirmed;
    const timestamp = isPending
      ? Math.floor(Date.now() / 1000)
      : Math.floor(trongridTransaction.block_timestamp / 1000);

    // Calculate sent amount
    const sentDivisor = Math.pow(10, sentTransfer.token_info.decimals);
    const sentAmount = (
      parseFloat(sentTransfer.value) / sentDivisor
    ).toString();

    // Calculate received amount
    const receivedDivisor = Math.pow(10, receivedTransfer.token_info.decimals);
    const receivedAmount = (
      parseFloat(receivedTransfer.value) / receivedDivisor
    ).toString();

    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    return {
      type: TransactionType.Swap,
      id: trongridTransaction.txID,
      from: [
        {
          address: sentTransfer.from,
          asset: {
            unit: sentTransfer.token_info.symbol,
            type: `${scope}/trc20:${sentTransfer.token_info.address}`,
            amount: sentAmount,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: receivedTransfer.to,
          asset: {
            unit: receivedTransfer.token_info.symbol,
            type: `${scope}/trc20:${receivedTransfer.token_info.address}`,
            amount: receivedAmount,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a TRX ↔ TRC20 swap transaction.
   *
   * @param params - The parameters for mapping the swap.
   * @param params.scope - The network scope.
   * @param params.account - The account involved in the swap.
   * @param params.trongridTransaction - The raw transaction data.
   * @param params.trc20Transfer - The TRC20 transfer.
   * @returns The mapped swap Transaction.
   */
  static #mapTrxToTrc20Swap({
    scope,
    account,
    trongridTransaction,
    trc20Transfer,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc20Transfer: ContractTransactionInfo;
  }): Transaction {
    const status = this.#computeTransactionStatus(trongridTransaction);
    const isPending = status === TransactionStatus.Unconfirmed;
    const timestamp = isPending
      ? Math.floor(Date.now() / 1000)
      : Math.floor(trongridTransaction.block_timestamp / 1000);

    // Calculate TRC20 received amount
    const trc20Divisor = Math.pow(10, trc20Transfer.token_info.decimals);
    const trc20Amount = (
      parseFloat(trc20Transfer.value) / trc20Divisor
    ).toString();

    // Extract TRX amount - priority order:
    // 1. call_value from main contract (user sent TRX directly)
    // 2. internal_transactions where user is sender
    // 3. Sum of all internal TRX (fallback for complex DEX swaps)
    const contractInfo = trongridTransaction.raw_data.contract?.[0];
    const contractCallValue = (contractInfo?.parameter?.value as any)
      ?.call_value;

    let trxAmount = '0';

    // First, check if user sent TRX directly via call_value
    if (contractCallValue && contractCallValue > 0) {
      trxAmount = (contractCallValue / SUN_IN_TRX).toString();
    } else {
      // Otherwise, look in internal_transactions
      const internalTransactions =
        trongridTransaction.internal_transactions ?? [];
      const accountHex = TronWeb.address.toHex(account.address).toLowerCase();

      // Find the TRX movement where the account is the sender
      // Note: internal_transactions from Full Node API uses caller_address/callValueInfo
      for (const internal of internalTransactions as any[]) {
        const fromHex = internal.caller_address?.toLowerCase();
        if (fromHex === accountHex) {
          const callValue =
            internal.callValueInfo?.find((vi: any) => vi.callValue)
              ?.callValue ?? 0;
          if (callValue > 0) {
            trxAmount = (callValue / SUN_IN_TRX).toString();
            break;
          }
        }
      }

      // If no TRX found in internal_transactions, sum all internal TRX movements
      // (DEX swaps often have TRX moving internally without the user's address)
      if (trxAmount === '0' && internalTransactions.length > 0) {
        let totalInternalTrx = 0;
        for (const internal of internalTransactions as any[]) {
          const callValue =
            internal.callValueInfo?.find((vi: any) => vi.callValue)
              ?.callValue ?? 0;
          totalInternalTrx += callValue;
        }
        if (totalInternalTrx > 0) {
          trxAmount = (totalInternalTrx / SUN_IN_TRX).toString();
        }
      }
    }

    const tronAsset = Networks[scope].nativeToken;
    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    return {
      type: TransactionType.Swap,
      id: trongridTransaction.txID,
      from: [
        {
          address: account.address,
          asset: {
            unit: tronAsset.symbol,
            type: tronAsset.id,
            amount: trxAmount,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: account.address,
          asset: {
            unit: trc20Transfer.token_info.symbol,
            type: `${scope}/trc20:${trc20Transfer.token_info.address}`,
            amount: trc20Amount,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a TriggerSmartContract transaction, which can be a TRC20 transfer, swap, or TRX-only contract call.
   * Uses TRC20 assistance data when available for enhanced parsing.
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.trongridTransaction - The raw transaction data from Trongrid.
   * @param params.trc20Transfers - Optional array of TRC20 transfers for this transaction ID.
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static #mapTriggerSmartContract({
    scope,
    account,
    trongridTransaction,
    trc20Transfers = [],
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc20Transfers?: ContractTransactionInfo[];
  }): Transaction | null {
    // Determine transaction status first
    const status = this.#computeTransactionStatus(trongridTransaction);

    const contractInfo = trongridTransaction.raw_data.contract?.[0];
    const ownerAddress = contractInfo?.parameter?.value?.owner_address;
    const contractAddress = (contractInfo?.parameter?.value as any)
      ?.contract_address;
    const callValue = (contractInfo?.parameter?.value as any)?.call_value;

    // Handle failed transactions (even without TRC20 data)
    if (status === TransactionStatus.Failed) {
      if (!ownerAddress) {
        return null;
      }

      const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);
      const fees = TransactionMapper.#calculateTronFees(
        scope,
        trongridTransaction,
      );

      return {
        type: TransactionType.Unknown,
        id: trongridTransaction.txID,
        from: [],
        to: [],
        events: [
          {
            status,
            timestamp,
          },
        ],
        chain: scope,
        status,
        account: account.id,
        timestamp,
        fees,
      };
    }

    // Handle TRX-only smart contract calls (e.g., deposits, registrations)
    // If there's a callValue (TRX sent) and no TRC20 transfers, map as a TRX send
    if (trc20Transfers.length === 0 && callValue && callValue > 0) {
      if (!ownerAddress || !contractAddress) {
        return null;
      }

      const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);
      const trxAmount = (callValue / SUN_IN_TRX).toString();
      const fees = TransactionMapper.#calculateTronFees(
        scope,
        trongridTransaction,
      );
      const tronAsset = Networks[scope].nativeToken;

      return {
        type: TransactionType.Send,
        id: trongridTransaction.txID,
        from: [
          {
            address: this.#toTronAddress(ownerAddress),
            asset: {
              unit: tronAsset.symbol,
              type: tronAsset.id,
              amount: trxAmount,
              fungible: true,
            },
          },
        ],
        to: [
          {
            address: this.#toTronAddress(contractAddress),
            asset: {
              unit: tronAsset.symbol,
              type: tronAsset.id,
              amount: trxAmount,
              fungible: true,
            },
          },
        ],
        events: [
          {
            status,
            timestamp,
          },
        ],
        chain: scope,
        status,
        account: account.id,
        timestamp,
        fees,
      };
    }

    // If no TRC20 assistance data is available and no callValue, we can't parse this smart contract interaction, so skip it
    if (trc20Transfers.length === 0 && (!callValue || callValue === 0)) {
      return null;
    }

    // At this point, we have TRC20 transfers to work with (or a combination with TRX)
    // Check if this is a swap:
    // 1. TRC20 ↔ TRC20: account is both sender and receiver with different tokens
    // 2. TRX ↔ TRC20: account receives/sends TRC20 + TRX moves in opposite direction

    const sentTrc20Transfer = trc20Transfers.find(
      (transfer) => transfer.from === account.address,
    );
    const receivedTrc20Transfer = trc20Transfers.find(
      (transfer) => transfer.to === account.address,
    );

    // Check for TRC20 ↔ TRC20 swap (different tokens)
    const isTrc20ToTrc20Swap =
      sentTrc20Transfer &&
      receivedTrc20Transfer &&
      sentTrc20Transfer.token_info.address !==
        receivedTrc20Transfer.token_info.address;

    if (
      sentTrc20Transfer &&
      receivedTrc20Transfer &&
      trc20Transfers.length >= 2 &&
      isTrc20ToTrc20Swap
    ) {
      return this.#mapSwapTransaction({
        scope,
        account,
        trongridTransaction,
        sentTransfer: sentTrc20Transfer,
        receivedTransfer: receivedTrc20Transfer,
      });
    }

    // Check for TRX ↔ TRC20 swap
    // This happens when there's a TRC20 transfer and TRX movement in internal_transactions
    // Note: TronGrid's /v1/accounts/{address}/transactions endpoint often returns
    // internal_transactions as empty array. Full transaction details with internal_transactions
    // are fetched by TransactionsService.#enrichPotentialSwaps() if needed.
    const hasTrxMovement = this.#hasTrxMovementInTransaction(
      trongridTransaction,
      account.address,
    );

    // Also check if there's a call_value (TRX sent directly to contract)
    const hasCallValue = callValue && callValue > 0;

    // Check if there are ANY internal_transactions with TRX movement (indicates DEX swap)
    const hasAnyInternalTrxMovement =
      trongridTransaction.internal_transactions &&
      trongridTransaction.internal_transactions.length > 0 &&
      trongridTransaction.internal_transactions.some((internal: any) =>
        internal.callValueInfo?.some((vi: any) => (vi.callValue ?? 0) > 0),
      );

    // TRX → TRC20: User receives TRC20 and there's TRX being sent or internal TRX movements
    if (
      receivedTrc20Transfer &&
      !sentTrc20Transfer &&
      (hasTrxMovement || hasCallValue || hasAnyInternalTrxMovement)
    ) {
      return this.#mapTrxToTrc20Swap({
        scope,
        account,
        trongridTransaction,
        trc20Transfer: receivedTrc20Transfer,
      });
    }

    // TRC20 → TRX: User sends TRC20 and there's TRX being received
    // (Less common, we'll implement this later if needed)

    // Otherwise, handle as a regular TRC20 transfer
    // Use the first transfer (typically there's only one for regular transfers)
    const trc20AssistanceData = trc20Transfers[0];

    if (!trc20AssistanceData) {
      return null;
    }

    const { from, to } = trc20AssistanceData;

    // Convert from smallest unit to human-readable amount using token decimals
    const valueInSmallestUnit = trc20AssistanceData.value;
    const { decimals, address, symbol } = trc20AssistanceData.token_info;

    // Status already computed at the top of the method
    const isPending = status === TransactionStatus.Unconfirmed;

    // Use transaction timestamp for confirmed, current time for pending
    const timestamp = isPending
      ? Math.floor(Date.now() / 1000)
      : Math.floor(trc20AssistanceData.block_timestamp / 1000);
    const divisor = Math.pow(10, decimals);
    const valueInReadableUnit = (
      parseFloat(valueInSmallestUnit) / divisor
    ).toString();

    // Determine transaction type
    const type = this.#computeTransactionType({
      accountAddress: account.address,
      from,
      to,
    });

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
          address: from,
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
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps a FreezeBalance(V2) staking transaction to a Transaction.
   * Treat as a "send" of TRX into a staked resource asset (bandwidth/energy).
   *
   * @param params - The options object.
   * @param params.scope - The network scope.
   * @param params.account - The account executing the stake.
   * @param params.trongridTransaction - The raw transaction to map.
   * @returns The mapped transaction or null if unsupported.
   */
  static #mapFreezeBalanceContract({
    scope,
    account,
    trongridTransaction,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
  }): Transaction | null {
    const firstContract = trongridTransaction.raw_data
      .contract[0] as GeneralContractInfo;
    const contractValue = firstContract?.parameter?.value as ContractValue & {
      resource?: 'BANDWIDTH' | 'ENERGY';
    };
    if (!contractValue) {
      return null;
    }

    const ownerAddress: string | undefined = contractValue.owner_address;
    if (!ownerAddress) {
      return null;
    }
    const from = TronWeb.address.fromHex(ownerAddress);
    const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);

    // V2 uses "frozen_balance"; legacy may use "frozen_balance" or "frozen_balance_v2"
    const amountInSun: number =
      Number(
        contractValue.frozen_balance ??
          (contractValue as any).frozen_balance_v2,
      ) || 0;
    const amountInTrx = (amountInSun / SUN_IN_TRX).toString();

    // Determine resource and corresponding staked asset metadata
    const { resource } = contractValue as { resource?: 'BANDWIDTH' | 'ENERGY' };
    const isEnergy = resource === 'ENERGY';
    const isBandwidth = resource === 'BANDWIDTH';
    if (!isEnergy && !isBandwidth) {
      // If we cannot determine the resource, skip mapping to avoid incorrect classification
      return null;
    }

    const tronAsset = Networks[scope].nativeToken;
    const stakedAsset = isEnergy
      ? Networks[scope].stakedForEnergy
      : Networks[scope].stakedForBandwidth;

    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    return {
      type: TransactionType.StakeDeposit,
      id: trongridTransaction.txID,
      from: [
        {
          address: from,
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
          address: from,
          asset: {
            unit: stakedAsset.symbol,
            type: stakedAsset.id as CaipAssetType,
            amount: amountInTrx,
            fungible: true,
          },
        },
      ],
      events: [
        {
          status: TransactionStatus.Confirmed,
          timestamp,
        },
      ],
      chain: scope,
      status: TransactionStatus.Confirmed,
      account: account.id,
      timestamp,
      fees,
    };
  }

  /**
   * Maps an UnfreezeBalance(V2) unstaking transaction to a Transaction.
   * Treat as a "receive" of TRX from a staked resource asset (bandwidth/energy).
   *
   * @param params - The options object.
   * @param params.scope - The network scope.
   * @param params.account - The account executing the unstake.
   * @param params.trongridTransaction - The raw transaction to map.
   * @returns The mapped transaction or null if unsupported.
   */
  static #mapUnfreezeBalanceContract({
    scope,
    account,
    trongridTransaction,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
  }): Transaction | null {
    const firstContract = trongridTransaction.raw_data
      .contract[0] as GeneralContractInfo;
    const contractValue = firstContract?.parameter?.value as ContractValue & {
      resource?: 'BANDWIDTH' | 'ENERGY';
    };
    if (!contractValue) {
      return null;
    }

    const ownerAddress: string | undefined = contractValue.owner_address;
    if (!ownerAddress) {
      return null;
    }
    const to = TronWeb.address.fromHex(ownerAddress);
    const timestamp = Math.floor(trongridTransaction.block_timestamp / 1000);

    // V2 uses "unfreeze_balance"; legacy may use this or a similar field
    const amountInSun: number = Number(contractValue.unfreeze_balance) || 0;
    const amountInTrx = (amountInSun / SUN_IN_TRX).toString();

    // Determine resource and corresponding staked asset metadata
    const { resource } = contractValue as { resource?: 'BANDWIDTH' | 'ENERGY' };
    const isEnergy = resource === 'ENERGY';
    const isBandwidth = resource === 'BANDWIDTH';
    if (!isEnergy && !isBandwidth) {
      return null;
    }

    const tronAsset = Networks[scope].nativeToken;
    const stakedAsset = isEnergy
      ? Networks[scope].stakedForEnergy
      : Networks[scope].stakedForBandwidth;

    const fees = TransactionMapper.#calculateTronFees(
      scope,
      trongridTransaction,
    );

    return {
      type: TransactionType.StakeWithdraw,
      id: trongridTransaction.txID,
      from: [
        {
          address: to,
          asset: {
            unit: stakedAsset.symbol,
            type: stakedAsset.id as CaipAssetType,
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
          status: TransactionStatus.Confirmed,
          timestamp,
        },
      ],
      chain: scope,
      status: TransactionStatus.Confirmed,
      account: account.id,
      timestamp,
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
   * @param params.trc20Transfers - Optional array of TRC20 transfers for this transaction ID.
   * @param params.trc10TokenMetadata - Optional map of TRC10 token ID to metadata (including decimals).
   * @returns The mapped Transaction or null if the transaction is not supported.
   */
  static mapTransaction({
    scope,
    account,
    trongridTransaction,
    trc20Transfers = [],
    trc10TokenMetadata,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    trongridTransaction: TransactionInfo;
    trc20Transfers?: ContractTransactionInfo[];
    trc10TokenMetadata?: Map<string, TRC10TokenMetadata>;
  }): Transaction | null {
    /**
     * Cheat Sheet of "raw_data" > "contract" > "type"
     *
     * TransferContract - Native TRX transfer
     * TransferAssetContract - TRC10 token transfer
     * TriggerSmartContract - Smart contract interaction (can be TRC20 transfer, swap, or TRX-only call)
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
          trc10TokenMetadata,
        });

      case 'FreezeBalanceV2Contract':
      case 'FreezeBalanceContract':
        return this.#mapFreezeBalanceContract({
          scope,
          account,
          trongridTransaction,
        });

      case 'UnfreezeBalanceV2Contract':
      case 'UnfreezeBalanceContract':
        return this.#mapUnfreezeBalanceContract({
          scope,
          account,
          trongridTransaction,
        });

      case 'TriggerSmartContract':
        return this.#mapTriggerSmartContract({
          scope,
          account,
          trongridTransaction,
          trc20Transfers,
        });

      default:
        // Unsupported transaction type
        return null;
    }
  }

  /**
   * Maps raw transaction data with TRC20 assistance data to create a complete transaction mapping.
   * This method treats raw transactions as the primary source and uses TRC20 data as assistance.
   * It also handles TRC20-only transactions (e.g., airdrops, contract withdrawals).
   *
   * @param params - The parameters for mapping the transaction.
   * @param params.scope - The network scope (e.g., mainnet, shasta).
   * @param params.account - The TronKeyringAccount for which the transaction is being mapped.
   * @param params.rawTransactions - Array of raw transaction data (primary source).
   * @param params.trc20Transactions - Array of TRC20 transaction data (assistance).
   * @param params.trc10TokenMetadata - Optional map of TRC10 token ID to metadata (including decimals).
   * @returns Array of mapped Transactions.
   */
  static mapTransactions({
    scope,
    account,
    rawTransactions,
    trc20Transactions,
    trc10TokenMetadata,
  }: {
    scope: Network;
    account: TronKeyringAccount;
    rawTransactions: TransactionInfo[];
    trc20Transactions: ContractTransactionInfo[];
    trc10TokenMetadata?: Map<string, TRC10TokenMetadata>;
  }): Transaction[] {
    const transactions: Transaction[] = [];
    const processedTxIds = new Set<string>();

    // Group TRC20 transactions by transaction_id
    const trc20ByTxId = new Map<string, ContractTransactionInfo[]>();
    for (const trc20Tx of trc20Transactions) {
      const existing = trc20ByTxId.get(trc20Tx.transaction_id) ?? [];
      existing.push(trc20Tx);
      trc20ByTxId.set(trc20Tx.transaction_id, existing);
    }

    // Process each raw transaction as the primary source
    for (const rawTx of rawTransactions) {
      const trc20Transfers = trc20ByTxId.get(rawTx.txID) ?? [];

      const mappedTx = this.mapTransaction({
        scope,
        account,
        trongridTransaction: rawTx,
        trc20Transfers,
        trc10TokenMetadata,
      });

      if (mappedTx) {
        transactions.push(mappedTx);
        processedTxIds.add(rawTx.txID);
      }
    }

    // Process TRC20-only transactions (those not covered by raw transactions)
    for (const trc20Tx of trc20Transactions) {
      if (!processedTxIds.has(trc20Tx.transaction_id)) {
        const mappedTx = this.#mapTrc20OnlyTransaction({
          scope,
          account,
          trc20Transfer: trc20Tx,
        });

        if (mappedTx) {
          transactions.push(mappedTx);
          processedTxIds.add(trc20Tx.transaction_id);
        }
      }
    }

    return transactions;
  }
}
