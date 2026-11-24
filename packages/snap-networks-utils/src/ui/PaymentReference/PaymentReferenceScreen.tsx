import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Button,
  Container,
  Field,
  Footer,
  Form,
  Input,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import { ActionHeader } from '../ActionHeader/ActionHeader';

/**
 * Translated copy for the payment-reference edit screen.
 *
 * Networks supply their own wording (e.g. "Destination tag", "Memo").
 */
export type PaymentReferenceLabels = {
  /** Screen title. */
  title: string;
  /** Helper text shown under the title. */
  description: string;
  /** Input field label. */
  inputTitle: string;
  /** Input placeholder. */
  inputPlaceholder: string;
  /** Save / submit button label. */
  save: string;
  /** Back button label. */
  back: string;
};

/**
 * Form element names used by the screen. Snaps pass network-specific values so
 * event handlers can stay scoped (e.g. destination-tag vs memo).
 *
 * `Open` lives on the parent confirmation view and is intentionally omitted.
 */
export type PaymentReferenceFormNames = {
  Form: string;
  Input: string;
  Back: string;
  Save: string;
};

export type PaymentReferenceScreenProps = {
  /** Translated labels. */
  labels: PaymentReferenceLabels;
  /** Form element names for this network's edit flow. */
  formNames: PaymentReferenceFormNames;
  /** Current payment-reference text being edited. */
  paymentReference?: string;
  /** Optional validation error shown on the field. */
  errorText?: string;
};

/**
 * Shared screen for adding or updating a payment reference on send confirmation
 * (destination tag, memo, or similar network-specific reference).
 *
 * Labels and form names are injected so each snap can localize copy and keep
 * distinct event-handler keys.
 *
 * @param props - The component props.
 * @param props.labels - The translated labels.
 * @param props.formNames - Form element names for this network's edit flow.
 * @param props.paymentReference - Current payment-reference text being edited.
 * @param props.errorText - Optional validation error shown on the field.
 * @returns The payment-reference edit screen.
 * @example
 * ```tsx
 * <PaymentReferenceScreen
 *   labels={{
 *     title: translate('confirmation.destinationTag.title'),
 *     description: translate('confirmation.destinationTag.description'),
 *     inputTitle: translate('confirmation.destinationTag'),
 *     inputPlaceholder: translate('confirmation.destinationTag.placeholder'),
 *     save: translate('confirmation.destinationTag.save'),
 *     back: translate('confirmation.destinationTag.back'),
 *   }}
 *   formNames={DestinationTagEditFormNames}
 *   paymentReference={destinationTagDraft ?? destinationTag ?? ''}
 *   errorText={errorKey ? translate(errorKey) : undefined}
 * />;
 * ```
 */
export const PaymentReferenceScreen = ({
  labels,
  formNames,
  paymentReference = '',
  errorText,
}: PaymentReferenceScreenProps): ComponentOrElement => {
  return (
    <Container>
      <Box>
        <ActionHeader title={labels.title} />
        <SnapText color="alternative">{labels.description}</SnapText>
        <Form name={formNames.Form}>
          <Field label={labels.inputTitle} error={errorText}>
            <Input
              name={formNames.Input}
              value={paymentReference}
              placeholder={labels.inputPlaceholder}
            />
          </Field>
        </Form>
      </Box>
      <Footer>
        <Button name={formNames.Back}>{labels.back}</Button>
        <Button name={formNames.Save} type="submit" form={formNames.Form}>
          {labels.save}
        </Button>
      </Footer>
    </Container>
  );
};
