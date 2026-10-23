import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Button, Footer } from '@metamask/snaps-sdk/jsx';

export type ConfirmationFooterLabels = {
  /** Label of the cancel button. */
  cancelButton: string;
  /** Label of the confirm button. */
  confirmButton: string;
  /** Label of the button that opens the malicious acknowledgement flow. */
  reviewAlertsButton: string;
};

export type ConfirmationFooterProps = {
  /** Translated labels. */
  labels: ConfirmationFooterLabels;
  /** Form element name of the cancel button. */
  cancelButtonName: string;
  /** Form element name of the confirm button. */
  confirmButtonName: string;
  /**
   * Form element name of the button that opens the malicious acknowledgement
   * flow, shown instead of the confirm button when `requiresAcknowledgement`
   * is set.
   */
  reviewAlertsName: string;
  /** Whether the confirm action is currently blocked. */
  confirmDisabled?: boolean;
  /**
   * Whether to show "review alerts" instead of "confirm", routing the user
   * through the malicious acknowledgement flow instead of confirming directly.
   */
  requiresAcknowledgement?: boolean;
};

/**
 * Shared confirmation footer (cancel + primary button).
 *
 * Centralizes the malicious-acknowledgement behavior: a malicious scan result
 * swaps the primary button from "Confirm" to "Review alerts" rather than
 * disabling it, so the user keeps a "proceed anyway" path behind friction.
 *
 * A blocking state (`confirmDisabled`, e.g. a locally invalid transaction)
 * takes priority over the acknowledgement swap: we fall back to the disabled
 * "Confirm" button so the user can never enter the acknowledgement flow for a
 * transaction that is no longer valid.
 *
 * @param props - The component props.
 * @param props.labels - The translated labels.
 * @param props.cancelButtonName - Form element name for the cancel button.
 * @param props.confirmButtonName - Form element name for the confirm button.
 * @param props.reviewAlertsName - Form element name for the review-alerts button.
 * @param props.confirmDisabled - Whether the confirm button is disabled.
 * @param props.requiresAcknowledgement - Whether to show "Review alerts" instead of "Confirm".
 * @returns The footer.
 * @example
 * ```tsx
 * <ConfirmationFooter
 *   labels={{
 *     cancelButton: translate('confirmation.cancelButton'),
 *     confirmButton: translate('confirmation.confirmButton'),
 *     reviewAlertsButton: translate('confirmation.reviewAlertsButton'),
 *   }}
 *   cancelButtonName={formNames.Cancel}
 *   confirmButtonName={formNames.Confirm}
 *   reviewAlertsName={MaliciousAcknowledgementFormNames.Review}
 *   confirmDisabled={shouldDisableConfirmButton}
 *   requiresAcknowledgement={requiresMaliciousAcknowledgement({ preferences, scan })}
 * />;
 * ```
 */
export const ConfirmationFooter = ({
  labels,
  cancelButtonName,
  confirmButtonName,
  reviewAlertsName,
  confirmDisabled = false,
  requiresAcknowledgement = false,
}: ConfirmationFooterProps): ComponentOrElement => {
  return (
    <Footer>
      <Button name={cancelButtonName}>{labels.cancelButton}</Button>
      {requiresAcknowledgement && !confirmDisabled ? (
        <Button name={reviewAlertsName}>{labels.reviewAlertsButton}</Button>
      ) : (
        <Button name={confirmButtonName} disabled={confirmDisabled}>
          {labels.confirmButton}
        </Button>
      )}
    </Footer>
  );
};
