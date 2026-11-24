import { assertJSXElement } from '@metamask/snaps-sdk/jsx';

import { PaymentReferenceScreen } from './PaymentReferenceScreen';

const labels = {
  title: 'Destination tag',
  description:
    'Some accounts require a destination tag. Without it, your transfer may be delayed or lost.',
  inputTitle: 'Destination tag',
  inputPlaceholder: 'Enter destination tag',
  save: 'Save',
  back: 'Back',
};

const formNames = {
  Form: 'payment-reference-edit-form',
  Input: 'payment-reference-edit-input',
  Back: 'payment-reference-edit-back',
  Save: 'payment-reference-edit-save',
};

const render = (
  props: Partial<Parameters<typeof PaymentReferenceScreen>[0]> = {},
): string =>
  JSON.stringify(
    PaymentReferenceScreen({
      labels,
      formNames,
      ...props,
    }),
  );

describe('PaymentReferenceScreen', () => {
  it('passes the Snap runtime UI schema', () => {
    expect(() =>
      assertJSXElement(
        PaymentReferenceScreen({
          labels,
          formNames,
          paymentReference: '4242',
        }),
      ),
    ).not.toThrow();
  });

  it('renders the title, description, and form field labels', () => {
    const serialized = render({ paymentReference: '4242' });

    expect(serialized).toContain(labels.title);
    expect(serialized).toContain(labels.description);
    expect(serialized).toContain(labels.inputTitle);
    expect(serialized).toContain(labels.inputPlaceholder);
    expect(serialized).toContain(labels.save);
    expect(serialized).toContain(labels.back);
  });

  it('wires form element names for input, back, and submit', () => {
    const serialized = render({ paymentReference: '99' });

    expect(serialized).toContain(`"name":"${formNames.Form}"`);
    expect(serialized).toContain(`"name":"${formNames.Input}"`);
    expect(serialized).toContain(`"name":"${formNames.Back}"`);
    expect(serialized).toContain(`"name":"${formNames.Save}"`);
    expect(serialized).toContain(`"form":"${formNames.Form}"`);
    expect(serialized).toContain('"type":"submit"');
  });

  it('defaults the input value to an empty string', () => {
    const serialized = render({});

    expect(serialized).toContain(`"name":"${formNames.Input}"`);
    expect(serialized).toContain('"value":""');
  });

  it('renders the supplied payment reference in the input', () => {
    const serialized = render({ paymentReference: '4242' });

    expect(serialized).toContain('"value":"4242"');
  });

  it('omits a field error when errorText is undefined', () => {
    const serialized = render({ paymentReference: '4242' });

    expect(serialized).not.toContain('"error":');
  });

  it('shows validation error text on the field', () => {
    const errorText =
      'Destination tag must be a whole number from 0 to 4294967295';
    const serialized = render({
      paymentReference: 'not-a-tag',
      errorText,
    });

    expect(serialized).toContain(`"error":"${errorText}"`);
    expect(serialized).toContain('"value":"not-a-tag"');
  });
});
