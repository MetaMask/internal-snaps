import { deserialize } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Address, Box, Link, Section, Text } from '@metamask/snaps-sdk/jsx';
import type { Json } from '@metamask/utils';
import { isAddress } from '@solana/kit';
import { BigNumber } from 'bignumber.js';

import type { Network } from '../../../../core/constants/solana';
import { addressToCaip10 } from '../../../../core/utils/addressToCaip10';
import { getSolanaExplorerUrl } from '../../../../core/utils/getSolanaExplorerUrl';
import type { Locale } from '../../../../core/utils/i18n';
import { i18n } from '../../../../core/utils/i18n';
import type { InstructionParseResult } from '../../../../entities';
import { truncateInstructionData } from '../../../../entities';

type InstructionProps = {
  instruction: InstructionParseResult;
  scope: Network;
  locale: Locale;
};

/**
 * Format the instruction type to a human readable string,
 * by splitting a PascalCase string into words,
 * and capitalizing the first letter of each word.
 *
 * @example
 * ```ts
 * formatInstructionType('InitializeMint') // 'Initialize Mint'
 * ```
 * @param type - The instruction type.
 * @returns The formatted instruction type.
 */
const fromPascalCaseToCapitalizedWords = (type: string): string => {
  return type
    .replace(/([A-Z])/gu, ' $1')
    .trim()
    .replace(/^./u, (str) => str.toUpperCase());
};

/**
 * Deserializes a value from the parsed instruction data and formats it for
 * display.
 *
 * @param value - The value to format.
 * @returns The value as a string, or an empty string when it has no value.
 */
const formatDataValue = (value: Json): string => {
  const deserialized = deserialize(value);

  if (deserialized === null || deserialized === undefined) {
    return '';
  }

  if (
    typeof deserialized === 'string' ||
    typeof deserialized === 'number' ||
    typeof deserialized === 'boolean' ||
    typeof deserialized === 'bigint'
  ) {
    return deserialized.toString();
  }

  // `BigNumber` and `Uint8Array` carry their own textual representation.
  return deserialized instanceof BigNumber || deserialized instanceof Uint8Array
    ? deserialized.toString()
    : (JSON.stringify(deserialized) ?? '');
};

const LinkToExplorer = ({
  address,
  scope,
}: {
  address: string;
  scope: Network;
}): ComponentOrElement => (
  <Link href={getSolanaExplorerUrl(scope, 'address', address)}>
    <Address
      avatar={false}
      address={addressToCaip10(scope, address)}
      truncate
    />
  </Link>
);

export const Instruction = ({
  instruction,
  scope,
  locale,
}: InstructionProps): ComponentOrElement => {
  const translate = i18n(locale);
  const { type, encoded, parsed } = instruction;
  const { programAddress, dataBase58 } = encoded;
  const isParseSuccess = parsed !== null;
  const typeFormatted = fromPascalCaseToCapitalizedWords(type);

  return (
    <Section alignment="start">
      <Text color="alternative" fontWeight="bold">
        {typeFormatted}
      </Text>
      <Box alignment="space-between" direction="horizontal">
        <Text color="alternative" alignment="start">
          {translate('confirmation.advanced.programId')}
        </Text>
        <LinkToExplorer address={programAddress} scope={scope} />
      </Box>
      {isParseSuccess &&
        Object.entries(parsed.accounts ?? {}).map(([key, value]) => (
          <Box alignment="space-between" direction="horizontal">
            <Text color="alternative">
              {fromPascalCaseToCapitalizedWords(key)}
            </Text>
            {isAddress(value.address) ? (
              <LinkToExplorer address={value.address} scope={scope} />
            ) : (
              <Text>{formatDataValue(value.address)}</Text>
            )}
          </Box>
        ))}
      {isParseSuccess &&
        Object.entries<Json>(parsed.data).map(([key, value]) => (
          <Box alignment="space-between" direction="horizontal">
            <Text color="alternative">
              {fromPascalCaseToCapitalizedWords(key)}
            </Text>
            {typeof value === 'string' && isAddress(value) ? (
              <LinkToExplorer address={value} scope={scope} />
            ) : (
              <Text>{formatDataValue(value)}</Text>
            )}
          </Box>
        ))}
      {!isParseSuccess && (
        <Box alignment="space-between" direction="horizontal">
          <Text color="alternative">
            {translate('confirmation.advanced.data')}
          </Text>
          <Text>{truncateInstructionData(dataBase58)}</Text>
        </Box>
      )}
    </Section>
  );
};
