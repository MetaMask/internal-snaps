/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Error details
 */
export type ApiErrorDetails = {
  type: string;
  message: string;
};

export type TransactionErrorDetails = ApiErrorDetails & {
  number?: number | null;
  code?: string | null;
  transaction_index: number;
};

/**
 * Assets change
 */
export type AssetChange = {
  usd_price: string;
  summary: string;
  value: string;
  raw_value: string;
};

export type Trc20TokenAsset = {
  type: 'TRC20';
  address: string;
  symbol: string;
  name: string;
  logo_url?: string;
  decimals: number;
};

export type Trc10TokenAsset = {
  type: 'TRC10';
  address: string;
  symbol: string;
  name: string;
  logo_url?: string;
  decimals: number;
};

export type NativeAsset = {
  type: 'NATIVE';
  name: string;
  symbol: string;
  decimals: number;
  logo_url: string | null;
};

export type AssetDiff<Asset> = {
  asset_type: string;
  asset: Asset;
  in: AssetChange[];
  out: AssetChange[];
  balance_changes?: {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    before: any;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    after: any;
  };
};

export type AccountDetails = {
  type: string;
  account_address: string;
  description: string | null;
  was_written_to: boolean;
};

export type ValidationFeature = {
  type: 'Malicious' | 'Warning' | 'Benign';
  feature_id: string;
  description: string;
  address: string;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
};

export type Validation = {
  status: 'Success' | 'Error';
  result_type: 'Benign' | 'Warning' | 'Malicious';
  description: string;
  reason: string;
  classification: string;
  features: ValidationFeature[];
};

/**
 * Account summary with asset diffs and traces
 */
export type AccountSummary = {
  assets_diffs: AssetDiff<NativeAsset | Trc20TokenAsset | Trc10TokenAsset>[];
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traces: any[];
  total_usd_diff: {
    in: string;
    out: string;
    total: string;
  };
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exposures: any[];
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  total_usd_exposure: Record<string, any>;
};

export type Simulation = {
  status: 'Success' | 'Error';
  error?: string;
  error_details?: TransactionErrorDetails;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets_diffs: Record<string, any>;
  transaction_actions: string[];
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  total_usd_diff: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exposures: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  total_usd_exposure: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  address_details: Record<string, any>;
  account_summary: AccountSummary;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract_management: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session_key: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  missing_balances: any[];
  simulation_run_count: number;
};

export type SecurityAlertSimulationValidationResponse = {
  validation: Validation;
  simulation: Simulation;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[];
  gas_estimation?: {
    status: 'Success' | 'Error';
    used: string;
    estimate: string;
  };
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_operation_gas_estimation?: Record<string, any>;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: Record<string, any>;
  block: string;
  chain: string;
  account_address: string;
};

export type SecurityScanPayload = {
  from: string | null;
  to: string | null;
  data: string | null;
  value: number | null;
};
