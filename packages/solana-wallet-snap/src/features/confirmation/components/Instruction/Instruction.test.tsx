import { address } from '@solana/kit';

import { Network } from '../../../../core/constants/solana';
import type { InstructionParseResult } from '../../../../entities';
import { Instruction } from './Instruction';

const PROGRAM_ADDRESS = '11111111111111111111111111111111';
const DATA_ADDRESS = '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg';

const instructionWith = (
  data: Record<string, unknown>,
  accounts: Record<string, { address: string; role: number }> = {},
): InstructionParseResult => ({
  type: 'TransferSol',
  encoded: {
    programAddress: address(PROGRAM_ADDRESS),
    dataBase58: '3tGNFMqHiozw',
  },
  parsed: { data, accounts },
});

const render = (instruction: InstructionParseResult): string =>
  JSON.stringify(
    Instruction({
      instruction,
      scope: Network.Mainnet,
      locale: 'en',
    }),
  );

describe('Instruction', () => {
  it('renders the formatted type and the program address', () => {
    const serialized = render(instructionWith({}));

    expect(serialized).toContain('Transfer Sol');
    expect(serialized).toContain(
      `https://solscan.io/address/${PROGRAM_ADDRESS}?cluster=mainnet`,
    );
  });

  it('links data values that are addresses', () => {
    const serialized = render(instructionWith({ destination: DATA_ADDRESS }));

    expect(serialized).toContain(
      `https://solscan.io/address/${DATA_ADDRESS}?cluster=mainnet`,
    );
  });

  it('renders scalar data values as text', () => {
    const serialized = render(
      instructionWith({
        memo: 'hello',
        amount: { __type: 'bigint', value: '1000' },
        decimals: 6,
        enabled: true,
      }),
    );

    expect(serialized).toContain('"children":"hello"');
    expect(serialized).toContain('"children":"1000"');
    expect(serialized).toContain('"children":"6"');
    expect(serialized).toContain('"children":"true"');
  });

  it('renders nested data values as JSON', () => {
    const serialized = render(instructionWith({ meta: { nested: 'value' } }));

    expect(serialized).toContain(
      JSON.stringify(JSON.stringify({ nested: 'value' })),
    );
  });

  it('renders values with their own textual representation', () => {
    const serialized = render(
      instructionWith({
        price: { __type: 'BigNumber', value: '1.5' },
        bytes: { __type: 'Uint8Array', value: btoa('\u0001\u0002') },
      }),
    );

    expect(serialized).toContain('"children":"1.5"');
    expect(serialized).toContain('"children":"1,2"');
  });

  it.each([
    ['null', null],
    ['undefined', { __type: 'undefined' }],
  ])('renders an empty value for a %s data value', (_label, value) => {
    const serialized = render(instructionWith({ missing: value }));

    expect(serialized).toContain('"children":""');
  });

  it('renders formatted account values that are not addresses', () => {
    const serialized = render(
      instructionWith(
        {},
        {
          destination: { address: 'not-an-address', role: 1 },
        },
      ),
    );

    expect(serialized).toContain('"children":"not-an-address"');
  });

  it('renders the truncated data of an instruction that cannot be parsed', () => {
    const serialized = JSON.stringify(
      Instruction({
        instruction: {
          type: 'Unknown',
          encoded: {
            programAddress: address(PROGRAM_ADDRESS),
            dataBase58: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          },
          parsed: null,
        },
        scope: Network.Mainnet,
        locale: 'en',
      }),
    );

    expect(serialized).toContain('"children":"5eykt...ZKvdp"');
  });
});
