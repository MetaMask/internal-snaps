import { ConfirmationFooter } from './ConfirmationFooter';

const labels = {
  cancelButton: 'Cancel',
  confirmButton: 'Confirm',
  reviewAlertsButton: 'Review alert',
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
      reviewAlertsName: names.review,
      ...props,
    }),
  );

describe('ConfirmationFooter', () => {
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

  it('swaps the confirm button for "Review alert" when acknowledgement is required', () => {
    const serialized = render({ requiresAcknowledgement: true });

    expect(serialized).toContain(labels.reviewAlertsButton);
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
});
