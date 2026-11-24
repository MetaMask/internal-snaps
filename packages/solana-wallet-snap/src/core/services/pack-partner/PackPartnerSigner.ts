import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR,
  SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  TRANSFER_CHECKED_DISCRIMINATOR,
  findAssociatedTokenPda,
  getTokenDecoder,
  getTokenEncoder,
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

export type PackPartnerBuyContext = { amount: string };
export type PackPartnerSignedTransaction = {
  signedTransaction: string;
  signature: string;
};
type Intent = { kind: 'buy'; amount: string };
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
  user: Address;
  provider: Address;
  transaction: Transaction;
  rpc: ReturnType<SolanaConnection['getRpc']>;
  instructions: readonly Instruction[];
  staticAccounts: readonly Address[];
  payer: Address;
  userUsdc: Address;
  providerUsdc: Address;
}>;

type SimulatedEffects = Readonly<{
  addresses: readonly Address[];
  before: readonly (ChainAccount | null)[];
  after: readonly (ChainAccount | null)[];
  userFee: bigint;
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

function validatePaymentInstruction(
  instruction: PackPartnerInstruction,
  {
    userUsdc,
    providerUsdc,
    user,
    config: { usdcMint },
    amount,
  }: PreparedTransaction,
): void {
  requireValid(
    instruction.data.length === 10 &&
      instruction.data[0] === TRANSFER_CHECKED_DISCRIMINATOR,
    'only checked USDC transfers are allowed',
  );
  const transfer = parseTransferCheckedInstruction(instruction);
  requireValid(
    instruction.accounts.length === 4 ||
      (instruction.accounts.length === 5 &&
        instruction.accounts[4]?.address === user &&
        isSignerRole(instruction.accounts[4].role)),
    'unexpected transfer accounts',
  );
  requireValid(
    transfer.accounts.source?.address === userUsdc &&
      transfer.accounts.destination?.address === providerUsdc &&
      transfer.accounts.mint?.address === usdcMint &&
      transfer.accounts.authority?.address === user &&
      isSignerRole(transfer.accounts.authority.role) &&
      transfer.data.amount === amount &&
      transfer.data.decimals === 6,
    'USDC transfer does not match confirmed intent',
  );
}

function validateComputeBudgetInstruction(
  instruction: PackPartnerInstruction,
  computeKinds: Set<number>,
): void {
  const kind = instruction.data[0];
  requireValid(
    kind !== undefined &&
      !computeKinds.has(kind) &&
      instruction.accounts.length === 0,
    'invalid compute budget',
  );
  requireValid(
    (kind === SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR &&
      instruction.data.length === 5) ||
      (kind === SET_COMPUTE_UNIT_PRICE_DISCRIMINATOR &&
        instruction.data.length === 9),
    'unsupported compute instruction',
  );
  if (kind === SET_COMPUTE_UNIT_LIMIT_DISCRIMINATOR) {
    const { units } = parseSetComputeUnitLimitInstruction(instruction).data;
    requireValid(units > 0 && units <= 1_400_000, 'invalid compute limit');
  } else {
    parseSetComputeUnitPriceInstruction(instruction);
  }
  computeKinds.add(kind);
}

function validateMemoInstruction(
  instruction: PackPartnerInstruction,
  { user, provider }: PreparedTransaction,
): void {
  requireValid(
    instruction.data.length > 0 &&
      instruction.accounts.every(
        (account) =>
          (account.address === user || account.address === provider) &&
          isSignerRole(account.role),
      ),
    'invalid memo',
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
    this.#validateInstructions(prepared);
    const effects = await this.#simulateTransaction(wire, prepared);
    this.#validateEffects(prepared, effects);
    return this.#signTransaction(account, prepared.transaction, prepared.user);
  }

  /**
   * Validate the intent and network, authenticate the presigner, and resolve accounts.
   *
   * @param account - Selected keyring account.
   * @param wire - Original presigned transaction bytes in base64.
   * @param intent - Purchase confirmed by the client.
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
    const { signers: trustedProviders, usdcMint } = config;
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
    requireValid(
      compiled.version !== 0 || !compiled.addressTableLookups?.length,
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
    return {
      config,
      intent,
      amount,
      user,
      provider,
      transaction,
      rpc,
      instructions: message.instructions,
      staticAccounts: compiled.staticAccounts,
      payer,
      userUsdc,
      providerUsdc,
    };
  }

  /**
   * Accept only the reviewed purchase instruction shapes.
   *
   * @param prepared - Authenticated transaction and resolved intent.
   */
  #validateInstructions(prepared: PreparedTransaction): void {
    const {
      instructions,
      config: { memoPrograms },
    } = prepared;
    let transferCount = 0;
    let memoCount = 0;
    const computeKinds = new Set<number>();
    for (const raw of instructions) {
      requireValid(raw.data, 'incomplete instruction');
      const instruction: PackPartnerInstruction = {
        ...raw,
        data: Uint8Array.from(raw.data),
        accounts: raw.accounts ?? [],
      };
      if (instruction.programAddress === TOKEN_PROGRAM_ADDRESS) {
        validatePaymentInstruction(instruction, prepared);
        transferCount += 1;
      } else if (
        instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS
      ) {
        validateComputeBudgetInstruction(instruction, computeKinds);
      } else if (memoPrograms.includes(instruction.programAddress)) {
        validateMemoInstruction(instruction, prepared);
        memoCount += 1;
      } else {
        requireValid(false, 'unsupported instruction');
      }
    }
    requireValid(
      transferCount === 1 && memoCount === 1,
      'invalid transaction shape',
    );
  }

  /**
   * Read account state, enforce the fee cap, and simulate the exact presigned message.
   *
   * @param wire - Original transaction bytes, never recompiled or given a new blockhash.
   * @param prepared - Authenticated transaction and network-bound RPC.
   * @returns Complete before/after account snapshots and the fee charged to the user.
   */
  async #simulateTransaction(
    wire: string,
    prepared: PreparedTransaction,
  ): Promise<SimulatedEffects> {
    const { transaction, rpc, staticAccounts } = prepared;
    const addresses = staticAccounts;
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
    let userFee = 0n;
    if (prepared.payer === prepared.user) {
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
      requireValid(fee.value <= PACK_PARTNER_MAX_FEE, 'total fee exceeds cap');
      userFee = fee.value;
    }
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
      userFee,
    };
  }

  /**
   * Check USDC and SOL effects; all other accounts must remain unchanged.
   *
   * @param prepared - Exact intent, payment accounts and network policy.
   * @param effects - Account snapshots and fee from successful simulation.
   */
  #validateEffects(
    prepared: PreparedTransaction,
    effects: SimulatedEffects,
  ): void {
    const { addresses, before, after, userFee } = effects;
    const {
      config: { usdcMint },
      amount,
      user,
      provider,
      payer,
      userUsdc,
      providerUsdc,
    } = prepared;
    for (const [index, accountAddress] of addresses.entries()) {
      const pre = before[index];
      const post = after[index];
      requireValid(
        pre !== undefined && post !== undefined,
        'missing simulated account',
      );
      if (accountAddress === userUsdc || accountAddress === providerUsdc) {
        const userDelta = -amount;
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
            post.lamports === pre.lamports - userFee,
            'unexpected user SOL movement',
          );
        }
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
