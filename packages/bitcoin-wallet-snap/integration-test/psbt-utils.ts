/* eslint-disable no-restricted-globals */

export type TemplateOutput = { scriptHex: string; value: number };

const PSBT_MAGIC = '70736274ff';
const GLOBAL_UNSIGNED_TX = '0100';

const varInt = (value: number): Buffer => {
  if (value < 0xfd) {
    return Buffer.from([value]);
  }
  const buffer = Buffer.alloc(3);
  buffer.writeUInt8(0xfd, 0);
  buffer.writeUInt16LE(value, 1);
  return buffer;
};

const uInt32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

const uInt64 = (value: number): Buffer => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
};

/**
 * Builds a base64 PSBT holding only outputs, the shape bridge and swap providers
 * return: no inputs, no change, for the wallet to fill.
 *
 * @param outputs - The outputs to place, in order.
 * @returns The base64 encoded PSBT.
 */
export const buildTemplatePsbt = (outputs: TemplateOutput[]): string => {
  const unsignedTx = Buffer.concat([
    uInt32(2),
    varInt(0),
    varInt(outputs.length),
    ...outputs.flatMap((output) => {
      const script = Buffer.from(output.scriptHex, 'hex');
      return [uInt64(output.value), varInt(script.length), script];
    }),
    uInt32(0),
  ]);

  return Buffer.concat([
    Buffer.from(PSBT_MAGIC, 'hex'),
    Buffer.from(GLOBAL_UNSIGNED_TX, 'hex'),
    varInt(unsignedTx.length),
    unsignedTx,
    Buffer.from([0x00]),
    ...outputs.map(() => Buffer.from([0x00])),
  ]).toString('base64');
};

/**
 * Reads the outputs of a PSBT's unsigned transaction, in transaction order.
 *
 * @param psbtBase64 - The base64 encoded PSBT.
 * @returns The outputs, in the order they appear in the transaction.
 */
export const readOutputs = (psbtBase64: string): TemplateOutput[] => {
  const psbt = Buffer.from(psbtBase64, 'base64');
  let offset = PSBT_MAGIC.length / 2;

  const readVarInt = (): number => {
    const first = psbt.readUInt8(offset);
    offset += 1;
    if (first < 0xfd) {
      return first;
    }
    if (first === 0xfd) {
      const value = psbt.readUInt16LE(offset);
      offset += 2;
      return value;
    }
    const value = psbt.readUInt32LE(offset);
    offset += 4;
    return value;
  };

  // global map: find the unsigned transaction record
  for (;;) {
    const keyLength = readVarInt();
    if (keyLength === 0) {
      throw new Error('PSBT has no unsigned transaction');
    }
    const keyType = psbt.readUInt8(offset);
    offset += keyLength;
    const valueLength = readVarInt();
    if (keyType === 0x00) {
      break;
    }
    offset += valueLength;
  }

  offset += 4; // version
  const inputCount = readVarInt();
  for (let index = 0; index < inputCount; index++) {
    offset += 36; // previous outpoint
    const scriptSigLength = readVarInt();
    offset += scriptSigLength;
    offset += 4; // sequence
  }

  const outputCount = readVarInt();
  const outputs: TemplateOutput[] = [];
  for (let index = 0; index < outputCount; index++) {
    const value = Number(psbt.readBigUInt64LE(offset));
    offset += 8;
    const scriptLength = readVarInt();
    outputs.push({
      scriptHex: psbt.subarray(offset, offset + scriptLength).toString('hex'),
      value,
    });
    offset += scriptLength;
  }

  return outputs;
};
