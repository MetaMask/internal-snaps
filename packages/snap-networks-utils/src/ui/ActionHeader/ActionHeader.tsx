import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Heading, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { AssetIcon } from '../Asset/Asset';

export type ActionHeaderProps = {
  title: string;
  /** Muted text shown below the title. */
  subtitle?: string;
  /**
   * Asset icon URL; when set, an extra-large asset icon is shown below the
   * title. A blank URL shows the question-mark icon.
   */
  iconUrl?: string;
};

/**
 * Renders the centered header at the top of a confirmation: a large title,
 * then an optional subtitle and asset icon.
 *
 * @param props - The component props.
 * @param props.title - The title.
 * @param props.subtitle - The subtitle.
 * @param props.iconUrl - The asset icon URL.
 * @returns The header element.
 * @example
 * ```tsx
 * <ActionHeader title={translate('confirmation.signMessage.title')} />;
 * ```
 */
export const ActionHeader = ({
  title,
  subtitle,
  iconUrl,
}: ActionHeaderProps): ComponentOrElement => (
  <Box alignment="center" center>
    <Box>{null}</Box>
    <Heading size="lg">{title}</Heading>
    {subtitle ? (
      <SnapText color="muted" alignment="center">
        {subtitle}
      </SnapText>
    ) : null}
    {iconUrl === undefined ? null : (
      <Box>
        <AssetIcon iconUrl={iconUrl} size="xl" />
      </Box>
    )}
    <Box>{null}</Box>
  </Box>
);
