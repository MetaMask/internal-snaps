import { FeeUnavailableError } from './errors';

describe('FeeUnavailableError', () => {
  it('is an Error with the expected name and message', () => {
    const error = new FeeUnavailableError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FeeUnavailableError);
    expect(error.name).toBe('FeeUnavailableError');
    expect(error.message).toBe(
      'Could not estimate Tron network fees: TronGrid is unavailable and no cached fee data is available.',
    );
  });

  it('can be thrown and caught as a typed error', () => {
    const thrower = (): never => {
      throw new FeeUnavailableError();
    };

    expect(thrower).toThrow(FeeUnavailableError);
    expect(thrower).toThrow('Could not estimate Tron network fees');
  });
});
