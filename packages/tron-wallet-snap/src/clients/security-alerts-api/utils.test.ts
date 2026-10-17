import { Types as TronwebTypes } from 'tronweb';

import type {
  TransferAssetContractParameter,
  TransferContractParameter,
} from '../trongrid/types';
import {
  extractScanParametersFromTransactionData,
  isContractTypeSupported,
} from './utils';

describe('SecurityAlertsApiClient utils', () => {
  describe('isContractTypeSupported', () => {
    it('supports transfers, contract deployment, and contract calls', () => {
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.TransferContract,
            parameter: {
              type_url: 'type.googleapis.com/protocol.TransferContract',
              value: {
                owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
                to_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
                amount: 1000000,
              },
            },
          },
        ],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      expect(isContractTypeSupported(rawData)).toBe(true);
    });

    it('does not support other contract types', () => {
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: 'FreezeBalanceContract' as TronwebTypes.ContractType,
            parameter: {
              type_url: 'type.googleapis.com/protocol.FreezeBalanceContract',
              value: {
                owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
                frozen_balance: 1000,
              },
            },
          },
        ],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      expect(isContractTypeSupported(rawData)).toBe(false);
    });

    it('does not support transactions without contracts', () => {
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      expect(isContractTypeSupported(rawData)).toBe(false);
    });
  });

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
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.TransferAssetContract,
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
        value: '0xf4240',
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
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.TransferContract,
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
        value: '0x7a120',
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
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.TriggerSmartContract,
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
        value: '0x30d40',
      });
    });

    it('omits call data and encodes a zero value as hex when the contract has neither', () => {
      const contractInteraction = {
        type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
        value: {
          owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
          contract_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
        },
      };
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.TriggerSmartContract,
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
        value: '0x0',
      });
    });

    it('omits the recipient for contract creation', () => {
      const contractInteraction = {
        type_url: 'type.googleapis.com/protocol.CreateSmartContract',
        value: {
          owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
        },
      };
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [
          {
            type: TronwebTypes.ContractType.CreateSmartContract,
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
        value: '0x0',
      });
    });

    it('throws if no contract parameter is found', () => {
      const rawData: TronwebTypes.Transaction['raw_data'] = {
        contract: [],
        ref_block_bytes: '',
        ref_block_hash: '',
        expiration: 0,
        timestamp: 0,
      };

      expect(() => extractScanParametersFromTransactionData(rawData)).toThrow(
        'Could not extract scan parameters from transaction.',
      );
    });
  });
});
