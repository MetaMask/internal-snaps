import { assertJSXElement } from '@metamask/snaps-sdk/jsx';

import { ConfirmationFooter } from './ConfirmationFooter';

const labels = {
  cancelButton: 'Cancel',
  confirmButton: 'Confirm',
};

const names = {
  cancel: 'confirm-transaction-cancel',
  confirm: 'confirm-transaction-confirm',
  review: 'malicious-acknowledgement-review',
};

const render = (
  props: Partial<Parameters<typeof ConfirmationFooter>[0]>,
): string =>
  JSON.stringify(
    ConfirmationFooter({
      labels,
      cancelButtonName: names.cancel,
      confirmButtonName: names.confirm,
      openAcknowledgementName: names.review,
      ...props,
    }),
  );

describe('ConfirmationFooter', () => {
  it.each([
    {},
    { requiresAcknowledgement: true },
    { requiresAcknowledgement: true, confirmDisabled: true },
  ])('passes the Snap runtime UI schema for %j', (props) => {
    expect(() =>
      assertJSXElement(
        ConfirmationFooter({
          labels,
          cancelButtonName: names.cancel,
          confirmButtonName: names.confirm,
          openAcknowledgementName: names.review,
          ...props,
        }),
      ),
    ).not.toThrow();
  });

  it('renders an enabled confirm button by default', () => {
    const serialized = render({});

    expect(serialized).toContain(labels.cancelButton);
    expect(serialized).toContain(labels.confirmButton);
    expect(serialized).toContain(names.confirm);
    expect(serialized).not.toContain('"disabled":true');
  });

  it('renders a disabled confirm button when confirm is blocked', () => {
    const serialized = render({ confirmDisabled: true });

    expect(serialized).toContain('"disabled":true');
    expect(serialized).not.toContain(names.review);
  });

  it('routes Confirm to acknowledgement when required', () => {
    const serialized = render({ requiresAcknowledgement: true });

    expect(serialized).toContain(labels.confirmButton);
    expect(serialized).toContain(names.review);
    expect(serialized).not.toContain(names.confirm);
  });

  it('falls back to a disabled confirm button when a blocking state coincides with the acknowledgement', () => {
    const serialized = render({
      requiresAcknowledgement: true,
      confirmDisabled: true,
    });

    expect(serialized).toContain('"disabled":true');
    expect(serialized).not.toContain(names.review);
  });

  it('can render a destructive Confirm that still routes to acknowledgement', () => {
    const serialized = render({
      requiresAcknowledgement: true,
    });

    expect(serialized).toContain(labels.confirmButton);
    expect(serialized).toContain('"variant":"destructive"');
    expect(serialized).not.toContain('⚠');
    expect(serialized).not.toContain('"type":"Icon"');
    expect(serialized).toContain(names.review);
    expect(serialized).not.toContain(names.confirm);
    expect(serialized).not.toContain('Review alert');
  });

  it('keeps a destructive acknowledgement button blocked when confirmation is disabled', () => {
    const serialized = render({
      requiresAcknowledgement: true,
      confirmDisabled: true,
    });

    expect(serialized).toContain(names.confirm);
    expect(serialized).toContain('"disabled":true');
    expect(serialized).not.toContain(names.review);
    expect(serialized).not.toContain('"variant":"destructive"');
    expect(serialized).not.toContain('⚠');
  });

  it('keeps ordinary confirmation primary when acknowledgement is not required', () => {
    const serialized = render({ requiresAcknowledgement: false });

    expect(serialized).toContain(names.confirm);
    expect(serialized).not.toContain(names.review);
    expect(serialized).not.toContain('"variant":"destructive"');
    expect(serialized).not.toContain('⚠');
  });
});
