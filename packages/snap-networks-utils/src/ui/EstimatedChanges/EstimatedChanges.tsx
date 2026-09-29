import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Icon,
  Image,
  Section,
  Skeleton,
  Text as SnapText,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';

export type EstimatedChangesAsset = {
  type: 'in' | 'out';
  /** Display-ready amount, or `null` when the amount is unknown. */
  value: string | null;
  symbol: string;
  logo: string | null;
  /** Display-ready fiat value shown under the amount. */
  fiat?: string | null;
};

export type EstimatedChangesLabels = {
  title: string;
  tooltip: string;
  send: string;
  receive: string;
  notAvailable: string;
  noChanges: string;
};

export type EstimatedChangesFetchStatus =
  | 'initial'
  | 'loading'
  | 'fetching'
  | 'fetched'
  | 'error';

export type EstimatedChangesProps = {
  assets: EstimatedChangesAsset[];
  labels: EstimatedChangesLabels;
  scanFetchStatus: EstimatedChangesFetchStatus;
  /** Whether the completed scan itself reported an error (e.g. simulation failure). */
  scanError: boolean;
};

const Header = ({
  labels,
}: {
  labels: EstimatedChangesLabels;
}): ComponentOrElement => (
  <Box direction="horizontal" alignment="start">
    <SnapText fontWeight="medium">{labels.title}</SnapText>
    <Tooltip content={labels.tooltip}>
      <Icon name="info" />
    </Tooltip>
  </Box>
);

const MessageSection = ({
  labels,
  message,
}: {
  labels: EstimatedChangesLabels;
  message: string;
}): ComponentOrElement => (
  <Section direction="vertical">
    <Header labels={labels} />
    <SnapText color="alternative">{message}</SnapText>
  </Section>
);

const AssetRow = ({
  asset,
}: {
  asset: EstimatedChangesAsset;
}): ComponentOrElement => {
  const isOut = asset.type === 'out';
  const isUnknownValue = asset.value === null;
  let label: string;
  if (isUnknownValue) {
    label = `– ${asset.symbol}`;
  } else {
    const sign = isOut ? '-' : '+';
    label = `${sign}${asset.value} ${asset.symbol}`;
  }
  const successOrError = isOut ? 'error' : 'success';

  return (
    <Box direction="vertical" crossAlignment="end">
      <Box direction="horizontal" alignment="end" center>
        {asset.logo ? (
          <Image src={asset.logo} borderRadius="full" height={16} width={16} />
        ) : null}
        <SnapText color={isUnknownValue ? 'alternative' : successOrError}>
          {label}
        </SnapText>
      </Box>
      {asset.fiat ? <SnapText color="muted">{asset.fiat}</SnapText> : null}
    </Box>
  );
};

const AssetGroup = ({
  title,
  assets,
}: {
  title: string;
  assets: EstimatedChangesAsset[];
}): ComponentOrElement | null =>
  assets.length > 0 ? (
    <Box alignment="space-between" direction="horizontal">
      <SnapText fontWeight="medium" color="alternative">
        {title}
      </SnapText>
      <Box direction="vertical" alignment="end">
        {assets.map((asset, index) => (
          <Box key={`${asset.type}-${asset.symbol}-${index}`}>
            <AssetRow asset={asset} />
          </Box>
        ))}
      </Box>
    </Box>
  ) : null;

/**
 * Renders the estimated balance changes of a transaction, grouped into
 * "send" and "receive" rows, with loading, error and empty states.
 *
 * @param props - The component props.
 * @param props.assets - The display-ready asset changes.
 * @param props.labels - The translated labels.
 * @param props.scanFetchStatus - The fetch status of the scan producing the changes.
 * @param props.scanError - Whether the completed scan itself reported an error.
 * @returns The estimated changes section.
 */
export const EstimatedChanges = ({
  assets,
  labels,
  scanFetchStatus,
  scanError,
}: EstimatedChangesProps): ComponentOrElement => {
  // Rows seeded locally by the caller are final, so they are never replaced by
  // the loading/error states driven by the remote scan.
  const hasAssets = assets.length > 0;

  if (
    !hasAssets &&
    (scanFetchStatus === 'loading' || scanFetchStatus === 'fetching')
  ) {
    return (
      <Section direction="vertical">
        <Header labels={labels} />
        <Box alignment="space-between" direction="horizontal">
          <Skeleton width={60} />
          <Skeleton width={100} />
        </Box>
      </Section>
    );
  }

  if (
    !hasAssets &&
    (scanFetchStatus === 'error' ||
      (scanFetchStatus === 'fetched' && scanError))
  ) {
    return <MessageSection labels={labels} message={labels.notAvailable} />;
  }

  if (scanFetchStatus === 'fetched' && !hasAssets) {
    return <MessageSection labels={labels} message={labels.noChanges} />;
  }

  return (
    <Section>
      <Header labels={labels} />
      <AssetGroup
        title={labels.send}
        assets={assets.filter((asset) => asset.type === 'out')}
      />
      <AssetGroup
        title={labels.receive}
        assets={assets.filter((asset) => asset.type === 'in')}
      />
    </Section>
  );
};
