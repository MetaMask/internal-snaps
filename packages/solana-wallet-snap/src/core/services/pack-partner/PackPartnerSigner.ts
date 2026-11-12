import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getMintDecoder,
  getTokenDecoder,
  getTokenEncoder,
  parseTransferInstruction,
  parseTransferCheckedInstruction,
} from '@solana-program/token';
import {
  address,
  assertIsFullySignedTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase64Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  isSignerRole,
  partiallySignTransaction,
  verifySignature,
} from '@solana/kit';
import type {
  Address,
  Base64EncodedWireTransaction,
  Instruction,
  InstructionWithAccounts,
  AccountMeta,
  TransactionMessageBytesBase64,
  InstructionWithData,
  ReadonlyUint8Array,
  Transaction,
} from '@solana/kit';

import type { Network } from '../../constants/solana';
import {
  fromBase64StringToTransaction,
  fromBytesToCompilableTransactionMessage,
  fromTransactionToBase64String,
} from '../../sdk-extensions/codecs';
import { isTransactionMessageWithFeePayer } from '../../sdk-extensions/transaction-messages';
import { deriveSolanaKeypair } from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import { getPackPartnerNetworkConfig, PACK_PARTNER_MAX_FEE } from './constants';
import {
  CNFT_CORE_TRANSFER_FEE,
  validateCnftCoreTransfer,
} from './nft-standards/cnft-core';
import { validateCoreTransfer, validateCoreAsset } from './nft-standards/core';
import { validateNftMetadata, validateNftTransfer } from './nft-standards/nft';
import type { NftTransferAccounts } from './nft-standards/nft';
import {
  validatePnftMetadata,
  validatePnftTransfer,
} from './nft-standards/pnft';
import type { PnftTransferAccounts } from './nft-standards/pnft';
import {
  CORE_PROGRAM_ADDRESS,
  TOKEN_METADATA_PROGRAM_ADDRESS,
  BUBBLEGUM_PROGRAM_ADDRESS,
  COMPRESSION_PROGRAM_ADDRESS,
} from './nft-standards/programs';

export type PackPartnerBuyContext = { amount: string };
export type PackPartnerNftStandard =
  | 'core'
  | 'pnft'
  | 'nft'
  | 'cnft-core'
  | 'unknown';
export type PackPartnerBuybackContext = PackPartnerBuyContext & {
  assetAddress: string;
  expectedStandard: PackPartnerNftStandard;
};
export type PackPartnerSignedTransaction = {
  signedTransaction: string;
  signature: string;
};
type Intent =
  | { kind: 'buy'; amount: string }
  | ({ kind: 'buyback' } & PackPartnerBuybackContext);
type PackPartnerInstruction = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;
type ChainAccount = {
  owner: Address;
  executable: boolean;
  lamports: bigint;
  data: readonly [string, 'base64'];
};

/** Internal inputs shared by the ordered validation stages; never supplied by the caller. */
type PreparedTransaction = Readonly<{
  config: ReturnType<typeof getPackPartnerNetworkConfig>;
  intent: Intent;
  amount: bigint;
  expectedCollection: Address | undefined;
  user: Address;
  provider: Address;
  transaction: Transaction;
  rpc: ReturnType<SolanaConnection['getRpc']>;
  instructions: readonly Instruction[];
  staticAccounts: readonly Address[];
  payer: Address;
  userUsdc: Address;
  providerUsdc: Address;
  nft: Address | undefined;
}>;

type ValidatedNftTransfer = Readonly<{
  nftRecipient: Address | undefined;
  pnftAccounts: PnftTransferAccounts | undefined;
  nftAccounts: NftTransferAccounts | undefined;
  cnftCoreAccounts:
    | Awaited<ReturnType<typeof validateCnftCoreTransfer>>
    | undefined;
}>;

type SimulatedEffects = Readonly<{
  addresses: readonly Address[];
  before: readonly (ChainAccount | null)[];
  after: readonly (ChainAccount | null)[];
  fee: bigint;
}>;

/**
 * Reject inconclusive checks; no fallback to the generic transaction signer.
 *
 * @param condition - The condition required to sign.
 * @param message - Reason for rejecting the transaction.
 */
function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvalidParamsError(`Pack Partner: ${message}`) as Error;
  }
}

/**
 * Compare account data without converting atomic amounts to floating point.
 *
 * @param before - Account state before execution.
 * @param after - Simulated account state after execution.
 * @returns Whether the account is unchanged.
 */
function sameAccount(
  before: ChainAccount | null,
  after: ChainAccount | null,
): boolean {
  return before === null
    ? after === null
    : after !== null &&
        before.owner === after.owner &&
        before.executable === after.executable &&
        before.lamports === after.lamports &&
        before.data[0] === after.data[0];
}

/**
 * Only the SPL token amount may change; approvals and authorities must survive unchanged.
 *
 * @param before - Account state before execution.
 * @param after - Simulated account state after execution.
 * @param owner - Expected token account owner.
 * @param delta - Expected change in atomic token units.
 * @param usdcMint - Trusted mint for the selected cluster.
 * @param checkDelta - Whether to compare a balance snapshot across RPC calls.
 */
function validateTokenChange(
  before: ChainAccount | null,
  after: ChainAccount | null,
  owner: Address,
  delta: bigint,
  usdcMint: Address,
  checkDelta = true,
): void {
  requireValid(
    after && !after.executable && after.owner === TOKEN_PROGRAM_ADDRESS,
    'invalid USDC token account',
  );
  const bytes = getBase64Encoder().encode(after.data[0]);
  requireValid(bytes.length === 165, 'unsupported token account');
  const token = getTokenDecoder().decode(bytes);
  requireValid(
    token.mint === usdcMint && token.owner === owner && token.state === 1,
    'wrong USDC owner or mint',
  );
  if (before === null) {
    requireValid(
      delta > 0n &&
        token.amount === delta &&
        token.delegate.__option === 'None' &&
        token.closeAuthority.__option === 'None' &&
        token.isNative.__option === 'None' &&
        token.delegatedAmount === 0n,
      'unexpected new token account',
    );
    return;
  }
  requireValid(
    before.owner === TOKEN_PROGRAM_ADDRESS &&
      before.lamports === after.lamports &&
      !before.executable,
    'token account changed',
  );
  const previous = getTokenDecoder().decode(
    getBase64Encoder().encode(before.data[0]),
  );
  // Codec encoding avoids depending on byte offsets in the token layout.
  const expected = getBase64Decoder().decode(
    getTokenEncoder().encode({
      ...previous,
      amount: checkDelta ? previous.amount + delta : token.amount,
    }),
  );
  requireValid(
    expected === after.data[0],
    'unexpected token balance or authority change',
  );
}

/**
 * Check the exact token-account changes made by a reviewed SPL-backed NFT transfer.
 *
 * @param before - Token account before simulation.
 * @param after - Token account after simulation, or null if closed.
 * @param mint - NFT mint selected by the user.
 * @param owner - Expected token-account authority.
 * @param amountBefore - Required NFT amount before transfer.
 * @param amountAfter - Required amount after transfer, or null for closure.
 */
function validateLegacyNftTokenAccount(
  before: ChainAccount | null,
  after: ChainAccount | null,
  mint: Address,
  owner: Address,
  amountBefore: bigint,
  amountAfter: bigint | null,
): void {
  requireValid(
    before?.owner === TOKEN_PROGRAM_ADDRESS &&
      !before.executable &&
      getBase64Encoder().encode(before.data[0]).length === 165,
    'invalid NFT token account',
  );
  const previous = getTokenDecoder().decode(
    getBase64Encoder().encode(before.data[0]),
  );
  requireValid(
    previous.mint === mint &&
      previous.owner === owner &&
      previous.amount === amountBefore &&
      (previous.state === 1 || previous.state === 2) &&
      previous.delegate.__option === 'None' &&
      previous.closeAuthority.__option === 'None' &&
      previous.isNative.__option === 'None' &&
      previous.delegatedAmount === 0n,
    'unexpected NFT token owner, mint, or authority',
  );
  if (amountAfter === null) {
    requireValid(after === null, 'NFT source account was not closed');
    return;
  }
  requireValid(
    after?.owner === TOKEN_PROGRAM_ADDRESS &&
      !after.executable &&
      after.lamports === before.lamports &&
      getBase64Encoder().encode(after.data[0]).length === 165,
    'invalid destination NFT token account',
  );
  const current = getTokenDecoder().decode(
    getBase64Encoder().encode(after.data[0]),
  );
  requireValid(
    current.amount === amountAfter &&
      (current.state === 1 || current.state === 2) &&
      getBase64Decoder().decode(
        getTokenEncoder().encode({
          ...previous,
          amount: amountAfter,
          state: current.state,
        }),
      ) === after.data[0],
    'unexpected destination NFT token account change',
  );
}

/**
 * Internal Pack Partner signing boundary. Decode → authenticate → validate
 * instructions and simulated effects → derive key → sign the same message.
 * No dialogs, broadcasting, blockhash replacement or caller-supplied trust policy.
 */
export class PackPartnerSigner {
  readonly #connection: SolanaConnection;

  constructor(connection: SolanaConnection) {
    this.#connection = connection;
  }

  /**
   * Sign the exact USDC purchase confirmed by MetaMask (amount in micro-USDC).
   *
   * @param account - The selected Solana keyring account.
   * @param transaction - The presigned base64 wire transaction.
   * @param context - Confirmed purchase amount in USDC base units.
   * @param scope - Requested Solana cluster.
   * @returns The signed wire transaction and first signature.
   */
  async signBuy(
    account: ExtendedKeyringAccount,
    transaction: string,
    context: PackPartnerBuyContext,
    scope: Network,
  ): Promise<PackPartnerSignedTransaction> {
    return this.#validateAndSign(
      account,
      transaction,
      {
        kind: 'buy',
        amount: context.amount,
      },
      scope,
    );
  }

  /**
   * Sign the exchange of a reviewed NFT standard for exact net USDC proceeds.
   *
   * @param account - The selected Solana keyring account.
   * @param transaction - The presigned base64 wire transaction.
   * @param context - Confirmed asset, NFT standard and refund in USDC base units.
   * @param scope - Requested Solana cluster.
   * @returns The signed wire transaction and first signature.
   */
  async signBuyback(
    account: ExtendedKeyringAccount,
    transaction: string,
    context: PackPartnerBuybackContext,
    scope: Network,
  ): Promise<PackPartnerSignedTransaction> {
    return this.#validateAndSign(
      account,
      transaction,
      {
        kind: 'buyback',
        amount: context.amount,
        assetAddress: context.assetAddress,
        expectedStandard: context.expectedStandard,
      },
      scope,
    );
  }

  async #validateAndSign(
    account: ExtendedKeyringAccount,
    wire: string,
    intent: Intent,
    scope: Network,
  ): Promise<PackPartnerSignedTransaction> {
    const prepared = await this.#prepareTransaction(
      account,
      wire,
      intent,
      scope,
    );
    const nftTransfer = await this.#validateInstructions(prepared);
    const effects = await this.#simulateTransaction(
      wire,
      prepared,
      nftTransfer,
    );
    this.#validateEffects(prepared, nftTransfer, effects);
    return this.#signTransaction(account, prepared.transaction, prepared.user);
  }

  /**
   * Validate the intent and network, authenticate the presigner, and resolve accounts.
   *
   * @param account - Selected keyring account.
   * @param wire - Original presigned transaction bytes in base64.
   * @param intent - Purchase or buyback confirmed by the client.
   * @param scope - Explicit Solana network.
   * @returns Authenticated transaction and resolved inputs for instruction validation.
   */
  async #prepareTransaction(
    account: ExtendedKeyringAccount,
    wire: string,
    intent: Intent,
    scope: Network,
  ): Promise<PreparedTransaction> {
    const config = getPackPartnerNetworkConfig(scope);
    const { signers: trustedProviders, usdcMint, buyback } = config;
    requireValid(
      account.scopes.includes(scope),
      'account does not support requested network',
    );
    requireValid(
      typeof intent.amount === 'string' &&
        /^[1-9][0-9]{0,19}$/u.test(intent.amount),
      'amount must be a positive atomic integer',
    );
    const amount = BigInt(intent.amount);
    requireValid(amount <= 18446744073709551615n, 'amount exceeds u64');
    let expectedCollection: Address | undefined;
    if (intent.kind === 'buyback') {
      requireValid(
        intent.expectedStandard === 'core' ||
          intent.expectedStandard === 'pnft' ||
          intent.expectedStandard === 'nft' ||
          intent.expectedStandard === 'cnft-core',
        'NFT standard is not supported for silent buyback signing',
      );
      const policy = buyback[intent.expectedStandard];
      requireValid(
        policy,
        `No reviewed Pack Partner buyback configuration for network: ${scope}`,
      );
      expectedCollection = policy.collection;
    }
    const user = address(account.address);
    requireValid(!trustedProviders.includes(user), 'invalid user account');
    const transaction = await fromBase64StringToTransaction(wire);
    requireValid(
      fromTransactionToBase64String(transaction) === wire,
      'non-canonical wire transaction',
    );
    const provider = await this.#authenticate(
      transaction,
      user,
      trustedProviders,
    );

    const rpc = this.#connection.getRpc(scope);
    const compiled = getCompiledTransactionMessageDecoder().decode(
      transaction.messageBytes,
    );
    // No unreviewed lookup-table resolution or extra signer can widen the template.
    const lookupTables = Reflect.get(compiled, 'addressTableLookups') as
      | readonly unknown[]
      | undefined;
    requireValid(
      !lookupTables || lookupTables.length === 0,
      'lookup tables are unsupported',
    );
    requireValid(compiled.staticAccounts.length <= 100, 'too many accounts');
    const message = await fromBytesToCompilableTransactionMessage(
      transaction.messageBytes,
      rpc,
    );
    requireValid(
      isTransactionMessageWithFeePayer(message),
      'missing fee payer',
    );
    const payer = message.feePayer.address;
    requireValid(payer === provider || payer === user, 'invalid fee payer');
    const [userUsdc] = await findAssociatedTokenPda({
      owner: user,
      mint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [providerUsdc] = await findAssociatedTokenPda({
      owner: provider,
      mint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const nft =
      intent.kind === 'buyback' ? address(intent.assetAddress) : undefined;
    requireValid(nft !== usdcMint, 'USDC is not an NFT');
    return {
      config,
      intent,
      amount,
      expectedCollection,
      user,
      provider,
      transaction,
      rpc,
      instructions: message.instructions,
      staticAccounts: compiled.staticAccounts,
      payer,
      userUsdc,
      providerUsdc,
      nft,
    };
  }

  /**
   * Accept only the reviewed instruction shapes and identify the NFT accounts to check.
   *
   * @param prepared - Authenticated transaction and resolved intent.
   * @returns NFT accounts whose simulated effects must be validated; empty for purchases.
   */
  async #validateInstructions(
    prepared: PreparedTransaction,
  ): Promise<ValidatedNftTransfer> {
    const {
      config: { memoPrograms, usdcMint, buyback },
      intent,
      amount,
      expectedCollection,
      user,
      provider,
      instructions,
      payer,
      userUsdc,
      providerUsdc,
      nft,
    } = prepared;
    let transferCount = 0;
    let closeCount = 0;
    let memoCount = 0;
    let ataCount = 0;
    let nftRecipient: Address | undefined;
    let pnftAccounts: PnftTransferAccounts | undefined;
    let nftAccounts: NftTransferAccounts | undefined;
    let cnftCoreAccounts:
      | Awaited<ReturnType<typeof validateCnftCoreTransfer>>
      | undefined;
    const computeKinds = new Set<number>();
    for (const raw of instructions) {
      requireValid(raw.data, 'incomplete instruction');
      const instruction: PackPartnerInstruction = {
        ...raw,
        data: Uint8Array.from(raw.data),
        accounts: raw.accounts ?? [],
      };
      if (instruction.programAddress === TOKEN_PROGRAM_ADDRESS) {
        if (instruction.data.length === 1 && instruction.data[0] === 9) {
          requireValid(
            intent.kind === 'buyback' &&
              (intent.expectedStandard === 'pnft' ||
                intent.expectedStandard === 'nft') &&
              (pnftAccounts ?? nftAccounts) &&
              closeCount === 0 &&
              instruction.accounts.length === 3 &&
              instruction.accounts[0]?.address ===
                (pnftAccounts?.sourceToken ?? nftAccounts?.sourceToken) &&
              instruction.accounts[1]?.address === provider &&
              instruction.accounts[2]?.address === user &&
              isSignerRole(instruction.accounts[2].role),
            'unexpected NFT token-account close',
          );
          closeCount += 1;
          continue;
        }
        if (intent.kind === 'buyback' && intent.expectedStandard === 'pnft') {
          requireValid(
            instruction.data.length === 9 &&
              instruction.data[0] === 3 &&
              instruction.accounts.length === 3,
            'only the reviewed pNFT USDC transfer is allowed',
          );
          const transfer = parseTransferInstruction(instruction);
          requireValid(
            transfer.accounts.source?.address === providerUsdc &&
              transfer.accounts.destination?.address === userUsdc &&
              transfer.accounts.authority?.address === provider &&
              isSignerRole(transfer.accounts.authority.role) &&
              transfer.data.amount === amount,
            'USDC transfer does not match confirmed buyback',
          );
          transferCount += 1;
          continue;
        }
        requireValid(
          instruction.data.length === 10 && instruction.data[0] === 12,
          'only checked USDC transfers are allowed',
        );
        const transfer = parseTransferCheckedInstruction(instruction);
        const authority = intent.kind === 'buy' ? user : provider;
        requireValid(
          instruction.accounts.length === 4 ||
            (instruction.accounts.length === 5 &&
              instruction.accounts[4]?.address === authority &&
              isSignerRole(instruction.accounts[4].role)),
          'unexpected transfer accounts',
        );
        requireValid(
          transfer.accounts.source?.address ===
            (intent.kind === 'buy' ? userUsdc : providerUsdc) &&
            transfer.accounts.destination?.address ===
              (intent.kind === 'buy' ? providerUsdc : userUsdc) &&
            transfer.accounts.mint?.address === usdcMint &&
            transfer.accounts.authority?.address === authority &&
            isSignerRole(transfer.accounts.authority.role) &&
            transfer.data.amount === amount &&
            transfer.data.decimals === 6,
          'USDC transfer does not match confirmed intent',
        );
        transferCount += 1;
      } else if (
        instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS
      ) {
        const kind = instruction.data[0];
        requireValid(
          kind !== undefined &&
            !computeKinds.has(kind) &&
            instruction.accounts.length === 0,
          'invalid compute budget',
        );
        requireValid(
          (kind === 2 && instruction.data.length === 5) ||
            (kind === 3 && instruction.data.length === 9),
          'unsupported compute instruction',
        );
        if (kind === 2) {
          const { units } = parseSetComputeUnitLimitInstruction(
            instruction as Parameters<
              typeof parseSetComputeUnitLimitInstruction
            >[0],
          ).data;
          requireValid(
            units > 0 && units <= 1_400_000,
            'invalid compute limit',
          );
        } else {
          parseSetComputeUnitPriceInstruction(
            instruction as Parameters<
              typeof parseSetComputeUnitPriceInstruction
            >[0],
          );
        }
        computeKinds.add(kind);
      } else if (memoPrograms.includes(instruction.programAddress)) {
        requireValid(
          instruction.data.length > 0 &&
            instruction.accounts.every(
              (a) =>
                (a.address === user || a.address === provider) &&
                isSignerRole(a.role),
            ),
          'invalid memo',
        );
        memoCount += 1;
      } else if (
        instruction.programAddress === ASSOCIATED_TOKEN_PROGRAM_ADDRESS
      ) {
        const expected = [
          provider,
          userUsdc,
          user,
          usdcMint,
          SYSTEM_PROGRAM_ADDRESS,
          TOKEN_PROGRAM_ADDRESS,
        ];
        requireValid(
          intent.kind === 'buyback' &&
            instruction.data.length === 1 &&
            instruction.data[0] === 1 &&
            instruction.accounts.length === expected.length &&
            instruction.accounts.every(
              (a, index) => a.address === expected[index],
            ),
          'only sponsored creation of the user USDC ATA is allowed',
        );
        ataCount += 1;
      } else if (instruction.programAddress === BUBBLEGUM_PROGRAM_ADDRESS) {
        requireValid(
          nft &&
            intent.kind === 'buyback' &&
            intent.expectedStandard === 'cnft-core' &&
            expectedCollection &&
            !cnftCoreAccounts,
          'unexpected compressed NFT transfer',
        );
        cnftCoreAccounts = await validateCnftCoreTransfer(
          instruction,
          user,
          nft,
          provider,
          payer,
          expectedCollection,
        );
      } else if (instruction.programAddress === CORE_PROGRAM_ADDRESS) {
        requireValid(
          nft &&
            intent.kind === 'buyback' &&
            intent.expectedStandard === 'core' &&
            buyback.core &&
            !nftRecipient,
          'unexpected Core NFT transfer',
        );
        nftRecipient = validateCoreTransfer(
          instruction,
          user,
          nft,
          provider,
          payer,
          buyback.core,
        );
      } else if (
        instruction.programAddress === TOKEN_METADATA_PROGRAM_ADDRESS
      ) {
        requireValid(
          nft && intent.kind === 'buyback',
          'unexpected Token Metadata transfer',
        );
        if (intent.expectedStandard === 'pnft') {
          requireValid(
            buyback.pnft && !pnftAccounts,
            'unexpected pNFT transfer',
          );
          pnftAccounts = await validatePnftTransfer(
            instruction,
            user,
            nft,
            provider,
            payer,
            buyback.pnft.recipient,
          );
        } else if (intent.expectedStandard === 'nft') {
          requireValid(!nftAccounts, 'duplicate NFT transfer');
          nftAccounts = await validateNftTransfer(
            instruction,
            user,
            nft,
            provider,
            payer,
          );
        } else {
          requireValid(false, 'unexpected NFT standard');
        }
      } else {
        requireValid(false, 'unsupported instruction');
      }
    }
    requireValid(
      transferCount === 1 &&
        memoCount === 1 &&
        ataCount <= 1 &&
        closeCount === (pnftAccounts || nftAccounts ? 1 : 0) &&
        (!pnftAccounts || ataCount === 0),
      'invalid transaction shape',
    );
    requireValid(
      intent.kind === 'buy'
        ? true
        : Boolean(
            nftRecipient ?? pnftAccounts ?? nftAccounts ?? cnftCoreAccounts,
          ),
      'missing NFT transfer',
    );

    return { nftRecipient, pnftAccounts, nftAccounts, cnftCoreAccounts };
  }

  /**
   * Read account state, enforce the fee cap, and simulate the exact presigned message.
   *
   * @param wire - Original transaction bytes, never recompiled or given a new blockhash.
   * @param prepared - Authenticated transaction and network-bound RPC.
   * @param nftTransfer - Validated transfer accounts, including any compressed NFT tree.
   * @returns Complete before/after account snapshots and the checked network fee.
   */
  async #simulateTransaction(
    wire: string,
    prepared: PreparedTransaction,
    nftTransfer: ValidatedNftTransfer,
  ): Promise<SimulatedEffects> {
    const { transaction, rpc, staticAccounts } = prepared;
    const { cnftCoreAccounts } = nftTransfer;
    // A compression tree can be megabytes. Only its canonical transfer is allowed;
    // successful simulation verifies the leaf/proof. Do not download the full tree
    // in either snapshot. Its ownership is checked separately without account data.
    const addresses = staticAccounts.filter(
      (key) => key !== cnftCoreAccounts?.tree,
    );
    const before = await rpc
      .getMultipleAccounts(addresses, {
        encoding: 'base64',
        commitment: 'confirmed',
      })
      .send();
    requireValid(
      before.value.length === addresses.length,
      'incomplete account snapshot',
    );
    if (cnftCoreAccounts) {
      const tree = await rpc
        .getAccountInfo(cnftCoreAccounts.tree, {
          encoding: 'base64',
          dataSlice: { offset: 0, length: 0 },
          commitment: 'confirmed',
          minContextSlot: before.context.slot,
        })
        .send();
      requireValid(
        tree.value?.owner === COMPRESSION_PROGRAM_ADDRESS &&
          !tree.value.executable,
        'invalid compressed NFT tree',
      );
    }
    const fee = await rpc
      .getFeeForMessage(
        getBase64Decoder().decode(
          transaction.messageBytes,
        ) as TransactionMessageBytesBase64,
        { commitment: 'confirmed', minContextSlot: before.context.slot },
      )
      .send();
    requireValid(
      fee.value !== null && fee.value > 0n,
      'fee unavailable or blockhash expired',
    );
    requireValid(
      fee.value + (cnftCoreAccounts ? CNFT_CORE_TRANSFER_FEE : 0n) <=
        PACK_PARTNER_MAX_FEE,
      'total fee exceeds cap',
    );
    // Deliberately unsigned: no private key is derived until simulation passes.
    const simulation = await rpc
      .simulateTransaction(wire as Base64EncodedWireTransaction, {
        encoding: 'base64',
        commitment: 'confirmed',
        minContextSlot: before.context.slot,
        sigVerify: false,
        replaceRecentBlockhash: false,
        accounts: { addresses, encoding: 'base64' },
      })
      .send();
    requireValid(
      simulation.value.err === null &&
        simulation.value.accounts?.length === addresses.length,
      'failed or incomplete simulation',
    );
    return {
      addresses,
      before: before.value,
      after: simulation.value.accounts,
      fee: fee.value,
    };
  }

  /**
   * Check USDC, SOL and NFT effects; all other accounts must remain unchanged.
   *
   * @param prepared - Exact intent, payment accounts and network policy.
   * @param nftTransfer - Accounts identified by instruction validation.
   * @param effects - Account snapshots and fee from successful simulation.
   */
  #validateEffects(
    prepared: PreparedTransaction,
    nftTransfer: ValidatedNftTransfer,
    effects: SimulatedEffects,
  ): void {
    const { addresses, before, after, fee } = effects;
    const {
      config: { usdcMint },
      intent,
      amount,
      expectedCollection,
      user,
      provider,
      payer,
      userUsdc,
      providerUsdc,
      nft,
    } = prepared;
    const { nftRecipient, pnftAccounts, nftAccounts, cnftCoreAccounts } =
      nftTransfer;
    for (const [index, accountAddress] of addresses.entries()) {
      const pre = before[index];
      const post = after[index];
      requireValid(
        pre !== undefined && post !== undefined,
        'missing simulated account',
      );
      if (accountAddress === userUsdc || accountAddress === providerUsdc) {
        const userDelta = intent.kind === 'buy' ? -amount : amount;
        validateTokenChange(
          pre,
          post,
          accountAddress === userUsdc ? user : provider,
          accountAddress === userUsdc ? userDelta : -userDelta,
          usdcMint,
          // Pack Partner's shared treasury changes between independent RPC
          // reads. The single decoded transfer and user balance prove the exact
          // amount; only the treasury's mint, owner and authority are compared.
          accountAddress === userUsdc,
        );
      } else if (accountAddress === user || accountAddress === provider) {
        // A sponsored wallet can own token accounts without holding any SOL.
        if (
          accountAddress === user &&
          payer !== user &&
          pre === null &&
          post === null
        ) {
          continue;
        }
        requireValid(
          pre &&
            post &&
            pre.owner === SYSTEM_PROGRAM_ADDRESS &&
            post.owner === pre.owner &&
            !pre.executable &&
            !post.executable &&
            pre.data[0] === '' &&
            post.data[0] === '',
          'invalid signer account',
        );
        if (accountAddress === user) {
          requireValid(
            post.lamports === pre.lamports - (payer === user ? fee : 0n),
            'unexpected user SOL movement',
          );
        }
      } else if (accountAddress === cnftCoreAccounts?.treeConfig) {
        requireValid(
          pre &&
            post &&
            pre.owner === BUBBLEGUM_PROGRAM_ADDRESS &&
            post.owner === pre.owner &&
            !pre.executable &&
            !post.executable &&
            pre.data[0] === post.data[0],
          'unexpected compressed NFT tree configuration change',
        );
        // This shared PDA accumulates Bubblegum transfer fees and can be collected
        // between RPC reads. The canonical instruction charges only the provider;
        // its fixed protocol fee is included in the cap, not inferred from a delta.
      } else if (accountAddress === cnftCoreAccounts?.collection) {
        requireValid(
          pre?.owner === CORE_PROGRAM_ADDRESS &&
            !pre.executable &&
            sameAccount(pre, post),
          'unexpected compressed NFT collection change',
        );
      } else if (
        accountAddress ===
        (pnftAccounts?.sourceToken ?? nftAccounts?.sourceToken)
      ) {
        requireValid(
          nft && expectedCollection,
          'missing NFT mint or collection',
        );
        validateLegacyNftTokenAccount(pre, post, nft, user, 1n, null);
      } else if (
        accountAddress ===
        (pnftAccounts?.destinationToken ?? nftAccounts?.destinationToken)
      ) {
        requireValid(
          nft && expectedCollection,
          'missing NFT mint or collection',
        );
        const transferAccounts = pnftAccounts ?? nftAccounts;
        requireValid(transferAccounts, 'missing NFT transfer');
        validateLegacyNftTokenAccount(
          pre,
          post,
          nft,
          transferAccounts.recipient,
          0n,
          1n,
        );
      } else if (accountAddress === pnftAccounts?.sourceTokenRecord) {
        requireValid(
          pre?.owner === TOKEN_METADATA_PROGRAM_ADDRESS &&
            !pre.executable &&
            post === null,
          'unexpected source pNFT token record',
        );
      } else if (accountAddress === pnftAccounts?.destinationTokenRecord) {
        requireValid(
          pre === null &&
            post?.owner === TOKEN_METADATA_PROGRAM_ADDRESS &&
            !post.executable &&
            post.lamports > 0n,
          'unexpected destination pNFT token record',
        );
      } else if (
        accountAddress === (pnftAccounts?.metadata ?? nftAccounts?.metadata)
      ) {
        requireValid(
          nft && expectedCollection,
          'missing NFT mint or collection',
        );
        requireValid(
          pre?.owner === TOKEN_METADATA_PROGRAM_ADDRESS &&
            !pre.executable &&
            sameAccount(pre, post),
          'unexpected NFT metadata change',
        );
        const metadataBytes = getBase64Encoder().encode(pre.data[0]);
        if (pnftAccounts) {
          validatePnftMetadata(metadataBytes, nft, expectedCollection);
        } else {
          validateNftMetadata(metadataBytes, nft, expectedCollection);
        }
      } else if (accountAddress === pnftAccounts?.edition) {
        requireValid(
          pre?.owner === TOKEN_METADATA_PROGRAM_ADDRESS &&
            !pre.executable &&
            sameAccount(pre, post),
          'unexpected pNFT edition change',
        );
      } else if ((pnftAccounts ?? nftAccounts) && accountAddress === nft) {
        requireValid(
          pre?.owner === TOKEN_PROGRAM_ADDRESS &&
            !pre.executable &&
            sameAccount(pre, post),
          'unexpected NFT mint change',
        );
        const mint = getMintDecoder().decode(
          getBase64Encoder().encode(pre.data[0]),
        );
        requireValid(
          mint.supply === 1n && mint.decimals === 0,
          'invalid NFT mint supply or decimals',
        );
      } else if (accountAddress === nft) {
        requireValid(
          pre &&
            post &&
            pre.owner === CORE_PROGRAM_ADDRESS &&
            post.owner === CORE_PROGRAM_ADDRESS &&
            !pre.executable &&
            !post.executable &&
            nftRecipient &&
            expectedCollection &&
            post.lamports === pre.lamports,
          'invalid NFT account',
        );
        validateCoreAsset(
          getBase64Encoder().encode(pre.data[0]),
          user,
          expectedCollection,
        );
        validateCoreAsset(
          getBase64Encoder().encode(post.data[0]),
          nftRecipient,
          expectedCollection,
        );
      } else {
        requireValid(sameAccount(pre, post), 'unexpected account change');
      }
    }
  }

  /**
   * Derive the user's key only after every guard passes, then sign the unchanged message.
   *
   * @param account - Keyring account supplying the derivation path and entropy source.
   * @param transaction - Original transaction that passed all validation stages.
   * @param user - Required address of the derived signing key.
   * @returns Fully signed transaction and its first signature, without broadcasting.
   */
  async #signTransaction(
    account: ExtendedKeyringAccount,
    transaction: Transaction,
    user: Address,
  ): Promise<PackPartnerSignedTransaction> {
    const { privateKeyBytes } = await deriveSolanaKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const signer =
      await createKeyPairSignerFromPrivateKeyBytes(privateKeyBytes);
    requireValid(signer.address === user, 'derived key does not match account');
    const signed = await partiallySignTransaction(
      [signer.keyPair],
      transaction,
    );
    assertIsFullySignedTransaction(signed);
    return {
      signedTransaction: fromTransactionToBase64String(signed),
      signature: getSignatureFromTransaction(signed),
    };
  }

  async #authenticate(
    transaction: Transaction,
    user: Address,
    trustedProviders: readonly Address[],
  ): Promise<Address> {
    const signers = Object.keys(transaction.signatures);
    // A rotation adds alternatives, never additional transaction signers. Tie
    // every transfer authority and payment account to this verified presigner.
    const provider = trustedProviders.find((candidate) =>
      signers.includes(candidate),
    );
    requireValid(
      signers.length === 2 && signers.includes(user) && provider,
      'unexpected required signers',
    );
    const signature = transaction.signatures[provider];
    requireValid(
      signature &&
        (await verifySignature(
          await getPublicKeyFromAddress(provider),
          signature,
          transaction.messageBytes,
        )),
      'missing or invalid Pack Partner presignature',
    );
    requireValid(
      !transaction.signatures[user],
      'user transaction is already signed',
    );
    return provider;
  }
}
