import type { KeyringRequest } from '@metamask/keyring-api';
import { SolMethod } from '@metamask/keyring-api';
import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';
import type {
  Logger,
  Serializable,
  ICache,
} from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/snaps-sdk';
import { Duration, parseCaipAssetType } from '@metamask/utils';
import type { Extension, Mint } from '@solana-program/token-2022';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import type { Account, Address } from '@solana/kit';
import {
  address as asAddress,
  compileTransaction,
  unwrapOption,
} from '@solana/kit';
import { BigNumber } from 'bignumber.js';

import type { Network } from '../../constants/solana';
import { Networks } from '../../constants/solana';
import type { SolanaKeyring } from '../../handlers/onKeyringRequest/Keyring';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { useCache } from '../../utils/caching';
import { lamportsToSol, solToLamports } from '../../utils/conversion';
import type { AssetsService } from '../assets';
import type { SolanaConnection } from '../connection';
import type { RecipientClassifier } from './RecipientClassifier';
import { SendFeeCalculator } from './SendFeeCalculator';
import type { SendSolBuilder } from './SendSolBuilder';
import { SendSplTokenBuilder } from './SendSplTokenBuilder';
import { SendErrorCodes } from './types';
import type {
  GetMaxSendableAmountRequest,
  OnAmountInputRequest,
  OnConfirmSendRequest,
  ValidationResponse,
} from './types';

const LEGACY_TOKEN_ACCOUNT_DATA_LENGTH = 165;

const MULTISIG_ACCOUNT_DATA_LENGTH = 355;

const IMMUTABLE_OWNER_EXTENSION_DATA_LENGTH = 4;

/**
 * TLV length (u16 type + u16 length + data) that the ATA program reserves on a
 * Token-2022 token account for each extension the mint requires.
 *
 * @see https://github.com/solana-program/token-2022/blob/main/program/src/extension/mod.rs
 */
const TOKEN_ACCOUNT_EXTENSION_DATA_LENGTHS: Partial<
  Record<Extension['__kind'], number>
> = {
  TransferFeeConfig: 12,
  ConfidentialTransferMint: 299,
  ConfidentialTransferFee: 68,
  NonTransferable: 4,
  TransferHook: 5,
  PausableConfig: 4,
};

/**
 * Returns the data length of the associated token account that receives the
 * given mint, so its rent can be reserved.
 *
 * Legacy token accounts are always 165 bytes. Token-2022 accounts reserve room
 * for the extensions the mint requires, plus the immutable owner extension.
 *
 * @param mintAccount - The mint account.
 * @returns The data length of the recipient ATA in bytes.
 */
function getAtaDataLength(mintAccount: Account<Mint, Address>): number {
  if (mintAccount.programAddress !== TOKEN_2022_PROGRAM_ADDRESS) {
    return LEGACY_TOKEN_ACCOUNT_DATA_LENGTH;
  }

  const extensions = unwrapOption(mintAccount.data.extensions) ?? [];

  const extensionDataLength = extensions.reduce(
    (total, { __kind }) =>
      total + (TOKEN_ACCOUNT_EXTENSION_DATA_LENGTHS[__kind] ?? 0),
    IMMUTABLE_OWNER_EXTENSION_DATA_LENGTH,
  );

  const dataLength = LEGACY_TOKEN_ACCOUNT_DATA_LENGTH + extensionDataLength;

  // Token-2022 pads accounts that would collide with the multisig length.
  return dataLength === MULTISIG_ACCOUNT_DATA_LENGTH
    ? dataLength + 4
    : dataLength;
}

export class SendService {
  readonly #connection: SolanaConnection;

  readonly #keyring: SolanaKeyring;

  readonly #logger: Logger;

  readonly #cache: ICache<Serializable>;

  readonly #recipientClassifier: RecipientClassifier;

  readonly #sendSolBuilder: SendSolBuilder;

  readonly #sendSplTokenBuilder: SendSplTokenBuilder;

  readonly #assetsService: AssetsService;

  readonly #cacheTtlsMilliseconds = {
    minimumBalanceForRentExemption: 5 * Duration.Minute,
  };

  constructor(
    connection: SolanaConnection,
    keyring: SolanaKeyring,
    logger: Logger,
    cache: ICache<Serializable>,
    recipientClassifier: RecipientClassifier,
    sendSolBuilder: SendSolBuilder,
    sendSplTokenBuilder: SendSplTokenBuilder,
    assetsService: AssetsService,
  ) {
    this.#connection = connection;
    this.#keyring = keyring;
    this.#cache = cache;
    this.#logger = logger.withPrefix('[📬 SendService]');
    this.#recipientClassifier = recipientClassifier;
    this.#sendSolBuilder = sendSolBuilder;
    this.#sendSplTokenBuilder = sendSplTokenBuilder;
    this.#assetsService = assetsService;
  }

  async #getCachedMinimumBalanceForRentExemption(
    scope: Network,
    dataLength = 0,
  ): Promise<BigNumber> {
    const minimumBalanceForRentExemption = useCache<
      [Network, number],
      BigNumber
    >(
      async (cachedScope: Network, cachedDataLength: number) =>
        this.#connection
          .getRpc(cachedScope)
          .getMinimumBalanceForRentExemption(BigInt(cachedDataLength))
          .send()
          .then((response) => BigNumber(response.toString())),
      this.#cache,
      {
        functionName: 'SendService:getMinimumBalanceForRentExemption',
        ttlMilliseconds:
          this.#cacheTtlsMilliseconds.minimumBalanceForRentExemption,
        generateCacheKey: (functionName, args) => {
          const [cachedScope, cachedDataLength] = args as [Network, number];
          return `${functionName}:${cachedScope}:${cachedDataLength}`;
        },
      },
    );

    return minimumBalanceForRentExemption(scope, dataLength);
  }

  /**
   * Returns the lamports that must stay available to create the recipient's
   * associated token account, or `null` when the recipient cannot receive the
   * asset.
   *
   * An unknown recipient is assumed to need an ATA. A known recipient only
   * needs one when it is a system account without an ATA yet.
   *
   * @param scope - The network.
   * @param mint - The SPL token mint.
   * @param toAddress - The optional recipient address.
   * @returns The lamports to reserve, or `null` for an unsupported recipient.
   */
  async #getSplRecipientAtaRentLamports(
    scope: Network,
    mint: Address,
    toAddress?: string,
  ): Promise<BigNumber | null> {
    if (toAddress) {
      const recipientClassification = await this.#recipientClassifier.classify(
        toAddress,
        scope,
      );

      if (recipientClassification.type === 'UNSUPPORTED') {
        return null;
      }

      if (recipientClassification.type === 'TOKEN_ACCOUNT') {
        return recipientClassification.mint === mint ? BigNumber(0) : null;
      }
    }

    const mintAccount = await this.#connection.fetchMint(mint, scope);

    if (toAddress) {
      const recipientAta =
        await SendSplTokenBuilder.deriveAssociatedTokenAccountAddress({
          mint,
          owner: asAddress(toAddress),
          tokenProgram: mintAccount.programAddress,
        });

      const recipientAtaAccount = await this.#connection.fetchJsonParsedAccount(
        recipientAta,
        scope,
        undefined,
        { skipCache: true },
      );

      if (recipientAtaAccount.exists) {
        return BigNumber(0);
      }
    }

    return this.#getCachedMinimumBalanceForRentExemption(
      scope,
      getAtaDataLength(mintAccount),
    );
  }

  /**
   * Handles the confirmation of a send transaction.
   *
   * @param request - The JSON-RPC request containing the parameters.
   * @returns The response to the JSON-RPC request.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async confirmSend(request: OnConfirmSendRequest): Promise<Json> {
    this.#logger.log('Confirming send transaction', request);

    const { fromAccountId, toAddress, amount, assetId } = request.params;

    const account = await this.#keyring.getAccountOrThrow(fromAccountId);

    const { chainId, assetReference } = parseCaipAssetType(assetId);

    const scope = chainId as Network;

    const isNativeSend = assetId === Networks[scope].nativeToken.caip19Id;

    const builder = isNativeSend
      ? this.#sendSolBuilder
      : this.#sendSplTokenBuilder;

    const params = {
      from: account,
      to: asAddress(toAddress),
      amount,
      network: scope,
      ...(isNativeSend ? {} : { mint: asAddress(assetReference) }),
    };

    const transactionMessage = await builder.buildTransactionMessage(params);

    const transaction = compileTransaction(transactionMessage);

    const base64EncodedTransaction = fromTransactionToBase64String(transaction);

    const keyringRequest: KeyringRequest = {
      id: globalThis.crypto.randomUUID(),
      scope,
      account: fromAccountId,
      origin: DEFAULT_METAMASK_ORIGIN,
      request: {
        method: SolMethod.SignAndSendTransaction,
        params: {
          account: {
            address: account.address,
          },
          transaction: base64EncodedTransaction,
          scope,
        },
      },
    };

    this.#logger.log('Submitting keyring request', keyringRequest);

    return this.#keyring.submitRequest(keyringRequest);
  }

  /**
   * Handles the input of an address.
   *
   * @param value - The value passed in the address input.
   * @param scope - The network to validate the address for.
   * @returns The response to the JSON-RPC request.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async onAddressInput(
    value: string,
    scope: Network,
  ): Promise<ValidationResponse> {
    if (value === '') {
      return {
        valid: false,
        errors: [{ code: SendErrorCodes.Required }],
      };
    }

    try {
      asAddress(value);

      // Check if the address is a supported recipient
      const recipientClassification = await this.#recipientClassifier.classify(
        value,
        scope,
      );
      if (recipientClassification.type === 'UNSUPPORTED') {
        throw new Error('Unsupported recipient');
      }

      return {
        valid: true,
        errors: [],
      };
    } catch {
      return {
        valid: false,
        errors: [{ code: SendErrorCodes.Invalid }],
      };
    }
  }

  /**
   * Handles the input of an amount.
   *
   * Covers the following errors:
   * - Required: If the value is empty.
   * - Invalid: If the SPL recipient cannot receive the asset.
   * - InsufficientBalanceToCoverFee: If the value plus fees and rent exceeds the balance.
   * - InsufficientBalance: If the value is greater than the balance.
   *
   * @param request - The JSON-RPC request containing the parameters.
   * @returns The response to the JSON-RPC request.
   */
  async onAmountInput(
    request: OnAmountInputRequest,
  ): Promise<ValidationResponse> {
    const {
      params: { value, accountId, assetId, toAddress },
    } = request;

    await this.#keyring.getAccountOrThrow(accountId);

    const { chainId, assetReference } = parseCaipAssetType(assetId);

    const scope = chainId as Network;

    const nativeAssetType = Networks[scope].nativeToken.caip19Id;

    const isNativeToken = assetId === nativeAssetType;

    const assetsById = await this.#assetsService.getAccountAssetsByIDs(
      accountId,
      [assetId, nativeAssetType],
    );

    const assetEntry = assetsById[assetId];
    const nativeAsset = assetsById[nativeAssetType];

    if (!assetEntry) {
      throw new Error(
        `Balance not found for asset ${assetId} and account ${accountId}`,
      );
    }

    // 1. value is required
    if (value === '') {
      return {
        valid: false,
        errors: [{ code: SendErrorCodes.Required }],
      };
    }

    const assetBalanceLamports = solToLamports(assetEntry.uiAmount ?? '0');
    const nativeBalanceLamports = solToLamports(nativeAsset?.uiAmount ?? '0');
    const valueLamports = solToLamports(value);

    const minimumBalanceForRentExemptionLamports =
      await this.#getCachedMinimumBalanceForRentExemption(scope);

    const builder = isNativeToken
      ? this.#sendSolBuilder
      : this.#sendSplTokenBuilder;

    const sendFeeCalculator = new SendFeeCalculator(builder);
    const feeInLamports = sendFeeCalculator.getFee();
    const feeEstimatedInLamports = BigNumber(feeInLamports.toString());

    // If you have 0 SOL, you can't pay for the fee, it's invalid
    if (nativeBalanceLamports.isZero()) {
      return {
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalance }],
      };
    }

    if (isNativeToken) {
      // First check if the amount alone exceeds the native balance
      if (valueLamports.gt(nativeBalanceLamports)) {
        return {
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalance }],
        };
      }

      // Then check if the (amount + fee + minimum balance for rent exemption) is greater than the native balance
      const isAmountPlusFeePlusRentExemptionGreaterThanBalance = valueLamports
        .plus(feeEstimatedInLamports)
        .plus(minimumBalanceForRentExemptionLamports)
        .gt(nativeBalanceLamports);

      if (isAmountPlusFeePlusRentExemptionGreaterThanBalance) {
        return {
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
        };
      }
    } else {
      // For SPL tokens, the native SOL balance must cover the fee, the
      // wallet's rent exemption, and the recipient ATA rent when it has to be
      // created.

      // Check if the amount is greater than the asset balance
      const isAmountGreaterThanAssetBalance =
        valueLamports.gt(assetBalanceLamports);

      if (isAmountGreaterThanAssetBalance) {
        return {
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalance }],
        };
      }

      const recipientAtaRentLamports =
        await this.#getSplRecipientAtaRentLamports(
          scope,
          asAddress(assetReference),
          toAddress,
        );

      if (recipientAtaRentLamports === null) {
        return {
          valid: false,
          errors: [{ code: SendErrorCodes.Invalid }],
        };
      }

      const isFeePlusRentExemptionGreaterThanNativeBalance =
        feeEstimatedInLamports
          .plus(minimumBalanceForRentExemptionLamports)
          .plus(recipientAtaRentLamports)
          .gt(nativeBalanceLamports);

      if (isFeePlusRentExemptionGreaterThanNativeBalance) {
        return {
          valid: false,
          errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
        };
      }
    }

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Computes the maximum amount that can be sent for the given asset.
   *
   * Uses the same balances, rent exemption, and fee helpers as `onAmountInput`.
   * SOL leaves the fee and the rent-exempt minimum; SPL returns the token
   * balance only when SOL covers the fee and the ATA rent, if the recipient
   * ATA must be created. An unknown recipient is treated conservatively.
   *
   * @param request - The JSON-RPC request containing the parameters.
   * @returns The maximum sendable amount, or `0` when no amount can pass.
   */
  async getMaxSendableAmount(
    request: GetMaxSendableAmountRequest,
  ): Promise<{ amount: string }> {
    const {
      params: { accountId, assetId, toAddress },
    } = request;

    await this.#keyring.getAccountOrThrow(accountId);

    const { chainId, assetReference } = parseCaipAssetType(assetId);

    const scope = chainId as Network;

    const nativeAssetType = Networks[scope].nativeToken.caip19Id;

    const isNativeToken = assetId === nativeAssetType;

    const assetsById = await this.#assetsService.getAccountAssetsByIDs(
      accountId,
      [assetId, nativeAssetType],
    );

    const assetEntry = assetsById[assetId];
    const nativeAsset = assetsById[nativeAssetType];

    if (!assetEntry) {
      return { amount: '0' };
    }

    const nativeBalanceLamports = solToLamports(nativeAsset?.uiAmount ?? '0');

    const minimumBalanceForRentExemptionLamports =
      await this.#getCachedMinimumBalanceForRentExemption(scope);

    const builder = isNativeToken
      ? this.#sendSolBuilder
      : this.#sendSplTokenBuilder;

    const feeLamports = BigNumber(
      new SendFeeCalculator(builder).getFee().toString(),
    );

    if (isNativeToken) {
      const maxLamports = nativeBalanceLamports
        .minus(feeLamports)
        .minus(minimumBalanceForRentExemptionLamports);

      if (maxLamports.lte(0)) {
        return { amount: '0' };
      }

      return { amount: lamportsToSol(maxLamports).toFixed() };
    }

    const recipientAtaRentLamports = await this.#getSplRecipientAtaRentLamports(
      scope,
      asAddress(assetReference),
      toAddress,
    );

    if (recipientAtaRentLamports === null) {
      return { amount: '0' };
    }

    const isFeePlusRentExemptionGreaterThanNativeBalance = feeLamports
      .plus(minimumBalanceForRentExemptionLamports)
      .plus(recipientAtaRentLamports)
      .gt(nativeBalanceLamports);

    if (isFeePlusRentExemptionGreaterThanNativeBalance) {
      return { amount: '0' };
    }

    return { amount: BigNumber(assetEntry.uiAmount ?? '0').toFixed() };
  }
}
