import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { AccountRole, getCompiledTransactionMessageDecoder } from '@solana/kit';

import { fromUnknownBase64StringToTransaction } from '../../../core/sdk-extensions/codecs';
import type {
  InstructionParseResult,
  InstructionParseSuccess,
} from '../../../entities';

/**
 * Size in bytes of an SPL Token account. Token-2022 associated token accounts
 * also carry the account type byte and the ImmutableOwner extension.
 */
const TOKEN_ACCOUNT_SPACE = 165;
const TOKEN_2022_ASSOCIATED_TOKEN_ACCOUNT_SPACE = 170;

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
 * The `info` object of an instruction a program invoked during a simulation,
 * in the RPC's `jsonParsed` format. Which fields are set depends on the
 * instruction type.
 */
export type SimulatedInfo = {
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

/**
 * An instruction a program invoked during a simulation that the RPC could
 * parse, in its `jsonParsed` format.
 */
export type ParsedSimulatedInstruction = {
  programId: string;
  program: string;
  parsed: { type: string; info?: SimulatedInfo };
};

/**
 * An instruction a program invoked during a simulation, in the RPC's
 * `jsonParsed` format: parsed when the RPC knows the program, raw otherwise.
 */
export type SimulatedInstruction =
  | ParsedSimulatedInstruction
  | {
      programId: string;
      accounts: readonly string[];
      data: string;
      parsed?: undefined;
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
  instructions: InstructionParseResult[] | null;
  reader: FeePaymentChainReader;
};

/**
 * Returns the fee payer of a base64 encoded transaction or transaction message.
 * Solana always charges the network fee to the first account of the message.
 *
 * @param base64String - The base64 encoded transaction or transaction message.
 * @returns The fee payer address.
 */
export const getFeePayer = async (base64String: string): Promise<string> => {
  const { messageBytes } =
    await fromUnknownBase64StringToTransaction(base64String);

  const feePayer =
    getCompiledTransactionMessageDecoder().decode(messageBytes)
      .staticAccounts[0];
  if (!feePayer) {
    throw new Error('Transaction has no fee payer');
  }
  return feePayer;
};

const accountAddressOf = (
  instruction: InstructionParseResult,
  name: string,
): string | null => instruction.parsed?.accounts?.[name]?.address ?? null;

const accountsOf = (
  instruction: InstructionParseResult,
): readonly { address: string; role: AccountRole }[] =>
  instruction.encoded.accounts ?? [];

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

/**
 * The costs and risks the analysis finds in a transaction's instructions, in
 * the raw form the instructions report them.
 */
type Sponsorship = {
  /** Rent for accounts the transaction creates with the user's SOL, in lamports. */
  rentLamports: bigint;
  /** SOL the transaction sends from the user to the fee payer, in lamports. */
  solToSponsorLamports: bigint;
  /** Token transfers out of the user's accounts, top-level or invoked. */
  tokenTransfers: TokenTransfer[];
  /** Token accounts the transaction creates, by address. */
  createdTokenAccounts: Map<string, { owner: string; mint: string }>;
  /**
   * Associated token accounts whose rent the user pays, tracked only when the
   * transaction could not be simulated: the simulation reports their rent as
   * invoked `createAccount` instructions instead.
   */
  rentPaidTokenAccounts: {
    ata: string;
    idempotent: boolean;
    tokenProgram: string;
  }[];
  /**
   * Whether the user signs an instruction this wallet cannot fully check, so
   * they may pay more than the costs found.
   */
  unverified: boolean;
  /** Programs of user-signed instructions this wallet cannot decode. */
  uncheckedPrograms: Set<string>;
};

/** What the instruction analyzers need to know about the transaction. */
type AnalysisContext = {
  /** The account confirming the transaction. */
  accountAddress: string;
  /** The account paying the network fee. */
  feePayer: string;
  /** Whether the transaction was simulated. */
  simulated: boolean;
};

type TopLevelAnalyzer = (
  instruction: InstructionParseSuccess,
  context: AnalysisContext,
  sponsorship: Sponsorship,
) => void;

const analyzeTransferSol: TopLevelAnalyzer = (
  instruction,
  { accountAddress, feePayer },
  sponsorship,
) => {
  if (
    accountAddressOf(instruction, 'source') === accountAddress &&
    accountAddressOf(instruction, 'destination') === feePayer
  ) {
    sponsorship.solToSponsorLamports += BigInt(instruction.parsed.data.amount);
  }
};

const analyzeAccountCreation: TopLevelAnalyzer = (
  instruction,
  { accountAddress },
  sponsorship,
) => {
  if (accountAddressOf(instruction, 'payer') === accountAddress) {
    sponsorship.rentLamports += BigInt(instruction.parsed.data.lamports);
  }
};

const analyzeAssociatedTokenAccountCreation: TopLevelAnalyzer = (
  instruction,
  { accountAddress, simulated },
  sponsorship,
) => {
  const ata = accountAddressOf(instruction, 'ata');
  const owner = accountAddressOf(instruction, 'owner');
  const mint = accountAddressOf(instruction, 'mint');
  const tokenProgram = accountAddressOf(instruction, 'tokenProgram');

  if (!ata || !owner || !mint || !tokenProgram) {
    // We cannot tell which account is created, so assume the user may pay.
    if (isSignedBy(instruction, accountAddress)) {
      sponsorship.unverified = true;
    }
    return;
  }

  sponsorship.createdTokenAccounts.set(ata, { owner, mint });
  // When simulated, the rent shows up as an invoked `createAccount`.
  if (!simulated && accountAddressOf(instruction, 'payer') === accountAddress) {
    sponsorship.rentPaidTokenAccounts.push({
      ata,
      tokenProgram,
      idempotent: instruction.type === 'CreateAssociatedTokenIdempotent',
    });
  }
};

const analyzeTokenTransfer: TopLevelAnalyzer = (
  instruction,
  { accountAddress },
  sponsorship,
) => {
  const destination = accountAddressOf(instruction, 'destination');
  if (
    !destination ||
    accountAddressOf(instruction, 'authority') !== accountAddress
  ) {
    return;
  }

  sponsorship.tokenTransfers.push({
    destination,
    amount: BigInt(instruction.parsed.data.amount),
    mint: accountAddressOf(instruction, 'mint'),
    decimals: instruction.parsed.data.decimals ?? null,
  });
};

/**
 * Analyzers for the top-level instructions that can charge the user, by
 * instruction type.
 */
const TOP_LEVEL_ANALYZERS: Record<string, TopLevelAnalyzer> = {
  TransferSol: analyzeTransferSol,
  CreateAccount: analyzeAccountCreation,
  CreateAccountWithSeed: analyzeAccountCreation,
  CreateAssociatedToken: analyzeAssociatedTokenAccountCreation,
  CreateAssociatedTokenIdempotent: analyzeAssociatedTokenAccountCreation,
  Transfer: analyzeTokenTransfer,
  TransferChecked: analyzeTokenTransfer,
  TransferCheckedWithFee: analyzeTokenTransfer,
};

/**
 * Analyzes one top-level instruction: a known one with its analyzer, any other
 * parsed one by what it lets the sponsor do, and a program this wallet cannot
 * decode by whether the simulation covers it.
 *
 * @param instruction - The parsed top-level instruction.
 * @param context - What the analysis depends on.
 * @param sponsorship - The costs and risks found so far.
 */
const analyzeTopLevelInstruction = (
  instruction: InstructionParseResult,
  context: AnalysisContext,
  sponsorship: Sponsorship,
): void => {
  if (!instruction.parsed) {
    // A program we cannot decode can move the user's funds if the user signs
    // it. The simulation shows what it does through the System and token
    // programs; without one, we cannot check what it does.
    if (!context.simulated && isSignedBy(instruction, context.accountAddress)) {
      sponsorship.uncheckedPrograms.add(instruction.encoded.programAddress);
    }
    return;
  }

  const analyzer = TOP_LEVEL_ANALYZERS[instruction.type];
  if (analyzer) {
    analyzer(instruction, context, sponsorship);
    return;
  }

  // Any other instruction signed by the user that involves the sponsor, for
  // example an approval that lets the sponsor spend the user's tokens.
  if (
    isSignedBy(instruction, context.accountAddress) &&
    references(instruction, context.feePayer)
  ) {
    sponsorship.unverified = true;
  }
};

const SIMULATED_ACCOUNT_CREATION_TYPES = new Set([
  'createAccount',
  'createAccountWithSeed',
]);

const SIMULATED_SOL_TRANSFER_TYPES = new Set(['transfer', 'transferWithSeed']);

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

type SimulatedAnalyzer = (
  instruction: ParsedSimulatedInstruction,
  context: AnalysisContext,
  sponsorship: Sponsorship,
) => void;

/**
 * Records a token account the transaction creates, so transfers to it can be
 * attributed to its owner. The associated-token-account program reports the
 * owner with a `wallet` field, the token programs with an `owner` field.
 *
 * @param instruction - The invoked instruction that creates the account.
 * @param sponsorship - The costs and risks found so far.
 */
const analyzeCreatedTokenAccount = (
  instruction: ParsedSimulatedInstruction,
  sponsorship: Sponsorship,
): void => {
  const info = instruction.parsed.info ?? {};
  const owner = info.owner ?? info.wallet;
  if (info.account && owner && info.mint) {
    sponsorship.createdTokenAccounts.set(info.account, {
      owner,
      mint: info.mint,
    });
  }
};

const analyzeSimulatedSystemInstruction: SimulatedAnalyzer = (
  { parsed },
  { accountAddress, feePayer },
  sponsorship,
) => {
  const info = parsed.info ?? {};

  if (SIMULATED_ACCOUNT_CREATION_TYPES.has(parsed.type)) {
    if (info.source === accountAddress) {
      sponsorship.rentLamports += BigInt(info.lamports ?? 0);
    }
    return;
  }

  if (SIMULATED_SOL_TRANSFER_TYPES.has(parsed.type)) {
    if (info.source === accountAddress && info.destination === feePayer) {
      sponsorship.solToSponsorLamports += BigInt(info.lamports ?? 0);
    }
    return;
  }

  // Any other System instruction that involves both the user and the sponsor,
  // for example a withdrawal from an account the user controls. The user is
  // not always the `source`, so we cannot tell what it costs them.
  const values = Object.values(info);
  if (values.includes(accountAddress) && values.includes(feePayer)) {
    sponsorship.unverified = true;
  }
};

const analyzeSimulatedTokenInstruction: SimulatedAnalyzer = (
  instruction,
  context,
  sponsorship,
) => {
  const { type } = instruction.parsed;
  const info = instruction.parsed.info ?? {};

  if (SIMULATED_TOKEN_ACCOUNT_INITIALIZATION_TYPES.has(type)) {
    analyzeCreatedTokenAccount(instruction, sponsorship);
    return;
  }

  if (SIMULATED_TOKEN_TRANSFER_TYPES.has(type)) {
    const authority = info.authority ?? info.multisigAuthority;
    if (authority === context.accountAddress && info.destination) {
      sponsorship.tokenTransfers.push({
        destination: info.destination,
        amount: BigInt(info.tokenAmount?.amount ?? info.amount ?? 0),
        mint: info.mint ?? null,
        decimals: info.tokenAmount?.decimals ?? null,
      });
    }
    return;
  }

  // Any other token instruction that involves both the user and the sponsor,
  // for example an approval or a close that benefits the sponsor.
  const values = Object.values(info);
  if (
    values.includes(context.accountAddress) &&
    values.includes(context.feePayer)
  ) {
    sponsorship.unverified = true;
  }
};

/**
 * Analyzers for the instructions a simulation runs, by program.
 */
const SIMULATED_INSTRUCTION_ANALYZERS: Record<string, SimulatedAnalyzer> = {
  system: analyzeSimulatedSystemInstruction,
  'spl-associated-token-account': (instruction, _context, sponsorship) =>
    analyzeCreatedTokenAccount(instruction, sponsorship),
  'spl-token': analyzeSimulatedTokenInstruction,
  'spl-token-2022': analyzeSimulatedTokenInstruction,
};

/**
 * Analyzes one instruction invoked during the simulation. Instructions the RPC
 * cannot parse are skipped: a program cannot debit the user's wallet or token
 * accounts itself, it goes through the System or token programs.
 *
 * @param instruction - The invoked instruction, parsed by the RPC.
 * @param context - What the analysis depends on.
 * @param sponsorship - The costs and risks found so far.
 */
const analyzeSimulatedInstruction = (
  instruction: SimulatedInstruction,
  context: AnalysisContext,
  sponsorship: Sponsorship,
): void => {
  if (!instruction.parsed) {
    return;
  }

  SIMULATED_INSTRUCTION_ANALYZERS[instruction.program]?.(
    instruction,
    context,
    sponsorship,
  );
};

/**
 * Resolves the costs found in the instructions into the amounts the user pays,
 * reading the on-chain state they depend on. Flags, in
 * `sponsorship.unverified`, the amounts it cannot resolve.
 *
 * @param sponsorship - The costs and risks found in the instructions.
 * @param context - What the analysis depends on.
 * @param reader - Reads the on-chain state the costs depend on.
 * @returns The costs the user pays.
 */
const resolveUserCosts = async (
  sponsorship: Sponsorship,
  context: AnalysisContext,
  reader: FeePaymentChainReader,
): Promise<UserFeeCost[]> => {
  const lookups = [
    ...sponsorship.rentPaidTokenAccounts.map(({ ata }) => ata),
    ...sponsorship.tokenTransfers
      .map(({ destination }) => destination)
      .filter(
        (destination) => !sponsorship.createdTokenAccounts.has(destination),
      ),
  ];
  const accounts = lookups.length > 0 ? await reader.getAccounts(lookups) : {};

  for (const {
    ata,
    idempotent,
    tokenProgram,
  } of sponsorship.rentPaidTokenAccounts) {
    // An idempotent creation of an account that already exists does nothing.
    if (idempotent && accounts[ata]) {
      continue;
    }
    const rentExemptMinimum = await reader.getRentExemptMinimum(
      tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
        ? TOKEN_2022_ASSOCIATED_TOKEN_ACCOUNT_SPACE
        : TOKEN_ACCOUNT_SPACE,
    );
    sponsorship.rentLamports += rentExemptMinimum;
  }

  const tokenCharges = new Map<string, { amount: bigint; decimals: number }>();
  for (const tokenTransfer of sponsorship.tokenTransfers) {
    const created = sponsorship.createdTokenAccounts.get(
      tokenTransfer.destination,
    );
    const snapshot = accounts[tokenTransfer.destination];

    if ((created?.owner ?? snapshot?.tokenOwner ?? null) !== context.feePayer) {
      continue;
    }

    const mint = tokenTransfer.mint ?? created?.mint ?? snapshot?.mint ?? null;
    const decimals = tokenTransfer.decimals ?? snapshot?.decimals ?? null;

    // We know the user pays the sponsor, but not how much.
    if (mint === null || decimals === null) {
      sponsorship.unverified = true;
      continue;
    }

    tokenCharges.set(mint, {
      amount: (tokenCharges.get(mint)?.amount ?? 0n) + tokenTransfer.amount,
      decimals,
    });
  }

  const userCosts: UserFeeCost[] = [];
  if (sponsorship.rentLamports > 0n) {
    userCosts.push({
      type: 'rent',
      lamports: sponsorship.rentLamports.toString(),
    });
  }
  if (sponsorship.solToSponsorLamports > 0n) {
    userCosts.push({
      type: 'solToSponsor',
      lamports: sponsorship.solToSponsorLamports.toString(),
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
  return userCosts;
};

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
 * @param params.instructions - The parsed top-level instructions, or `null`
 * when they could not be parsed, which makes a sponsored result `unverified`.
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
  const feePayer = await getFeePayer(transaction);

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
  const context: AnalysisContext = {
    accountAddress,
    feePayer,
    simulated: innerInstructions !== null,
  };
  const sponsorship: Sponsorship = {
    rentLamports: 0n,
    solToSponsorLamports: 0n,
    tokenTransfers: [],
    createdTokenAccounts: new Map(),
    rentPaidTokenAccounts: [],
    unverified: false,
    uncheckedPrograms: new Set(),
  };

  for (const instruction of instructions ?? []) {
    analyzeTopLevelInstruction(instruction, context, sponsorship);
  }

  // Without the instructions we cannot tell what the user pays.
  if (instructions === null) {
    sponsorship.unverified = true;
  }

  for (const instruction of innerInstructions ?? []) {
    analyzeSimulatedInstruction(instruction, context, sponsorship);
  }

  const userCosts = await resolveUserCosts(sponsorship, context, reader);
  const mayCostMore =
    sponsorship.unverified || sponsorship.uncheckedPrograms.size > 0;

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
    uncheckedPrograms: [...sponsorship.uncheckedPrograms],
  };
};
