/**
 * Derive Stellar secret seeds (S…) and public keys (G…) from an SRP the same
 * way the Stellar snap does: SLIP-10 ed25519 at m/44'/148'/index'.
 *
 *   STELLAR_SRP="word1 … word12/24" node scripts/export-stellar-keys-from-srp.js
 *   STELLAR_SRP="…" node scripts/export-stellar-keys-from-srp.js --indices 0,1
 *
 * Optional:
 *   STELLAR_SRP          BIP-39 mnemonic (preferred over typing it as an argv)
 *   STELLAR_ACCOUNT_INDICES   comma-separated, default 0,1
 *
 * Prints STELLAR_SECRET_1 / STELLAR_SECRET_2 lines you can paste into .env
 * for test-live-complex-transaction.js. Do not commit those values.
 */

import { SLIP10Node } from '@metamask/key-tree';
import { Keypair } from '@stellar/stellar-sdk';
import { createInterface } from 'node:readline/promises';

const DEFAULT_INDICES = [0, 1];

function parseIndices() {
  const flagIndex = process.argv.indexOf('--indices');
  const fromFlag = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  const raw = fromFlag ?? process.env.STELLAR_ACCOUNT_INDICES ?? '';
  if (!raw.trim()) {
    return DEFAULT_INDICES;
  }
  return raw.split(',').map((part) => {
    const index = Number(part.trim());
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid account index: ${part}`);
    }
    return index;
  });
}

async function readMnemonic() {
  const fromEnv = process.env.STELLAR_SRP?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\s+/gu, ' ');
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const typed = await rl.question(
    'Paste SRP (spaces between words; input is not saved): ',
  );
  rl.close();
  const mnemonic = typed.trim().replace(/\s+/gu, ' ');
  if (!mnemonic) {
    throw new Error('Missing SRP. Set STELLAR_SRP or paste it when prompted.');
  }
  return mnemonic;
}

async function deriveAtIndex(mnemonic, index) {
  const node = await SLIP10Node.fromDerivationPath({
    curve: 'ed25519',
    derivationPath: [
      `bip39:${mnemonic}`,
      `slip10:44'`,
      `slip10:148'`,
      `slip10:${index}'`,
    ],
  });
  if (!node.privateKey) {
    throw new Error(`No private key at m/44'/148'/${index}'`);
  }
  const privateKeyHex = node.privateKey.replace(/^0x/iu, '');
  const seed = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
  return Keypair.fromRawEd25519Seed(seed);
}

async function main() {
  const indices = parseIndices();
  const mnemonic = await readMnemonic();
  const wordCount = mnemonic.split(' ').length;
  if (
    wordCount !== 12 &&
    wordCount !== 15 &&
    wordCount !== 18 &&
    wordCount !== 21 &&
    wordCount !== 24
  ) {
    throw new Error(
      `Unexpected SRP length (${wordCount} words). Expected 12–24.`,
    );
  }

  console.log(
    `Deriving snap path m/44'/148'/<index>' (ed25519) for indices: ${indices.join(', ')}`,
  );
  console.log('');

  const envLines = [];
  for (const [ordinal, index] of indices.entries()) {
    const keypair = await deriveAtIndex(mnemonic, index);
    const slot = ordinal + 1;
    console.log(`Account ${slot}  index ${index}  m/44'/148'/${index}'`);
    console.log(`  public  ${keypair.publicKey()}`);
    console.log(`  secret  ${keypair.secret()}`);
    console.log('');
    envLines.push(`STELLAR_SECRET_${slot}=${keypair.secret()}`);
  }

  console.log('Paste into packages/stellar-wallet-snap/.env:');
  for (const line of envLines) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
