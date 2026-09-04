import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import { Box, Icon, Text as SnapText, Tooltip } from '@metamask/snaps-sdk/jsx';

import type { Locale } from '../../../../core/utils/i18n';
import { i18n } from '../../../../core/utils/i18n';

type OriginRowProps = {
  /** Hostname to display. The row is not rendered when `null`. */
  displayOrigin: string | null;
  /** Whether the hostname was reported by the requester and can't be verified. */
  isSelfReported: boolean;
  locale: Locale;
};

/**
 * The "Request from" row of a confirmation.
 *
 * A self-reported origin is displayed with an explicit "not verified" marker:
 * it comes from the requesting app over a transport that cannot prove it, so
 * showing it bare would imply a verification we never made.
 *
 * @param props - The component props.
 * @param props.displayOrigin - Hostname to display, or `null` to render nothing.
 * @param props.isSelfReported - Whether the hostname is unverifiable.
 * @param props.locale - The locale used for the labels.
 * @returns The origin row, or `null` when there is nothing to display.
 */
export const OriginRow: SnapComponent<OriginRowProps> = ({
  displayOrigin,
  isSelfReported,
  locale,
}) => {
  if (!displayOrigin) {
    return null;
  }

  const translate = i18n(locale);

  return (
    <Box alignment="space-between" direction="horizontal">
      <Box alignment="space-between" direction="horizontal" center>
        <SnapText fontWeight="medium" color="alternative">
          {translate('confirmation.origin')}
        </SnapText>
        <Tooltip
          content={translate(
            isSelfReported
              ? 'confirmation.origin.unverified.tooltip'
              : 'confirmation.origin.tooltip',
          )}
        >
          <Icon name="question" color="muted" />
        </Tooltip>
      </Box>
      <Box direction="horizontal" alignment="end" center>
        <SnapText>{displayOrigin}</SnapText>
        {isSelfReported ? (
          <SnapText color="warning">
            {translate('confirmation.origin.unverified')}
          </SnapText>
        ) : null}
      </Box>
    </Box>
  );
};
