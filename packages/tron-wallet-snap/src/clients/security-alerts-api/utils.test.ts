/* eslint-disable @typescript-eslint/naming-convention */
import { Types } from 'tronweb';

import { extractScanParametersFromTransactionData } from './utils';
import type {
  TransferAssetContractParameter,
  TransferContractParameter,
} from '../trongrid/types';

describe('SecurityAlertsApiClient utils', () => {
  describe('extractScanParametersFromTransactionData', () => {
    it('extracts scan parameters from a TransferAssetContractParameter', () => {
      const contractInteraction: TransferAssetContractParameter = {
        type_url: 'type.googleapis.com/protocol.TransferAssetContract',
        value: {
          asset_name: 'MyToken',
          owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
          to_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
          amount: 1000000,
        },
      };
      const rawData: Types.Transaction['raw_data'] = {
        contract: [
          {
            type: Types.ContractType.TransferAssetContract,
            parameter: contractInteraction,
          },
        ],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      const result = extractScanParametersFromTransactionData(rawData);

      expect(result).toStrictEqual({
        from: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        to: 'TPFmm695uHPTn8wNmQbF8yMiZxfCeUdXkJ',
        data: null,
        value: 1000000,
      });
    });

    it('extracts scan parameters from a TransferContractParameter', () => {
      const contractInteraction: TransferContractParameter = {
        type_url: 'type.googleapis.com/protocol.TransferContract',
        value: {
          owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
          to_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
          amount: 500000,
        },
      };
      const rawData: Types.Transaction['raw_data'] = {
        contract: [
          {
            type: Types.ContractType.TransferContract,
            parameter: contractInteraction,
          },
        ],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      const result = extractScanParametersFromTransactionData(rawData);

      expect(result).toStrictEqual({
        from: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        to: 'TPFmm695uHPTn8wNmQbF8yMiZxfCeUdXkJ',
        data: null,
        value: 500000,
      });
    });

    it('extract scan parameters from a TriggerSmartContract', () => {
      const contractInteraction = {
        type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
        value: {
          owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
          contract_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
          call_value: 200000,
          data: 'abcdef',
        },
      };
      const rawData: Types.Transaction['raw_data'] = {
        contract: [
          {
            type: Types.ContractType.TriggerSmartContract,
            parameter: contractInteraction,
          },
        ],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      const result = extractScanParametersFromTransactionData(rawData);

      expect(result).toStrictEqual({
        from: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        to: 'TPFmm695uHPTn8wNmQbF8yMiZxfCeUdXkJ',
        data: '0xabcdef',
        value: 200000,
      });
    });

    it('returns null if no contract parameter is found', () => {
      const rawData: Types.Transaction['raw_data'] = {
        contract: [],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      const result = extractScanParametersFromTransactionData(rawData);

      expect(result).toBeNull();
    });
  });
});
