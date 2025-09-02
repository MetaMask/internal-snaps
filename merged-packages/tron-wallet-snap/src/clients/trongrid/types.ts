/* eslint-disable @typescript-eslint/naming-convention */
export type TrongridApiResponse<T> = {
  data: T[];
  success: boolean;
  meta: {
    at: number;
    page_size: number;
  };
};

export type TronAccount = {
  owner_permission: RawTronPermission;
  account_resource: RawTronAccountResource;
  active_permission: RawTronPermission[];
  address: string;
  create_time: number;
  latest_opration_time: number;
  frozenV2: RawTronFrozenV2[];
  unfrozenV2: RawTronUnfrozenV2[];
  balance: number;
  assetV2?: Record<string, string>[];
  trc20?: Record<string, string>[];
  latest_consume_free_time: number;
  votes: RawTronVote[];
  latest_withdraw_time: number;
  net_window_size: number;
  net_window_optimized: boolean;
};

export type RawTronPermission = {
  keys: RawTronKey[];
  threshold: number;
  permission_name: string;
  operations?: string;
  id?: number;
  type?: string;
};

export type RawTronKey = {
  address: string;
  weight: number;
};

export type RawTronAccountResource = {
  energy_window_optimized: boolean;
  energy_window_size: number;
};

export type RawTronFrozenV2 = {
  amount?: number;
  type?: string;
};

export type RawTronUnfrozenV2 = {
  unfreeze_amount: number;
  unfreeze_expire_time: number;
};

export type RawTronVote = {
  vote_address: string;
  vote_count: number;
};

// Mapped types (camelCase)
// export type TronAccount = {
//   ownerPermission: TronPermission;
//   accountResource: TronAccountResource;
//   activePermission: TronPermission[];
//   address: string;
//   createTime: number;
//   latestOperationTime: number;
//   frozenV2: TronFrozenV2[];
//   unfrozenV2: TronUnfrozenV2[];
//   balance: number;
//   assetV2: Record<string, string>[];
//   trc20: Record<string, string>[];
//   latestConsumeFreeTime: number;
//   votes: TronVote[];
//   latestWithdrawTime: number;
//   netWindowSize: number;
//   netWindowOptimized: boolean;
// };

// export type TronPermission = {
//   keys: TronKey[];
//   threshold: number;
//   permissionName: string;
//   operations?: string;
//   id?: number;
//   type?: string;
// };

// export type TronKey = {
//   address: string;
//   weight: number;
// };

// export type TronAccountResource = {
//   energyWindowOptimized: boolean;
//   energyWindowSize: number;
// };

// export type TronFrozenV2 = {
//   amount?: number;
//   type?: string;
// };

// export type TronUnfrozenV2 = {
//   unfreezeAmount: number;
//   unfreezeExpireTime: number;
// };

// export type TronVote = {
//   voteAddress: string;
//   voteCount: number;
// };
