import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Image, Text as SnapText } from '@metamask/snaps-sdk/jsx';

type AssetProps = {
  symbol: string;
  amount: string;
  iconSvg: string;
  showAmount?: boolean;
};

/**
 * Asset component for displaying assets with optional icon and amount.
 * Pure component with no business logic - just visual display.
 *
 * @param props - The props for the asset component.
 * @returns The rendered asset element.
 */
export const Asset = (props: AssetProps): ComponentOrElement => {
  const { symbol, amount, iconSvg } = props;
  return (
    <Box direction="horizontal" alignment="center">
      <Box alignment="center" center>
        <Image borderRadius="full" src={iconSvg} />
      </Box>
      <SnapText>{`${amount} ${symbol}`}</SnapText>
    </Box>
  );
};
