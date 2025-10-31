import type { EntropySourceId, MetaMaskOptions } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';

export type CreateAccountOptions = {
  entropySource?: EntropySourceId;
  index?: number;
  [key: string]: Json | undefined;
} & MetaMaskOptions;
