import type { KeyringRequest } from '@metamask/keyring-api';
import type { Json } from '@metamask/snaps-sdk';
import { assert } from 'superstruct';

import type { ConfirmationRepository } from '../entities';
import {
  AccountCapability,
  AssertionError,
  InexistentMethodError,
  NotFoundError,
} from '../entities';
import type { AccountUseCases } from '../use-cases/AccountUseCases';
import { mapToUtxo } from './mappings';
import type { Utxo } from './mappings';
import { parsePsbt } from './parsers';
import {
  BroadcastPsbtRequest,
  ComputeFeeRequest,
  FillPsbtRequest,
  GetUtxoRequest,
  SendTransferRequest,
  SignMessageRequest,
  SignPsbtRequest,
} from './validation';

export type SignPsbtResponse = {
  psbt: string;
  txid: string | null;
  // Present only when broadcast happened. True if the source account's
  // address type allows third-party txid malleation before confirmation
  // (currently only legacy P2PKH).
  canBeMalleable?: boolean;
};

export type ComputeFeeResponse = {
  // Fee in satoshis
  fee: string;
};

export type BroadcastPsbtResponse = {
  txid: string;
  // True if the source account's address type allows third-party txid
  // malleation before confirmation (currently only legacy P2PKH).
  canBeMalleable: boolean;
};

export type FillPsbtResponse = {
  psbt: string;
};

export type SignMessageResponse = {
  signature: string;
};

export class KeyringRequestHandler {
  readonly #accountsUseCases: AccountUseCases;

  readonly #confirmationRepository: ConfirmationRepository;

  constructor(
    accounts: AccountUseCases,
    confirmationRepository: ConfirmationRepository,
  ) {
    this.#accountsUseCases = accounts;
    this.#confirmationRepository = confirmationRepository;
  }

  async route(request: KeyringRequest): Promise<Json> {
    const { account, request: requestData, origin } = request;
    const { method, params } = requestData;

    switch (method as AccountCapability) {
      case AccountCapability.SignPsbt: {
        assert(params, SignPsbtRequest);
        const { psbt, feeRate, options } = params;
        return this.#signPsbt(account, psbt, origin, options, feeRate);
      }
      case AccountCapability.FillPsbt: {
        assert(params, FillPsbtRequest);
        return this.#fillPsbt(account, params.psbt, params.feeRate);
      }
      case AccountCapability.ComputeFee: {
        assert(params, ComputeFeeRequest);
        return this.#computeFee(account, params.psbt, params.feeRate);
      }
      case AccountCapability.BroadcastPsbt: {
        assert(params, BroadcastPsbtRequest);
        return this.#broadcastPsbt(account, params.psbt, origin);
      }
      case AccountCapability.SendTransfer: {
        assert(params, SendTransferRequest);
        return this.#sendTransfer(
          account,
          params.recipients,
          origin,
          params.feeRate,
        );
      }
      case AccountCapability.GetUtxo: {
        assert(params, GetUtxoRequest);
        return this.#getUtxo(account, params.outpoint);
      }
      case AccountCapability.ListUtxos: {
        return this.#listUtxos(account);
      }
      case AccountCapability.PublicDescriptor: {
        return this.#publicDescriptor(account);
      }
      case AccountCapability.SignMessage: {
        assert(params, SignMessageRequest);
        return this.#signMessage(account, params.message, origin);
      }
      default: {
        throw new InexistentMethodError(
          'Unrecognized Bitcoin account capability',
          {
            account,
            method,
          },
        );
      }
    }
  }

  async #signPsbt(
    id: string,
    psbtBase64: string,
    origin: string,
    options: { fill: boolean; broadcast: boolean },
    feeRate?: number,
  ): Promise<SignPsbtResponse> {
    const account = await this.#accountsUseCases.get(id);

    const psbtBase64ToSign = options.fill
      ? (
          await this.#accountsUseCases.fillPsbt(
            id,
            parsePsbt(psbtBase64),
            feeRate,
          )
        ).toString()
      : psbtBase64;

    await this.#confirmationRepository.insertSignPsbt(
      account,
      parsePsbt(psbtBase64ToSign),
      origin,
      options,
    );

    const {
      psbt: signedPsbt,
      txid,
      canBeMalleable,
    } = await this.#accountsUseCases.signPsbt(
      id,
      parsePsbt(psbtBase64ToSign),
      origin,
      { ...options, fill: false },
      feeRate,
    );
    // Invariant: signPsbt sets txid and canBeMalleable together (when broadcast
    // happened) or neither (when it didn't). A txid without the flag would
    // leak a possibly-malleable txid to the consumer.
    if (txid !== undefined && canBeMalleable === undefined) {
      throw new AssertionError(
        'signPsbt returned txid without canBeMalleable flag',
      );
    }
    const response: SignPsbtResponse = {
      psbt: signedPsbt.toString(),
      txid: txid?.toString() ?? null,
    };
    if (canBeMalleable !== undefined) {
      response.canBeMalleable = canBeMalleable;
    }
    return response;
  }

  async #fillPsbt(
    id: string,
    psbtBase64: string,
    feeRate?: number,
  ): Promise<FillPsbtResponse> {
    const psbt = await this.#accountsUseCases.fillPsbt(
      id,
      parsePsbt(psbtBase64),
      feeRate,
    );
    return { psbt: psbt.toString() };
  }

  async #computeFee(
    id: string,
    psbtBase64: string,
    feeRate?: number,
  ): Promise<ComputeFeeResponse> {
    const fee = await this.#accountsUseCases.computeFee(
      id,
      parsePsbt(psbtBase64),
      feeRate,
    );
    return { fee: fee.to_sat().toString() };
  }

  async #broadcastPsbt(
    id: string,
    psbtBase64: string,
    origin: string,
  ): Promise<BroadcastPsbtResponse> {
    const { txid, canBeMalleable } = await this.#accountsUseCases.broadcastPsbt(
      id,
      parsePsbt(psbtBase64),
      origin,
    );
    return { txid: txid.toString(), canBeMalleable };
  }

  async #sendTransfer(
    id: string,
    recipients: { address: string; amount: string }[],
    origin: string,
    feeRate?: number,
  ): Promise<BroadcastPsbtResponse> {
    const { txid, canBeMalleable } = await this.#accountsUseCases.sendTransfer(
      id,
      recipients,
      origin,
      feeRate,
    );
    return { txid: txid.toString(), canBeMalleable };
  }

  async #getUtxo(id: string, outpoint: string): Promise<Utxo> {
    const account = await this.#accountsUseCases.get(id);
    const utxo = account.getUtxo(outpoint);
    if (!utxo) {
      throw new NotFoundError('UTXO not found', { id });
    }
    return mapToUtxo(utxo, account.network);
  }

  async #listUtxos(id: string): Promise<Utxo[]> {
    const account = await this.#accountsUseCases.get(id);
    return account
      .listUnspent()
      .map((utxo) => mapToUtxo(utxo, account.network));
  }

  async #publicDescriptor(id: string): Promise<string> {
    const account = await this.#accountsUseCases.get(id);
    return account.publicDescriptor;
  }

  async #signMessage(
    id: string,
    message: string,
    origin: string,
  ): Promise<SignMessageResponse> {
    const signature = await this.#accountsUseCases.signMessage(
      id,
      message,
      origin,
    );
    return { signature };
  }
}
