import { getBase58Encoder } from '@solana/kit';

import type { InstructionParseResult } from '../../../entities';

/**
 * CoW Protocol settlement program deployments (production and staging), from
 * `SOLANA_SETTLEMENT_PROGRAM_ID` and `SOLANA_SETTLEMENT_PROGRAM_ID_STAGING`
 * in `@cowprotocol/sdk-config`. A breaking release deploys the program to a
 * new address, which has to be added here.
 *
 * @see https://github.com/cowprotocol/solana-programs
 */
export const COW_SETTLEMENT_PROGRAM_ADDRESSES = new Set([
  'Moook87DzJ25dELx3LXJ3dnu5a4ERVFwKo1PWWF4p7Y',
  'EzHqcdJssenE2R8xogJ8wpL66PRQet9M6ubpsX4QxpPb',
]);

const COW_CREATE_ORDER_DISCRIMINATOR = 2;

/** Size in bytes of a CoW order account (`cow_settlement_interface::data::order::SIZE`). */
export const COW_ORDER_ACCOUNT_SPACE = 264;

/**
 * What an instruction of a known program can cost.
 * `rentPayer` funds a new account of `rentSpace` bytes, at most its
 * rent-exempt minimum.
 */
export type KnownProgramCost = {
  rentPayer: string;
  rentSpace: number;
};

/**
 * Describes what an instruction of a program this wallet cannot parse, but
 * whose behavior is known, can cost its signers.
 *
 * CoW `CreateOrder` (`[owner (S), created_by (W,S), order_pda (W), system_program]`)
 * only creates the order account, funded by `created_by`. `owner` signs
 * read-only, so the program cannot debit it, and the program never invokes the
 * token program, so it cannot move the owner's tokens.
 *
 * @param instruction - An instruction that could not be parsed.
 * @param accounts - The accounts of the instruction.
 * @returns The cost of the instruction, or `null` if its behavior is unknown.
 */
export const getKnownProgramCost = (
  instruction: InstructionParseResult,
  accounts: readonly { address: string }[],
): KnownProgramCost | null => {
  const { programAddress, dataBase58 } = instruction.encoded;

  if (!COW_SETTLEMENT_PROGRAM_ADDRESSES.has(programAddress)) {
    return null;
  }

  const data = getBase58Encoder().encode(dataBase58);
  const createdBy = accounts[1]?.address;

  if (data[0] !== COW_CREATE_ORDER_DISCRIMINATOR || !createdBy) {
    return null;
  }

  return { rentPayer: createdBy, rentSpace: COW_ORDER_ACCOUNT_SPACE };
};
