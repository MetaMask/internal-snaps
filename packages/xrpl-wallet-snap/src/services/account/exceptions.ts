import type { XrplSnapExceptionOptions } from '../../utils';
import { XrplSnapException } from '../../utils';

export class AccountServiceException extends XrplSnapException {}

export class AccountNotFoundException extends AccountServiceException {
  constructor(addressOrId: string, options?: XrplSnapExceptionOptions) {
    super(`Account not found for address or id: ${addressOrId}`, options);
  }
}

export class DerivedAccountAddressMismatchException extends AccountServiceException {
  constructor(address: string, options?: XrplSnapExceptionOptions) {
    super(
      `Derived account address does not match the provided address: ${address}`,
      options,
    );
  }
}
