import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Button, Footer } from '@metamask/snaps-sdk/jsx';

export type ConfirmationFooterLabels = {
  /** Label of the cancel button. */
  cancelButton: string;
  /** Label of both the confirmation and acknowledgement-entry buttons. */
  confirmButton: string;
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
  openAcknowledgementName: string;
  /** Whether the confirm action is currently blocked. */
  confirmDisabled?: boolean;
  /**
   * Whether Confirm opens malicious acknowledgement instead of confirming
   * directly.
   */
  requiresAcknowledgement?: boolean;
};

/**
 * Shared confirmation footer (cancel + primary button).
 *
 * Routes Confirm through malicious acknowledgement when required, so the user
 * explicitly acknowledges the risk before proceeding. The acknowledgement
 * entry button uses the destructive variant.
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
 * @param props.openAcknowledgementName - Form element name for the acknowledgement entry button.
 * @param props.confirmDisabled - Whether the confirm button is disabled.
 * @param props.requiresAcknowledgement - Whether Confirm opens malicious acknowledgement.
 * @returns The footer.
 * @example
 * ```tsx
 * <ConfirmationFooter
 *   labels={{
 *     cancelButton: translate('confirmation.cancelButton'),
 *     confirmButton: translate('confirmation.confirmButton'),
 *   }}
 *   cancelButtonName={formNames.Cancel}
 *   confirmButtonName={formNames.Confirm}
 *   openAcknowledgementName={MaliciousAcknowledgementFormNames.Review}
 *   confirmDisabled={shouldDisableConfirmButton}
 *   requiresAcknowledgement={requiresMaliciousAcknowledgement({ preferences, scan })}
 * />;
 * ```
 */
export const ConfirmationFooter = ({
  labels,
  cancelButtonName,
  confirmButtonName,
  openAcknowledgementName,
  confirmDisabled = false,
  requiresAcknowledgement = false,
}: ConfirmationFooterProps): ComponentOrElement => {
  const opensAcknowledgement = requiresAcknowledgement && !confirmDisabled;
  const name = opensAcknowledgement
    ? openAcknowledgementName
    : confirmButtonName;
  const variant = opensAcknowledgement ? 'destructive' : 'primary';

  return (
    <Footer>
      <Button name={cancelButtonName}>{labels.cancelButton}</Button>
      <Button name={name} variant={variant} disabled={confirmDisabled}>
        {labels.confirmButton}
      </Button>
    </Footer>
  );
};
