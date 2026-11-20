import type {
  Messages,
  SignMessageConfirmationContext,
} from '../../../entities';
import { SignMessageConfirmationView } from './SignMessageConfirmationView';

const messages: Messages = {
  'confirmation.signMessage.title': { message: 'Sign Message' },
  'confirmation.signMessage.message': { message: 'Message' },
  'confirmation.signMessage.confirmButton': { message: 'Sign' },
  'confirmation.origin': { message: 'Origin' },
  'confirmation.origin.tooltip': { message: 'The dApp asking' },
  'confirmation.account': { message: 'Account' },
  cancel: { message: 'Cancel' },
};

const contextWith = (
  overrides: Partial<SignMessageConfirmationContext> = {},
): SignMessageConfirmationContext => ({
  message: 'hello world',
  account: {
    id: 'account-id',
    address: 'bc1qaccountaddress',
  },
  network: 'bitcoin',
  origin: 'https://dapp.example',
  ...overrides,
});

const render = (context: SignMessageConfirmationContext): string =>
  JSON.stringify(SignMessageConfirmationView({ context, messages }));

describe('SignMessageConfirmationView', () => {
  it('renders the message, its origin and the account address', () => {
    const serialized = render(contextWith());

    expect(serialized).toContain('Sign Message');
    expect(serialized).toContain('hello world');
    expect(serialized).toContain('dapp.example');
    expect(serialized).toContain('The dApp asking');
    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qaccountaddress',
    );
  });

  it('omits the origin row when there is no origin', () => {
    const serialized = render(contextWith({ origin: '' }));

    expect(serialized).toContain('hello world');
    expect(serialized).not.toContain('Origin');
    expect(serialized).not.toContain('dapp.example');
  });
});
