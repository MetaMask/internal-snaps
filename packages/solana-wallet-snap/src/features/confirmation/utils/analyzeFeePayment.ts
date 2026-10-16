import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
  AccountRole,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from '@solana/kit';
import type { TransactionMessageBytes } from '@solana/kit';

import type { InstructionParseResult } from '../../../entities';

/**
 * Size in bytes of an SPL Token account. Token-2022 associated token accounts
 * also carry the account type byte and the ImmutableOwner extension.
 */
const TOKEN_ACCOUNT_SPACE = 165;
const TOKEN_2022_ASSOCIATED_TOKEN_ACCOUNT_SPACE = 170;

const TOKEN_TRANSFER_TYPES = new Set([
  'Transfer',
  'TransferChecked',
  'TransferCheckedWithFee',
]);

const ASSOCIATED_TOKEN_ACCOUNT_CREATION_TYPES = new Set([
  'CreateAssociatedToken',
  'CreateAssociatedTokenIdempotent',
]);

const ACCOUNT_CREATION_TYPES = new Set([
  'CreateAccount',
  'CreateAccountWithSeed',
]);

/**
 * A cost the user pays even though someone else pays the network fee.
 * Amounts are strings so the confirmation context stays JSON-serializable.
 */
export type UserFeeCost =
  | {
      /** Rent for accounts this transaction creates with the user's SOL. */
      type: 'rent';
      lamports: string;
    }
  | {
      /** SOL sent from the user to the fee payer. */
      type: 'solToSponsor';
      lamports: string;
    }
  | {
      /** Tokens sent from the user to an account owned by the fee payer. */
      type: 'tokenToSponsor';
      mint: string;
      amount: string;
      decimals: number;
      symbol: string | null;
    };

export type FeePayment = {
  /** The account that pays the network fee (the first account of the message). */
  feePayer: string;
  /**
   * Who pays the network fee:
   * - `account`: the account confirming the transaction.
   * - `ownAccount`: another account of this wallet.
   * - `sponsor`: an account that does not belong to this wallet.
   */
  paidBy: 'account' | 'ownAccount' | 'sponsor';
  /**
   * What the transaction costs the user when it is sponsored:
   * - `free`: nothing. The sponsor pays the network fee and no instruction charges the user.
   * - `costs`: the user pays the costs listed in `userCosts`.
   * - `unverified`: no cost was found, but this wallet cannot promise the
   * transaction is free, for example because it could not simulate it.
   *
   * `null` when the transaction is not sponsored.
   */
  userCost: 'free' | 'costs' | 'unverified' | null;
  userCosts: UserFeeCost[];
  /**
   * Whether the user signs instructions this wallet cannot fully check, so
   * the user may pay more than `userCosts`.
   */
  mayCostMore: boolean;
  /**
   * Programs of the instructions the user signs that this wallet cannot
   * decode. Only set when the transaction could not be simulated.
   */
  uncheckedPrograms: string[];
};

/**
 * On-chain state of an account that the analysis needs. `null` when the
 * account does not exist.
 */
export type AccountSnapshot = {
  /** Owner of the token account, `null` if it is not a token account. */
  tokenOwner: string | null;
  mint: string | null;
  decimals: number | null;
} | null;

/**
 * An instruction a program invoked during a simulation, in the RPC's
 * `jsonParsed` format: parsed when the RPC knows the program, raw otherwise.
 */
export type SimulatedInstruction =
  | {
      programId: string;
      program: string;
      parsed: { type: string; info?: object };
    }
  | {
      programId: string;
      accounts: readonly string[];
      data: string;
    };

export type FeePaymentChainReader = {
  getAccounts(addresses: string[]): Promise<Record<string, AccountSnapshot>>;
  getRentExemptMinimum(space: number): Promise<bigint>;
  getTokenSymbol(mint: string): Promise<string | null>;
  /**
   * Simulates the transaction and returns every instruction invoked through
   * cross-program invocations, or `null` if the simulation fails.
   */
  simulateInnerInstructions(
    transaction: string,
  ): Promise<readonly SimulatedInstruction[] | null>;
};

type AnalyzeFeePaymentParams = {
  transaction: string;
  accountAddress: string;
  ownAddresses: string[];
  instructions: InstructionParseResult[];
  reader: FeePaymentChainReader;
};

/**
 * Returns the fee payer of a base64 encoded transaction or transaction message.
 * Solana always charges the network fee to the first account of the message.
 *
 * @param base64String - The base64 encoded transaction or transaction message.
 * @returns The fee payer address.
 */
export const getFeePayer = (base64String: string): string => {
  const bytes = getBase64Encoder().encode(base64String);
  const decoder = getCompiledTransactionMessageDecoder();

  let messageBytes: TransactionMessageBytes;
  try {
    ({ messageBytes } = getTransactionDecoder().decode(bytes));
  } catch {
    messageBytes = bytes as TransactionMessageBytes;
  }

  const feePayer = decoder.decode(messageBytes).staticAccounts[0];
  if (!feePayer) {
    throw new Error('Transaction has no fee payer');
  }
  return feePayer;
};

const accountAddressOf = (
  instruction: InstructionParseResult,
  name: string,
): string | null => instruction.parsed?.accounts?.[name]?.address ?? null;

/**
 * `parseInstruction` keeps the instruction accounts, but `EncodedInstruction`
 * leaves them out of its type so the confirmation context stays serializable.
 *
 * @param instruction - The parsed instruction.
 * @returns The accounts of the instruction.
 */
const accountsOf = (
  instruction: InstructionParseResult,
): readonly { address: string; role: AccountRole }[] =>
  (
    instruction.encoded as {
      accounts?: readonly { address: string; role: AccountRole }[];
    }
  ).accounts ?? [];

const isSignedBy = (
  instruction: InstructionParseResult,
  address: string,
): boolean =>
  accountsOf(instruction).some(
    (account) =>
      account.address === address &&
      (account.role === AccountRole.READONLY_SIGNER ||
        account.role === AccountRole.WRITABLE_SIGNER),
  );

const references = (
  instruction: InstructionParseResult,
  address: string,
): boolean =>
  accountsOf(instruction).some((account) => account.address === address);

type TokenTransfer = {
  destination: string;
  amount: bigint;
  mint: string | null;
  decimals: number | null;
};

type SimulatedInfo = {
  source?: string;
  destination?: string;
  lamports?: bigint | number | string;
  account?: string;
  owner?: string;
  wallet?: string;
  mint?: string;
  authority?: string;
  multisigAuthority?: string;
  amount?: bigint | number | string;
  tokenAmount?: { amount: string; decimals: number };
};

const SIMULATED_TOKEN_PROGRAMS = new Set(['spl-token', 'spl-token-2022']);

const SIMULATED_TOKEN_ACCOUNT_INITIALIZATION_TYPES = new Set([
  'initializeAccount',
  'initializeAccount2',
  'initializeAccount3',
]);

const SIMULATED_TOKEN_TRANSFER_TYPES = new Set([
  'transfer',
  'transferChecked',
  'transferCheckedWithFee',
]);

/**
 * Works out who pays for a transaction and, when someone else pays the
 * network fee, whether the user still pays anything.
 *
 * Only the System program can debit the user's SOL and only the token
 * programs can move the user's tokens. So the transaction is simulated, and
 * the System and token instructions it runs, top-level or invoked by other
 * programs, are inspected. Without a simulation, only top-level instructions
 * are inspected, and instructions of other programs the user signs make the
 * result `unverified` instead of `free`.
 *
 * @param params - The analysis parameters.
 * @param params.transaction - The base64 encoded transaction.
 * @param params.accountAddress - The account confirming the transaction.
 * @param params.ownAddresses - All the accounts of this wallet.
 * @param params.instructions - The parsed top-level instructions.
 * @param params.reader - Reads the on-chain state the analysis depends on.
 * @returns The fee payment analysis.
 */
export const analyzeFeePayment = async ({
  transaction,
  accountAddress,
  ownAddresses,
  instructions,
  reader,
}: AnalyzeFeePaymentParams): Promise<FeePayment> => {
  const feePayer = getFeePayer(transaction);

  if (feePayer === accountAddress) {
    return {
      feePayer,
      paidBy: 'account',
      userCost: null,
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    };
  }

  if (ownAddresses.includes(feePayer)) {
    return {
      feePayer,
      paidBy: 'ownAccount',
      userCost: null,
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    };
  }

  const innerInstructions = await reader.simulateInnerInstructions(transaction);
  const simulated = innerInstructions !== null;

  let unverified = false;
  const uncheckedPrograms = new Set<string>();
  let rentLamports = 0n;
  let solToSponsorLamports = 0n;

  // Token accounts created by this transaction, by address.
  const createdTokenAccounts = new Map<
    string,
    { owner: string; mint: string }
  >();
  // Associated token accounts whose rent the user pays, when not simulated.
  const rentPaidAssociatedTokenAccounts: {
    ata: string;
    idempotent: boolean;
    tokenProgram: string;
  }[] = [];
  const tokenTransfers: TokenTransfer[] = [];

  for (const instruction of instructions) {
    const { type, parsed } = instruction;
    const userSigns = isSignedBy(instruction, accountAddress);

    if (!parsed) {
      // A program we cannot decode can move the user's funds if the user
      // signs it. The simulation shows what it does through the System and
      // token programs.
      if (userSigns && !simulated) {
        uncheckedPrograms.add(instruction.encoded.programAddress);
      }
      continue;
    }

    if (type === 'TransferSol') {
      if (
        accountAddressOf(instruction, 'source') === accountAddress &&
        accountAddressOf(instruction, 'destination') === feePayer
      ) {
        solToSponsorLamports += BigInt(parsed.data.amount);
      }
    } else if (ACCOUNT_CREATION_TYPES.has(type)) {
      if (accountAddressOf(instruction, 'payer') === accountAddress) {
        rentLamports += BigInt(parsed.data.lamports);
      }
    } else if (ASSOCIATED_TOKEN_ACCOUNT_CREATION_TYPES.has(type)) {
      const ata = accountAddressOf(instruction, 'ata');
      const owner = accountAddressOf(instruction, 'owner');
      const mint = accountAddressOf(instruction, 'mint');
      const tokenProgram = accountAddressOf(instruction, 'tokenProgram');
      if (ata && owner && mint && tokenProgram) {
        createdTokenAccounts.set(ata, { owner, mint });
        // When simulated, the rent shows up as an invoked `createAccount`.
        if (
          !simulated &&
          accountAddressOf(instruction, 'payer') === accountAddress
        ) {
          rentPaidAssociatedTokenAccounts.push({
            ata,
            tokenProgram,
            idempotent: type === 'CreateAssociatedTokenIdempotent',
          });
        }
      } else if (userSigns) {
        unverified = true;
      }
    } else if (TOKEN_TRANSFER_TYPES.has(type)) {
      const destination = accountAddressOf(instruction, 'destination');
      if (
        destination &&
        accountAddressOf(instruction, 'authority') === accountAddress
      ) {
        tokenTransfers.push({
          destination,
          amount: BigInt(parsed.data.amount),
          mint: accountAddressOf(instruction, 'mint'),
          decimals: parsed.data.decimals ?? null,
        });
      }
    } else if (references(instruction, feePayer) && userSigns) {
      // Any other instruction signed by the user that involves the sponsor,
      // for example an approval that lets the sponsor spend the user's tokens.
      unverified = true;
    }
  }

  for (const innerInstruction of innerInstructions ?? []) {
    const { program, parsed } = innerInstruction as Partial<{
      program: string;
      parsed: { type: string; info?: object };
    }>;

    if (!program || !parsed) {
      // Programs the RPC cannot parse cannot debit the user's wallet or
      // token accounts themselves; they go through the System or token programs.
      continue;
    }

    const info = (parsed.info ?? {}) as SimulatedInfo;

    if (program === 'system') {
      if (
        (parsed.type === 'createAccount' ||
          parsed.type === 'createAccountWithSeed') &&
        info.source === accountAddress
      ) {
        rentLamports += BigInt(info.lamports ?? 0);
      } else if (
        (parsed.type === 'transfer' || parsed.type === 'transferWithSeed') &&
        info.source === accountAddress &&
        info.destination === feePayer
      ) {
        solToSponsorLamports += BigInt(info.lamports ?? 0);
      }
    } else if (program === 'spl-associated-token-account') {
      if (info.account && info.wallet && info.mint) {
        createdTokenAccounts.set(info.account, {
          owner: info.wallet,
          mint: info.mint,
        });
      }
    } else if (SIMULATED_TOKEN_PROGRAMS.has(program)) {
      const authority = info.authority ?? info.multisigAuthority;

      if (SIMULATED_TOKEN_ACCOUNT_INITIALIZATION_TYPES.has(parsed.type)) {
        if (info.account && info.owner && info.mint) {
          createdTokenAccounts.set(info.account, {
            owner: info.owner,
            mint: info.mint,
          });
        }
      } else if (SIMULATED_TOKEN_TRANSFER_TYPES.has(parsed.type)) {
        if (authority === accountAddress && info.destination) {
          tokenTransfers.push({
            destination: info.destination,
            amount: BigInt(info.tokenAmount?.amount ?? info.amount ?? 0),
            mint: info.mint ?? null,
            decimals: info.tokenAmount?.decimals ?? null,
          });
        }
      } else {
        const values = Object.values(info);
        if (values.includes(accountAddress) && values.includes(feePayer)) {
          // For example, an approval or a close that benefits the sponsor.
          unverified = true;
        }
      }
    }
  }

  const lookups = [
    ...rentPaidAssociatedTokenAccounts.map(({ ata }) => ata),
    ...tokenTransfers
      .map(({ destination }) => destination)
      .filter((destination) => !createdTokenAccounts.has(destination)),
  ];
  const accounts = lookups.length > 0 ? await reader.getAccounts(lookups) : {};

  for (const {
    ata,
    idempotent,
    tokenProgram,
  } of rentPaidAssociatedTokenAccounts) {
    if (idempotent && accounts[ata]) {
      // The account already exists, so the instruction does nothing.
      continue;
    }
    rentLamports += await reader.getRentExemptMinimum(
      tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
        ? TOKEN_2022_ASSOCIATED_TOKEN_ACCOUNT_SPACE
        : TOKEN_ACCOUNT_SPACE,
    );
  }

  const tokenCharges = new Map<string, { amount: bigint; decimals: number }>();
  for (const tokenTransfer of tokenTransfers) {
    const created = createdTokenAccounts.get(tokenTransfer.destination);
    const snapshot = accounts[tokenTransfer.destination];
    const owner = created?.owner ?? snapshot?.tokenOwner ?? null;

    if (owner !== feePayer) {
      continue;
    }

    const mint = tokenTransfer.mint ?? created?.mint ?? snapshot?.mint ?? null;
    const decimals = tokenTransfer.decimals ?? snapshot?.decimals ?? null;

    if (mint === null || decimals === null) {
      // We know the user pays the sponsor, but not how much.
      unverified = true;
      continue;
    }

    const previous = tokenCharges.get(mint)?.amount ?? 0n;
    tokenCharges.set(mint, {
      amount: previous + tokenTransfer.amount,
      decimals,
    });
  }

  const userCosts: UserFeeCost[] = [];
  if (rentLamports > 0n) {
    userCosts.push({ type: 'rent', lamports: rentLamports.toString() });
  }
  if (solToSponsorLamports > 0n) {
    userCosts.push({
      type: 'solToSponsor',
      lamports: solToSponsorLamports.toString(),
    });
  }
  for (const [mint, { amount, decimals }] of tokenCharges) {
    userCosts.push({
      type: 'tokenToSponsor',
      mint,
      amount: amount.toString(),
      decimals,
      symbol: await reader.getTokenSymbol(mint),
    });
  }

  const mayCostMore = unverified || uncheckedPrograms.size > 0;

  let userCost: FeePayment['userCost'] = 'free';
  if (userCosts.length > 0) {
    userCost = 'costs';
  } else if (mayCostMore) {
    userCost = 'unverified';
  }

  return {
    feePayer,
    paidBy: 'sponsor',
    userCost,
    userCosts,
    mayCostMore,
    uncheckedPrograms: [...uncheckedPrograms],
  };
};
