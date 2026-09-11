import type { Horizon } from '@stellar/stellar-sdk';

export const receivePaymentTransactionPathReceiveResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GB327AMKGJDXEMQREZRRVW7Y6KEKWPOWTJKCCYUQK7KKXVMCTNZEOYXU',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62990137',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270540578385887232',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270540578385887232',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389',
    },
  },
  id: '0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389',
  paging_token: '270540578385887232',
  successful: true,
  hash: '0ed5a90390df778a2794024799b64c320f07ca9627d444fc93f17dd0e23cb389',
  ledger: 62990137,
  created_at: '2026-06-12T02:35:29Z',
  source_account: 'GB327AMKGJDXEMQREZRRVW7Y6KEKWPOWTJKCCYUQK7KKXVMCTNZEOYXU',
  source_account_sequence: '269911571835125764',
  fee_account: 'GB327AMKGJDXEMQREZRRVW7Y6KEKWPOWTJKCCYUQK7KKXVMCTNZEOYXU',
  fee_charged: '100',
  max_fee: '100',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAB3r4GKMkdyMhEmYxrb+PKIqz3WmlQhYpBX1KvVgptyRwAAAGQDvuslAAAABAAAAAAAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAAAHoSAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAAAAAAAAAAAAYKbckcAAABAFrkTeIpg9s/5TuXb0qMDLDWLOG0+BpxGaHEkWl394umLP6jvfFvwUQm4waUUrRxZO9juE6/FtJXHhI6coN7vAg==',
  result_xdr:
    'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAEAAAABAAAAAK/RJuy9fO3KynjeAEQhgWfG4XkYKgOq6fT0yDlB5bOQAAAAAG3s48MAAAABQVFVQQAAAABblC5TrDPI/QqAzHwbGoXX2DipxBl3qtGLOvBX+OM98AAAAAA7msoAAAAAAAAAAAAAHkOoAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwSbJAAAAAAAAAAB3r4GKMkdyMhEmYxrb+PKIqz3WmlQhYpBX1KvVgptyRwAAAAABqz6nA77rJQAAAAMAAAACAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPBJskAAAAAaitt3QAAAAAAAAABA8EnOQAAAAAAAAAAd6+BijJHcjIRJmMa2/jyiKs91ppUIWKQV9Sr1YKbckcAAAAAAas+QwO+6yUAAAADAAAAAgAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwSbJAAAAAGorbd0AAAAA',
  memo_type: 'none',
  signatures: [
    'FrkTeIpg9s/5TuXb0qMDLDWLOG0+BpxGaHEkWl394umLP6jvfFvwUQm4waUUrRxZO9juE6/FtJXHhI6coN7vAg==',
  ],
} as unknown as Horizon.ServerApi.TransactionRecord;

export const swapTransactionPathReceiveWithStrictPathResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62989662',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270538538276917248',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270538538276917248',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59',
    },
  },
  id: 'a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59',
  paging_token: '270538538276917248',
  successful: true,
  hash: 'a04ab86c00c10af2fd87671eb5d94c95d21baa4e9e9236baef5cc2c02ac6af59',
  ledger: 62989662,
  created_at: '2026-06-12T01:49:18Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343039',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '100',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAGQDpYayAAABPwAAAAAAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAAATEtAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAEAAAABU0hYAAAAAADlOMj3OZP8orENyYJ2H+XpUVJEUQMf0EclKEV/Tfo+pAAAAAAAAAABUw9ItgAAAEBL9osICVZiqO3R0O/CN8xNKW6AiaD8JTWYXFj3LhJpDVos7JE/QcpF9hcMFn0x6NNMtzgRoXeKgxuDJD4QA6MI',
  result_xdr:
    'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAIAAAACrDw3Zv9Cd+YHSoQ6RsupepH/GpA5oN0KkMfJghN0XJcAAAABU0hYAAAAAADlOMj3OZP8orENyYJ2H+XpUVJEUQMf0EclKEV/Tfo+pAAAAAAFE5HyAAAAAAAAAAAAHmkJAAAAAvcoPOvOfHWrpTZuji5VPYI2MjqdBgEgQm2ELlKuImumAAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAFTSFgAAAAAAOU4yPc5k/yisQ3JgnYf5elRUkRRAx/QRyUoRX9N+j6kAAAAAAUTkfIAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAABQVFVQQAAAABblC5TrDPI/QqAzHwbGoXX2DipxBl3qtGLOvBX+OM98AAAAAA7msoAAAAAAA==',
  fee_meta_xdr:
    'AAAAAgAAAAMDwSUfAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA0zlhqA6WGsgAAAT4AAAALAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPBI+IAAAAAaitdAQAAAAAAAAABA8ElXgAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANM5YBgOlhrIAAAE+AAAACwAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwSPiAAAAAGorXQEAAAAA',
  memo_type: 'none',
  signatures: [
    'S/aLCAlWYqjt0dDvwjfMTSlugImg/CU1mFxY9y4SaQ1aLOyRP0HKRfYXDBZ9MejTTLc4EaF3ioMbgyQ+EAOjCA==',
  ],
} as unknown as Horizon.ServerApi.TransactionRecord;

export const swapTransactionPathReceiveResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62989282',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270536906189189120',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270536906189189120',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c',
    },
  },
  id: '2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c',
  paging_token: '270536906189189120',
  successful: true,
  hash: '2ec261894ff9a6a9e433857d2e5139f00dccb9838ae178d52c5627d0e8b9d61c',
  ledger: 62989282,
  created_at: '2026-06-12T01:12:33Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343038',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '100',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAGQDpYayAAABPgAAAAAAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAAATEtAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAAAAAAAAAAAAVMPSLYAAABAGaNpR2TrqibsJcMSQIdxsZZWUNWImVsslVb4X3rmMsDdTCbNEAVaFETXyVw8LrpU9/7qeui2evJwvO8FZIU+Dg==',
  result_xdr:
    'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAACAAAAAAAAAAEAAAABAAAAAK/RJuy9fO3KynjeAEQhgWfG4XkYKgOq6fT0yDlB5bOQAAAAAG3sw6QAAAABQVFVQQAAAABblC5TrDPI/QqAzHwbGoXX2DipxBl3qtGLOvBX+OM98AAAAAA7msoAAAAAAAAAAAAAHjygAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAUFRVUEAAAAAW5QuU6wzyP0KgMx8GxqF19g4qcQZd6rRizrwV/jjPfAAAAAAO5rKAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwP/eAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA07JVXA6WGsgAAAT0AAAALAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPA/94AAAAAaiqKIAAAAAAAAAABA8Ej4gAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANOyU8wOlhrIAAAE9AAAACwAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwP/eAAAAAGoqiiAAAAAA',
  memo_type: 'none',
  signatures: [
    'GaNpR2TrqibsJcMSQIdxsZZWUNWImVsslVb4X3rmMsDdTCbNEAVaFETXyVw8LrpU9/7qeui2evJwvO8FZIU+Dg==',
  ],
} as unknown as Horizon.ServerApi.TransactionRecord;

export const swapTransactionWithFeeCollectResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62891903',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270118666569011200',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270118666569011200',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268',
    },
  },
  id: '6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268',
  paging_token: '270118666569011200',
  successful: true,
  hash: '6df5828617df879ba9d93eb551b83514dd7006113978d9babe932f0ad25fe268',
  ledger: 62891903,
  created_at: '2026-06-05T11:34:38Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333342960',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '200',
  max_fee: '220',
  operation_count: 2,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAANwDpYayAAAA8AAAAAEAAAAAAAAAAAAAAABqIrRoAAAAAAAAAAIAAAAAAAAADQAAAAFVU0RDAAAAADuZETgO/piLoKiQDrHP5E82b32+lGvtB3JA9/Yk3xXFAAAAAAAPQkAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAAAAAAAABOnioAAAAAAAAAAAAAAAEAAAAARXd0NbEgRq6+e2KTd0q07wVC7AfjxEaLrXOy+mXjFlQAAAAAAAAAAAAAs7IAAAAAAAAAAVMPSLYAAABAkarvPnQYXclN6ZSxFgiRXYLQv2TvccpmHB4Qfn9OtLp1gAecYHLDxFiBZ8ftHMEtNrE53zNtNCFgzzi5+jawBw==',
  result_xdr:
    'AAAAAAAAAMgAAAAAAAAAAgAAAAAAAAANAAAAAAAAAAEAAAABAAAAAM1vW5lXUjPlDdxBhG2Jq85TuMRq9zfoBr/W7y0H8JH3AAAAAG3bNdUAAAAAAAAAAABQOOcAAAABVVNEQwAAAAA7mRE4Dv6Yi6CokA6xz+RPNm99vpRr7QdyQPf2JN8VxQAAAAAAD0JAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAAAAAAAAUDjnAAAAAAAAAAEAAAAAAAAAAA==',
  fee_meta_xdr:
    'AAAAAgAAAAMDv3McAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA10l1zA6WGsgAAAO8AAAAGAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAO/cxwAAAAAaiGAkgAAAAAAAAABA7+nfwAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANdJcqwOlhrIAAADvAAAABgAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADv3McAAAAAGohgJIAAAAA',
  memo_type: 'none',
  signatures: [
    'karvPnQYXclN6ZSxFgiRXYLQv2TvccpmHB4Qfn9OtLp1gAecYHLDxFiBZ8ftHMEtNrE53zNtNCFgzzi5+jawBw==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1780659304',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const swapTransactionWithoutFeeCollectResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/61195698',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=262833521566416896',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=262833521566416896',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6',
    },
  },
  id: 'eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6',
  paging_token: '262833521566416896',
  successful: true,
  hash: 'eae4a5f1b6b305e220212bce9a2cc8b378b245024d7ab48af58a9a82185798f6',
  ledger: 61195698,
  created_at: '2026-02-12T06:37:49Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333342729',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '11891',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAALnMDpYayAAAACQAAAAEAAAAAAAAAAAAAAABpjXXmAAAAAAAAAAEAAAAAAAAADQAAAAAAAAAAAJiWgAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAFVU0RDAAAAADuZETgO/piLoKiQDrHP5E82b32+lGvtB3JA9/Yk3xXFAAAAAAAX3hwAAAAAAAAAAAAAAAFTD0i2AAAAQI16gjkJIu8HeYDqT5FMd4Q4FJBc2DoC0aMyK+mR/IZwrlZaCAi2btaNSffEl3nWWaOiCczACKZTbVNqapD+IQU=',
  result_xdr:
    'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAANAAAAAAAAAAEAAAABAAAAAGR+DTg0ZfnnSdDFIyItExAEaWivs+X0CbJSIApXhQ3tAAAAAGyvHUgAAAABVVNEQwAAAAA7mRE4Dv6Yi6CokA6xz+RPNm99vpRr7QdyQPf2JN8VxQAAAAAAGBvUAAAAAAAAAAAAmJaAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAAVVTREMAAAAAO5kROA7+mIugqJAOsc/kTzZvfb6Ua+0HckD39iTfFcUAAAAAABgb1AAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDpcWMAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAE3N91A6WGsgAAAAgAAAAEAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAACF0bMAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAOlxGIAAAAAaY1teQAAAAAAAAABA6XFsgAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAABNzfEQOlhrIAAAAIAAAABAAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAhdGzAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADpcRiAAAAAGmNbXkAAAAA',
  memo_type: 'none',
  signatures: [
    'jXqCOQki7wd5gOpPkUx3hDgUkFzYOgLRozIr6ZH8hnCuVloICLZu1o1J98SXedZZo6IJzMAIplNtU2pqkP4hBQ==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1770878438',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const addChangeTrustResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62952644',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270379547177148416',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270379547177148416',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b',
    },
  },
  id: 'f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b',
  paging_token: '270379547177148416',
  successful: true,
  hash: 'f68c5c95c412090252b3b51009eab31074df6a2fada5e23145fc037067c4934b',
  ledger: 62952644,
  created_at: '2026-06-09T13:44:25Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343029',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '120',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAHgDpYayAAABNQAAAAEAAAAAAAAAAAAAAABqKBldAAAAAAAAAAEAAAAAAAAABgAAAAFBRlIAAAAAAG/sI52tP2aACgbiEo47RuimlPNL4dL5TnKkbCAM5OMGf/////////8AAAAAAAAAAVMPSLYAAABAFPkhRhLqD+VuR8Q4FWdgxbu48XFcxp6hgAiJbhFYFACd6tsGpLcE0Cs06DteAadf/1wTaoYo3XEJfKmI4thmCg==',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAGAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwJPTAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA1iS38A6WGsgAAATQAAAAIAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAk9MAAAAAaigTRwAAAAAAAAABA8CUxAAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANYktmAOlhrIAAAE0AAAACAAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwJPTAAAAAGooE0cAAAAA',
  memo_type: 'none',
  signatures: [
    'FPkhRhLqD+VuR8Q4FWdgxbu48XFcxp6hgAiJbhFYFACd6tsGpLcE0Cs06DteAadf/1wTaoYo3XEJfKmI4thmCg==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1781012829',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const removeChangeTrustResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62949429',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270365738857349120',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270365738857349120',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99',
    },
  },
  id: '5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99',
  paging_token: '270365738857349120',
  successful: true,
  hash: '5ce2d6c118dc4aa6164c5fa8b69fdad8af1e1faff7b67a2ec9cb66a652163a99',
  ledger: 62949429,
  created_at: '2026-06-09T08:35:09Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343025',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '120',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAHgDpYayAAABMQAAAAEAAAAAAAAAAAAAAABqJ9DnAAAAAAAAAAEAAAAAAAAABgAAAAFBRlIAAAAAAG/sI52tP2aACgbiEo47RuimlPNL4dL5TnKkbCAM5OMGAAAAAAAAAAAAAAAAAAAAAVMPSLYAAABAWyxTwqBPBOk2blRtwq0WxP/6QkTjLqgX+DB+ztWeDDca8E//dE3y9nVvDJ21nV0k/db5BWSUUQP5MKBeO9VWAA==',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAGAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwIF5AAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA2IceuA6WGsgAAATAAAAAIAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAgXkAAAAAaieo/QAAAAAAAAABA8CINQAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANiHHSgOlhrIAAAEwAAAACAAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwIF5AAAAAGonqP0AAAAA',
  memo_type: 'none',
  signatures: [
    'WyxTwqBPBOk2blRtwq0WxP/6QkTjLqgX+DB+ztWeDDca8E//dE3y9nVvDJ21nV0k/db5BWSUUQP5MKBeO9VWAA==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1780994279',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const sendTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62947705',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270358334333763584',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270358334333763584',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372',
    },
  },
  id: 'c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372',
  paging_token: '270358334333763584',
  successful: true,
  hash: 'c8aa500c242cc3cbb4051ec4dc8215fa269ddf37760a5265c59d0bbd6ad77372',
  ledger: 62947705,
  created_at: '2026-06-09T05:47:41Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343024',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '120',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAHgDpYayAAABMAAAAAEAAAAAAAAAAAAAAABqJ6moAAAAAAAAAAEAAAAAAAAAAQAAAAB3r4GKMkdyMhEmYxrb+PKIqz3WmlQhYpBX1KvVgptyRwAAAAAAAAAAAAAAZAAAAAAAAAABUw9ItgAAAEAtK3jP9oB2i9UBU3MwOdHC3sfKCU7uWppczvT5E9I/C9TJefGdL0I1gvp4UgtcgBq6nYPrhxZekJzYf7AbukAH',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwH+RAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA2Ich2A6WGsgAAAS8AAAAIAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAf5EAAAAAaied7gAAAAAAAAABA8CBeQAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANiHIEgOlhrIAAAEvAAAACAAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwH+RAAAAAGonne4AAAAA',
  memo_type: 'none',
  signatures: [
    'LSt4z/aAdovVAVNzMDnRwt7HyglO7lqaXM70+RPSPwvUyXnxnS9CNYL6eFILXIAaup2D64cWXpCc2H+wG7pABw==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1780984232',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const createAccountTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62953267',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270382222941630464',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270382222941630464',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f',
    },
  },
  id: 'c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f',
  paging_token: '270382222941630464',
  successful: true,
  hash: 'c5b838af1ecd1dc835b5f86d29ee6161295cc5504098af67e1916ae673dbcc1f',
  ledger: 62953267,
  created_at: '2026-06-09T14:44:57Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343030',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '100',
  max_fee: '120',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAHgDpYayAAABNgAAAAEAAAAAAAAAAAAAAABqKCeSAAAAAAAAAAEAAAAAAAAAAAAAAACXUnRfY1MYCozoHKTP3JKa9R7arlfK1l8ih1xZA6N68gAAAAABycOAAAAAAAAAAAFTD0i2AAAAQOfyu3bfm9JEEGwAAjsuor8fqHAXuw2z9tWKiBfBm8iD3bMvT61nZ5DOa54UEDqpf1ioNxxibF8oSefQqejrbw8=',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwJTEAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA1iS2YA6WGsgAAATUAAAAJAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAlMQAAAAAaigYuQAAAAAAAAABA8CXMwAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANYktNAOlhrIAAAE1AAAACQAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwJTEAAAAAGooGLkAAAAA',
  memo_type: 'none',
  signatures: [
    '5/K7dt+b0kQQbAACOy6ivx+ocBe7DbP21YqIF8GbyIPdsy9PrWdnkM5rnhQQOql/WKg3HGJsXyhJ59Cp6OtvDw==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1781016466',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const receivePaymentTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GCLVE5C7MNJRQCUM5AOKJT64SKNPKHW2VZL4VVS7EKDVYWIDUN5PECZW',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62953290',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270382321725812736',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270382321725812736',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc',
    },
  },
  id: '53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc',
  paging_token: '270382321725812736',
  successful: true,
  hash: '53842e80a16599310ee3b09ae602992277fb6c25d978aa90b446cd395e4c95cc',
  ledger: 62953290,
  created_at: '2026-06-09T14:47:14Z',
  source_account: 'GCLVE5C7MNJRQCUM5AOKJT64SKNPKHW2VZL4VVS7EKDVYWIDUN5PECZW',
  source_account_sequence: '270382222941356034',
  fee_account: 'GCLVE5C7MNJRQCUM5AOKJT64SKNPKHW2VZL4VVS7EKDVYWIDUN5PECZW',
  fee_charged: '100',
  max_fee: '120',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAACXUnRfY1MYCozoHKTP3JKa9R7arlfK1l8ih1xZA6N68gAAAHgDwJczAAAAAgAAAAEAAAAAAAAAAAAAAABqKCggAAAAAAAAAAEAAAAAAAAAAQAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAFTSFgAAAAAAOU4yPc5k/yisQ3JgnYf5elRUkRRAx/QRyUoRX9N+j6kAAAAAAL68IAAAAAAAAAAAQOjevIAAABAbsO0c1P2TfctrIcvD6p3wNkxNW3W1IrjjEl6uAWGnUnIyDDx2tBbUKXOX+frz29Z11P6UwLZ+Bt4EIFjyFBqAQ==',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAABAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwJc/AAAAAAAAAACXUnRfY1MYCozoHKTP3JKa9R7arlfK1l8ih1xZA6N68gAAAAABycMcA8CXMwAAAAEAAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAlz8AAAAAaignMAAAAAAAAAABA8CXSgAAAAAAAAAAl1J0X2NTGAqM6Bykz9ySmvUe2q5XytZfIodcWQOjevIAAAAAAcnCuAPAlzMAAAABAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwJc/AAAAAGooJzAAAAAA',
  memo_type: 'none',
  signatures: [
    'bsO0c1P2TfctrIcvD6p3wNkxNW3W1IrjjEl6uAWGnUnIyDDx2tBbUKXOX+frz29Z11P6UwLZ+Bt4EIFjyFBqAQ==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1781016608',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const spamTransactionResponse = {
  memo: 'claim your VTA airdrop',
  memo_bytes: 'Y2xhaW0geW91ciBWVEEgYWlyZHJvcA==',
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/d9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GDRMQMJNI55N5FWTA734ZICZ3JOEMYRXVLWXFU7HTRFKBQDFYZN5XFMS',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62946196',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/d9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/d9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270351853227712512',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270351853227712512',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/d9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55',
    },
  },
  id: 'd9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55',
  paging_token: '270351853227712512',
  successful: true,
  hash: 'd9281c9b5ed318671fcadf1a562bbc89ded0ff17bf8ca835e3e825631aafaa55',
  ledger: 62946196,
  created_at: '2026-06-09T03:21:24Z',
  source_account: 'GDRMQMJNI55N5FWTA734ZICZ3JOEMYRXVLWXFU7HTRFKBQDFYZN5XFMS',
  source_account_sequence: '270146691229814170',
  fee_account: 'GDRMQMJNI55N5FWTA734ZICZ3JOEMYRXVLWXFU7HTRFKBQDFYZN5XFMS',
  fee_charged: '10000',
  max_fee: '10000',
  operation_count: 100,
  envelope_xdr:
    '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',
  result_xdr:
    'AAAAAAAAJxAAAAAAAAAAZAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDwHuSAAAAAAAAAADiyDEtR3reltMH98ygWdpcRmI3qu1y0+ecSqDAZcZb2wAAAAAMzrVvA7/A/AAADZkAAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAe5IAAAAAaieGqQAAAAAAAAABA8B7lAAAAAAAAAAA4sgxLUd63pbTB/fMoFnaXEZiN6rtctPnnEqgwGXGW9sAAAAADM6OXwO/wPwAAA2ZAAAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwHuSAAAAAGonhqkAAAAA',
  memo_type: 'text',
  signatures: [
    'y+uW9EXFlWvcyptTBLmbxEQLobDf3JQQLI0YyiOnhLicvvhDXmQfFQbCj3eDEB/F4wdWxeNKMsok8A2ybaP0Bw==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1780977079',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const contractInvokeTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GCQJ7S55OJ3X5Q3B5GVRW4Q5WHUSL47LDUXQKXR7MWSRE7QQITKSEBRQ',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62670258',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=269166708542713856',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=269166708542713856',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0',
    },
  },
  id: '6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0',
  paging_token: '269166708542713856',
  successful: true,
  hash: '6dd990032dfe59b2f6fc67c67a2eabc0dea19e2078e2fd1de9b69879159354b0',
  ledger: 62670258,
  created_at: '2026-05-21T14:03:55Z',
  source_account: 'GCQJ7S55OJ3X5Q3B5GVRW4Q5WHUSL47LDUXQKXR7MWSRE7QQITKSEBRQ',
  source_account_sequence: '240928234873577922',
  fee_account: 'GCQJ7S55OJ3X5Q3B5GVRW4Q5WHUSL47LDUXQKXR7MWSRE7QQITKSEBRQ',
  fee_charged: '222205',
  max_fee: '362276',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAACgn8u9cnd+w2HpqxtyHbHpJfPrHS8FXj9lpRJ+EETVIgAFhyQDV/L0AABhwgAAAAEAAAAAAAAAAAAAAABqEGJFAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAAId2l0aGRyYXcAAAAFAAAACQAAAAAAAAAAAAAAAACWVpwAAAAJAAAAAAAAAGB1wAo1vN7vqAAAABIAAAABre/OWa7lKWj3YGHUlMJSW3Vln6QpamX0me8p5WR35JYAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAA0AAABBqc/RsCFZjtKcB7s37SUHHfVH5BH1Oe1iNnlMZt3RhJ4BTu4dqu7PI7YaQg7zd+mnuGygpZYT2BR+aZg4OWt8JgAAAAAAAAAAAAAAAQAAAAAAAAADAAAABgAAAAGXZfW4lXVkw3UNOcAwZyVUR4OdbqD9LX7Ttpqp5rWBCgAAABQAAAABAAAABgAAAAGt785ZruUpaPdgYdSUwlJbdWWfpClqZfSZ7ynlZHfklgAAABQAAAABAAAAB8x0rLVv0B71YLXUQ81Y/hHVrL7ODkABYS67MQIPyS+XAAAAAwAAAAEAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAABVVNEQwAAAAA7mRE4Dv6Yi6CokA6xz+RPNm99vpRr7QdyQPf2JN8VxQAAAAYAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAAQAAAAAQAAAAIAAAAPAAAADVdpdGhkcmF3Tm9uY2UAAAAAAAAJAAAAAAAAAGB1wAo1vN7vqAAAAAEAAAAGAAAAAa3vzlmu5Slo92Bh1JTCUlt1ZZ+kKWpl9JnvKeVkd+SWAAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAABAFJpQQAAAHQAAAHMAAAAAAAEAIQAAAABEETVIgAAAEANovL5MPX+nHcH/tLyxEyOXXFwv9U/MlmzzG1Xm6FtSYSO9hePO2Ya0VmGp4A/Y4PRp12SfpdHc/mQcezxsngK',
  result_xdr:
    'AAAAAAADY/0AAAAAAAAAAQAAAAAAAAAYAAAAAEG9iKuo86BwX5CbrU+Z3/WX6oXYqiYG1LB1cev0MASVAAAAAA==',
  fee_meta_xdr:
    'AAAAAgAAAAMDvEECAAAAAAAAAACgn8u9cnd+w2HpqxtyHbHpJfPrHS8FXj9lpRJ+EETVIgAAAAAyESMZA1fy9AAAYcEAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAO8QQIAAAAAag71nQAAAAAAAAABA7xFsgAAAAAAAAAAoJ/LvXJ3fsNh6asbch2x6SXz6x0vBV4/ZaUSfhBE1SIAAAAAMg0iMQNX8vQAAGHBAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADvEECAAAAAGoO9Z0AAAAA',
  memo_type: 'none',
  signatures: [
    'DaLy+TD1/px3B/7S8sRMjl1xcL/VPzJZs8xtV5uhbUmEjvYXjztmGtFZhqeAP2OD0addkn6XR3P5kHHs8bJ4Cg==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1779458629',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const receiveCreateAccountTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GCXZDLDI4BO3RHIYBS22RZXB5LGRRLTZUSPG6ANQQ36TVL2ASHC4ONZO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/61179570',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=262764252333858816',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=262764252333858816',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7',
    },
  },
  id: '407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7',
  paging_token: '262764252333858816',
  successful: true,
  hash: '407cf1c2f0fe8a3e88abd32cbfc7a6455e4d14c781da588098b60fb8c4a40ad7',
  ledger: 61179570,
  created_at: '2026-02-11T04:29:26Z',
  source_account: 'GCXZDLDI4BO3RHIYBS22RZXB5LGRRLTZUSPG6ANQQ36TVL2ASHC4ONZO',
  source_account_sequence: '186837700216085701',
  fee_account: 'GCXZDLDI4BO3RHIYBS22RZXB5LGRRLTZUSPG6ANQQ36TVL2ASHC4ONZO',
  fee_charged: '100',
  max_fee: '50000',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAACvkaxo4F24nRgMtajm4erNGK55pJ5vAbCG/TqvQJHFxwAAw1ACl8fmAAfcxQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAHAm8AAAAAAAAAAAFAkcXHAAAAQD3XvfCJJ6+ujb9pBqcd9iaRqM/o8ASmBLWx0qeqbBSE640bUs33zgoeTpzb+1X0nd5FT5mzd6VZefARddOhDww=',
  result_xdr: 'AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMDpYYsAAAAAAAAAACvkaxo4F24nRgMtajm4erNGK55pJ5vAbCG/TqvQJHFxwAAFAZIchDlApfH5gAH3MQAAAAGAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAOlhiwAAAAAaYwCmgAAAAAAAAABA6WGsgAAAAAAAAAAr5GsaOBduJ0YDLWo5uHqzRiueaSebwGwhv06r0CRxccAABQGSHIQgQKXx+YAB9zEAAAABgAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADpYYsAAAAAGmMApoAAAAA',
  memo_type: 'none',
  signatures: [
    'Pde98Iknr66Nv2kGpx32JpGoz+jwBKYEtbHSp6psFITrjRtSzffOCh5OnNv7VfSd3kVPmbN3pVl58BF106EPDA==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const sep41SendTransactionResponse = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/62962656',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=270422548390797312',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=270422548390797312',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087',
    },
  },
  id: '059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087',
  paging_token: '270422548390797312',
  successful: true,
  hash: '059e3ac03f3c8afede96749d3b70cc6e9ef258e12522bc6b01b07aad89931087',
  ledger: 62962656,
  created_at: '2026-06-10T05:56:31Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343032',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '261359',
  max_fee: '462673',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAHD1EDpYayAAABOAAAAAEAAAAAAAAAAAAAAABqKP0yAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABUJCNuWl5ffQp4UubCGGQlOf1oePWbkmkbFiwPwbj+lYAAAAIdHJhbnNmZXIAAAADAAAAEgAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAASAAAAAAAAAAB3r4GKMkdyMhEmYxrb+PKIqz3WmlQhYpBX1KvVgptyRwAAAAoAAAAAAAAAAAAAAAAAAAAEAAAAAQAAAAAAAAAAAAAAAVCQjblpeX30KeFLmwhhkJTn9aHj1m5JpGxYsD8G4/pWAAAACHRyYW5zZmVyAAAAAwAAABIAAAAAAAAAAD9BNkCUnPhicTJ00X5jDK52WV5J5fA719ZgBEJTD0i2AAAAEgAAAAAAAAAAd6+BijJHcjIRJmMa2/jyiKs91ppUIWKQV9Sr1YKbckcAAAAKAAAAAAAAAAAAAAAAAAAABAAAAAAAAAABAAAAAAAAAAIAAAAGAAAAAVCQjblpeX30KeFLmwhhkJTn9aHj1m5JpGxYsD8G4/pWAAAAFAAAAAEAAAAH8RB4OU/QazmStCdGEafEeAlwe9zmElTP+m3UD8qtNk8AAAACAAAABgAAAAFQkI25aXl99CnhS5sIYZCU5/Wh49ZuSaRsWLA/BuP6VgAAABAAAAABAAAAAgAAAA8AAAAHQmFsYW5jZQAAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAEAAAAGAAAAAVCQjblpeX30KeFLmwhhkJTn9aHj1m5JpGxYsD8G4/pWAAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAAAAAAAAHevgYoyR3IyESZjGtv48oirPdaaVCFikFfUq9WCm3JHAAAAAQAVr0gAAAAAAAABKAAAAAAABw7tAAAAAVMPSLYAAABAcMXx4F+t8hAoNYtTlctxgtmw3GIg05utVvXCYGpvHi918rvzu/DMqVth9unx/5weCZM/F8Ug6eYJbXZlcUe2Dg==',
  result_xdr:
    'AAAAAAAD/O8AAAAAAAAAAQAAAAAAAAAYAAAAAL2CQGqqemD/+19Sfpe1ASLEBKfmLa0+KglIExU5adiUAAAAAA==',
  fee_meta_xdr:
    'AAAAAgAAAAMDwLtWAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAA08JSuA6WGsgAAATcAAAAJAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPAl0QAAAAAaignTgAAAAAAAAABA8C74AAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAANOmFXQOlhrIAAAE3AAAACQAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAADwJdEAAAAAGooJ04AAAAA',
  memo_type: 'none',
  signatures: [
    'cMXx4F+t8hAoNYtTlctxgtmw3GIg05utVvXCYGpvHi918rvzu/DMqVth9unx/5weCZM/F8Ug6eYJbXZlcUe2Dg==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1781071154',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const contractSwapReceiveNativeTransactionResponse = {
  _links: {
    self: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/d81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d',
    },
    account: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/accounts/GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
    },
    ledger: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/ledgers/64157023',
    },
    operations: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/d81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/d81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions?order=asc\u0026cursor=275552315594575872',
    },
    succeeds: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions?order=desc\u0026cursor=275552315594575872',
    },
    transaction: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/d81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d',
    },
  },
  id: 'd81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d',
  paging_token: '275552315594575872',
  successful: true,
  hash: 'd81cd563c9354138f569eebc569f44a278b9fb79fe6b7d3286445a3575e9c58d',
  ledger: 64157023,
  created_at: '2026-08-28T02:27:30Z',
  source_account: 'GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
  source_account_sequence: '266080959223302122',
  fee_account: 'GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
  fee_charged: '221820',
  max_fee: '761852',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAABvoRWhalyzq3GFzdiqjGcsLO5RoXIV+FP/k+EAVvgJnQALn/wDsU85AAAH6gAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAAId2l0aGRyYXcAAAAFAAAACQAAAAAAAAAAAAAAACNFk80AAAAJAAAAAAAAAGDr3rlti2+P1AAAABIAAAABJbT82FmuwvpjSEOMSJs8PBDJi20hvk/TyzDLaJU++XcAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAA0AAABBROSOJIpGEHWGwC9BHu0Pa412fK8sheSpUJctJRGTPRVkfpj98771fJVUNJlFqgQhcJC8B3l7PMz8XyHBQ0G7gwEAAAAAAAAAAAAAAQAAAAAAAAADAAAABgAAAAEltPzYWa7C+mNIQ4xImzw8EMmLbSG+T9PLMMtolT75dwAAABQAAAABAAAABgAAAAGXZfW4lXVkw3UNOcAwZyVUR4OdbqD9LX7Ttpqp5rWBCgAAABQAAAABAAAAB8x0rLVv0B71YLXUQ81Y/hHVrL7ODkABYS67MQIPyS+XAAAAAwAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAGAAAAASW0/NhZrsL6Y0hDjEibPDwQyYttIb5P08swy2iVPvl3AAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAABAAAABgAAAAGXZfW4lXVkw3UNOcAwZyVUR4OdbqD9LX7Ttpqp5rWBCgAAABAAAAABAAAAAgAAAA8AAAANV2l0aGRyYXdOb25jZQAAAAAAAAkAAAAAAAAAYOveuW2Lb4/UAAAAAQBSClgAAADAAAACGAAAAAAAA/7cAAAAAVb4CZ0AAABAh5W9CMxNdeOyGeipks289GbH024KEl7l/mTlmDW2wVVRiR/DOA2bqf8YOzHebrYKOBcCvZi8Xof8sKRHEyV1Bw==',
  result_xdr:
    'AAAAAAADYnwAAAAAAAAAAQAAAAAAAAAYAAAAAD5exoUVFKIfjqtGDeDr9Pef8RxDqRRD3ewJzwkaKgziAAAAAA==',
  result_meta_xdr:
    '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',
  fee_meta_xdr:
    'AAAAAgAAAAMD0vPjAAAAAAAAAABvoRWhalyzq3GFzdiqjGcsLO5RoXIV+FP/k+EAVvgJnQAAAAAlIuASA7FPOQAAB+kAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPS8+MAAAAAapDpmQAAAAAAAAABA9L1XwAAAAAAAAAAb6EVoWpcs6txhc3YqoxnLCzuUaFyFfhT/5PhAFb4CZ0AAAAAJR7g0gOxTzkAAAfpAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAAD0vPjAAAAAGqQ6ZkAAAAA',
  memo_type: 'none',
  signatures: [
    'h5W9CMxNdeOyGeipks289GbH024KEl7l/mTlmDW2wVVRiR/DOA2bqf8YOzHebrYKOBcCvZi8Xof8sKRHEyV1Bw==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const contractSwapReceiveUSDCTransactionResponse = {
  _links: {
    self: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869',
    },
    account: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/accounts/GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
    },
    ledger: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/ledgers/64236092',
    },
    operations: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions?order=asc\u0026cursor=275891914363961344',
    },
    succeeds: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions?order=desc\u0026cursor=275891914363961344',
    },
    transaction: {
      href: 'https://archive.stellar.validationcloud.io/v1/wd71cvymMEBizGDwPgpah1KH6Ao6kGP5lYpZewqWi2U/transactions/c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869',
    },
  },
  id: 'c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869',
  paging_token: '275891914363961344',
  successful: true,
  hash: 'c076b610a6c55ae8bb7f14ae9a913b82442baac4c9afe61762e6d67479217869',
  ledger: 64236092,
  created_at: '2026-09-02T07:27:39Z',
  source_account: 'GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
  source_account_sequence: '266080959223302357',
  fee_account: 'GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
  fee_charged: '222205',
  max_fee: '762276',
  operation_count: 1,
  envelope_xdr:
    'AAAAAgAAAABvoRWhalyzq3GFzdiqjGcsLO5RoXIV+FP/k+EAVvgJnQALoaQDsU85AAAI1QAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAAId2l0aGRyYXcAAAAFAAAACQAAAAAAAAAAAAAAAAHDBxAAAAAJAAAAAAAAAGDyHYQ7zUJPrAAAABIAAAABre/OWa7lKWj3YGHUlMJSW3Vln6QpamX0me8p5WR35JYAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAA0AAABBfjHGB+REPo60ovPxVjS8eb0AqGzfHGTMyA6wPTvaOVt88M+e1crlSAiqb9OBOPgq6z6eaIAVbJALC7iZHymgrwEAAAAAAAAAAAAAAQAAAAAAAAADAAAABgAAAAGXZfW4lXVkw3UNOcAwZyVUR4OdbqD9LX7Ttpqp5rWBCgAAABQAAAABAAAABgAAAAGt785ZruUpaPdgYdSUwlJbdWWfpClqZfSZ7ynlZHfklgAAABQAAAABAAAAB8x0rLVv0B71YLXUQ81Y/hHVrL7ODkABYS67MQIPyS+XAAAAAwAAAAEAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAABVVNEQwAAAAA7mRE4Dv6Yi6CokA6xz+RPNm99vpRr7QdyQPf2JN8VxQAAAAYAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAAQAAAAAQAAAAIAAAAPAAAADVdpdGhkcmF3Tm9uY2UAAAAAAAAJAAAAAAAAAGDyHYQ7zUJPrAAAAAEAAAAGAAAAAa3vzlmu5Slo92Bh1JTCUlt1ZZ+kKWpl9JnvKeVkd+SWAAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAABAFJpQQAAAHQAAAHMAAAAAAAEAIQAAAABVvgJnQAAAEDoyzcNlloQIahqoLe9fe6WcagM+6KRVmfdNuskIA6jAQgCR76kaLK05VUiKSVCgfn15YfIWYEEm1WZJQvhZdAC',
  result_xdr:
    'AAAAAAADY/0AAAAAAAAAAQAAAAAAAAAYAAAAAMVpgkEn0Gzs9va0NuidPSc3BDqo2Uw3/wRpopyW42PXAAAAAA==',
  result_meta_xdr:
    'AAAABAAAAAAAAAACAAAAAwPUKjwAAAAAAAAAAG+hFaFqXLOrcYXN2KqMZyws7lGhchX4U/+T4QBW+AmdAAAAACIChjYDsU85AAAI1AAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAMAAAAAA9QmZgAAAABql7oRAAAAAAAAAAED1Co8AAAAAAAAAABvoRWhalyzq3GFzdiqjGcsLO5RoXIV+FP/k+EAVvgJnQAAAAAiAoY2A7FPOQAACNUAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPUKjwAAAAAapfP6wAAAAAAAAABAAAAAAAAAAYAAAADA9Qp3QAAAAYAAAAAAAAAAa3vzlmu5Slo92Bh1JTCUlt1ZZ+kKWpl9JnvKeVkd+SWAAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAABAAAAEQAAAAEAAAADAAAADwAAAAZhbW91bnQAAAAAAAoAAAAAAAAAAAAAJZ6OFahbAAAADwAAAAphdXRob3JpemVkAAAAAAAAAAAAAQAAAA8AAAAIY2xhd2JhY2sAAAAAAAAAAAAAAAAAAAABA9QqPAAAAAYAAAAAAAAAAa3vzlmu5Slo92Bh1JTCUlt1ZZ+kKWpl9JnvKeVkd+SWAAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAABAAAAEQAAAAEAAAADAAAADwAAAAZhbW91bnQAAAAAAAoAAAAAAAAAAAAAJZ6MUqFLAAAADwAAAAphdXRob3JpemVkAAAAAAAAAAAAAQAAAA8AAAAIY2xhd2JhY2sAAAAAAAAAAAAAAAAAAAAAA9QqPAAAAAmxr0PFipYOeHmwD+xXMdilq5AGi8seF2KEnetJ4fOH1APzzjsAAAAAAAAAAAPUKjwAAAAGAAAAAAAAAAGXZfW4lXVkw3UNOcAwZyVUR4OdbqD9LX7Ttpqp5rWBCgAAABAAAAABAAAAAgAAAA8AAAANV2l0aGRyYXdOb25jZQAAAAAAAAkAAAAAAAAAYPIdhDvNQk+sAAAAAQAAAAAAAAABAAAAAAAAAAMD1AICAAAAAQAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAFVU0RDAAAAADuZETgO/piLoKiQDrHP5E82b32+lGvtB3JA9/Yk3xXFAAAAAAAAAAB//////////wAAAAEAAAAAAAAAAAAAAAED1Co8AAAAAQAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAFVU0RDAAAAADuZETgO/piLoKiQDrHP5E82b32+lGvtB3JA9/Yk3xXFAAAAAAHDBxB//////////wAAAAEAAAAAAAAAAAAAAAEAAAAAAAAAAa3vzlmu5Slo92Bh1JTCUlt1ZZ+kKWpl9JnvKeVkd+SWAAAAAQAAAAAAAAAEAAAADwAAAAh0cmFuc2ZlcgAAABIAAAABl2X1uJV1ZMN1DTnAMGclVEeDnW6g/S1+07aaqea1gQoAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAA4AAAA9VVNEQzpHQTVaU0VKWUIzN0pSQzVBVkNJQTVNT1A0UkhUTTMzNVgyS0dYM0lIT0pBUFA1UkUzNEs0S1pWTgAAAAAAAAoAAAAAAAAAAAAAAAABwwcQAAAAAAAAAAEAAAAAAAAAAQAAAAEAAAAAAAAAAA==',
  fee_meta_xdr:
    'AAAAAgAAAAMD1CZmAAAAAAAAAABvoRWhalyzq3GFzdiqjGcsLO5RoXIV+FP/k+EAVvgJnQAAAAAiBoceA7FPOQAACNQAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPUJmYAAAAAape6EQAAAAAAAAABA9QqPAAAAAAAAAAAb6EVoWpcs6txhc3YqoxnLCzuUaFyFfhT/5PhAFb4CZ0AAAAAIgKGNgOxTzkAAAjUAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAAD1CZmAAAAAGqXuhEAAAAA',
  memo_type: 'none',
  signatures: [
    '6Ms3DZZaECGoaqC3vX3ulnGoDPuikVZn3TbrJCAOowEIAke+pGiytOVVIiklQoH59eWHyFmBBJtVmSUL4WXQAg==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const sponsorSendTransaction = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/64345664',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=276362522519736320',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=276362522519736320',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48',
    },
  },
  id: 'b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48',
  paging_token: '276362522519736320',
  successful: true,
  hash: 'b639186040b13c19b5397f8da2b7ecaba9ede234981232e452b87a3a48c30a48',
  ledger: 64345664,
  created_at: '2026-09-09T10:11:46Z',
  source_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  source_account_sequence: '262764252333343491',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '300',
  max_fee: '600',
  operation_count: 3,
  envelope_xdr:
    'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAlgDpYayAAADAwAAAAAAAAAAAAAAAwAAAAEAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAQAAAAALUHFLs1Zdr0Xxpjx90c7ucKzz6dA51o19xWDK/3jYDTAAAAAQAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAAAAAAtQcUuzVl2vRfGmPH3Rzu5wrPPp0DnWjX3FYMr/eNgNMAAAAAAAAAAAAAAAEAAAAAtQcUuzVl2vRfGmPH3Rzu5wrPPp0DnWjX3FYMr/eNgNMAAAARAAAAAAAAAAJTD0i2AAAAQGLsoocTvdW8jpi/fkqmMRJjWf86e0N13QSx0QGD01dDYXIsUPiuCEsDnKYdux/+0oLfhY3IlHPc/m0TZ0daiwX3jYDTAAAAQDJCHohgd5Wn75GB4RabuXWnOBPMVjN/3h8z7fUn3Ya4fB/uwGpOyPmP7gRdsC3ZASRrC5Nv3OnR8IKOaxqeKww=',
  result_xdr:
    'AAAAAAAAASwAAAAAAAAAAwAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMD1FSMAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAU6/8/A6WGsgAAAwIAAAANAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAADAAAAAAPUVIwAAAAAapjBbAAAAAAAAAABA9XWQAAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAAFOv+EwOlhrIAAAMCAAAADQAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAwAAAAAD1FSMAAAAAGqYwWwAAAAA',
  memo_type: 'none',
  signatures: [
    'YuyihxO91byOmL9+SqYxEmNZ/zp7Q3XdBLHRAYPTV0NhcixQ+K4ISwOcph27H/7Sgt+FjciUc9z+bRNnR1qLBQ==',
    'MkIeiGB3lafvkYHhFpu5dac4E8xWM3/eHzPt9Sfdhrh8H+7Aak7I+Y/uBF2wLdkBJGsLk2/c6dHwgo5rGp4rDA==',
  ],
} as unknown as Horizon.ServerApi.TransactionRecord;

export const claimBalanceTransaction = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GAFAMBT2J33HWILDBA6TUWC4MQ4FDRC5IFO2NWI56GFMJ7RLKS4EXRPL',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/64324333',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=276270906572230656',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=276270906572230656',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab',
    },
  },
  id: '903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab',
  paging_token: '276270906572230656',
  successful: true,
  hash: '903109a831a0ca505ee3077d0e88321abcf202b5b23db08339aa0dd036f9ddab',
  ledger: 64324333,
  created_at: '2026-09-08T01:08:03Z',
  source_account: 'GAFAMBT2J33HWILDBA6TUWC4MQ4FDRC5IFO2NWI56GFMJ7RLKS4EXRPL',
  source_account_sequence: '265899213387208641',
  fee_account: 'GAFAMBT2J33HWILDBA6TUWC4MQ4FDRC5IFO2NWI56GFMJ7RLKS4EXRPL',
  fee_charged: '8500',
  max_fee: '2380000',
  operation_count: 85,
  envelope_xdr:
    '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',
  result_xdr:
    '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',
  fee_meta_xdr:
    'AAAAAgAAAAMD1YLsAAAAAAAAAAAKBgZ6TvZ7IWMIPTpYXGQ4UcRdQV2m2R3xisT+K1S4SwAAAfOtdsYzA7Cp7QAAF8AAAAALAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAABAAACbCsFCjkAAAAAAAAAAAAAAAIAAAAAAAZU6gAAAAAAAAADAAAAAAPVguwAAAAAap9f7gAAAAAAAAABA9WC7QAAAAAAAAAACgYGek72eyFjCD06WFxkOFHEXUFdptkd8YrE/itUuEsAAAHzrXak/wOwqe0AABfAAAAACwAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAQAAAmwrBQo5AAAAAAAAAAAAAAACAAAAAAAGVOoAAAAAAAAAAwAAAAAD1YLsAAAAAGqfX+4AAAAA',
  memo_type: 'none',
  signatures: [
    'wvW3pk/mv691ZDiM0cIuHb+EtGf0lHDrT8aFtRCCqEEvV204vTY4WRHmgq4u7k2BJ/U1Rq3ZTrNw8V1RVNImDg==',
  ],
  preconditions: {
    timebounds: {
      min_time: '0',
      max_time: '1788829793',
    },
  },
} as unknown as Horizon.ServerApi.TransactionRecord;

export const feeBumpTransaction = {
  _links: {
    self: {
      href: 'https://horizon.stellar.org/transactions/523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124',
    },
    account: {
      href: 'https://horizon.stellar.org/accounts/GB327AMKGJDXEMQREZRRVW7Y6KEKWPOWTJKCCYUQK7KKXVMCTNZEOYXU',
    },
    ledger: {
      href: 'https://horizon.stellar.org/ledgers/64357885',
    },
    operations: {
      href: 'https://horizon.stellar.org/transactions/523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124/operations{?cursor,limit,order}',
      templated: true,
    },
    effects: {
      href: 'https://horizon.stellar.org/transactions/523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124/effects{?cursor,limit,order}',
      templated: true,
    },
    precedes: {
      href: 'https://horizon.stellar.org/transactions?order=asc\u0026cursor=276415011315068928',
    },
    succeeds: {
      href: 'https://horizon.stellar.org/transactions?order=desc\u0026cursor=276415011315068928',
    },
    transaction: {
      href: 'https://horizon.stellar.org/transactions/523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124',
    },
  },
  id: '523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124',
  paging_token: '276415011315068928',
  successful: true,
  hash: '523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124',
  ledger: 64357885,
  created_at: '2026-09-10T05:09:45Z',
  source_account: 'GB327AMKGJDXEMQREZRRVW7Y6KEKWPOWTJKCCYUQK7KKXVMCTNZEOYXU',
  source_account_sequence: '269911571835125815',
  fee_account: 'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
  fee_charged: '200',
  max_fee: '2000',
  operation_count: 1,
  envelope_xdr:
    'AAAABQAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAAAAfQAAAAAgAAAAB3r4GKMkdyMhEmYxrb+PKIqz3WmlQhYpBX1KvVgptyRwAAAGQDvuslAAAANwAAAAAAAAAAAAAAAQAAAAAAAAABAAAAALUHFLs1Zdr0Xxpjx90c7ucKzz6dA51o19xWDK/3jYDTAAAAAAAAAAAAmJaAAAAAAAAAAAGCm3JHAAAAQGjWI8qJLEZIefdAIUzU3WQQPqF2mwvrRKy2sTckiFZUUtVz5hZlA70741MsNmYdJYXu9zaMt1l4F1jWd6IFOAcAAAAAAAAAAVMPSLYAAABAuHui/ym4tHxCPWwbI8HHLCIXlVChq4SSyaNuBJ9aosCnjGoSe5jfMKeS10JhTBLLcEw6aBHkXD2WSrx9/Xo4Bg==',
  result_xdr:
    'AAAAAAAAAMgAAAABWd67dvSQLULlTI8BFOn084ICg/dUc3DFhdsMh3/OUN0AAAAAAAAAAAAAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAA=',
  fee_meta_xdr:
    'AAAAAgAAAAMD1gWnAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAAN8rR8A6WGsgAAAwYAAAANAAAAAQAAAADEccZDcGLJUGqJNC5TihraQE0vQc8dOiVfQyH3xuDhdQAAAAAAAAAJbG9ic3RyLmNvAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAgAAAAAAAAADAAAAAAPWBWIAAAAAaqI4NwAAAAAAAAABA9YF/QAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAAADfKztAOlhrIAAAMGAAAADQAAAAEAAAAAxHHGQ3BiyVBqiTQuU4oa2kBNL0HPHTolX0Mh98bg4XUAAAAAAAAACWxvYnN0ci5jbwAAAAEAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAwAAAAAD1gViAAAAAGqiODcAAAAA',
  memo_type: 'none',
  signatures: [
    'uHui/ym4tHxCPWwbI8HHLCIXlVChq4SSyaNuBJ9aosCnjGoSe5jfMKeS10JhTBLLcEw6aBHkXD2WSrx9/Xo4Bg==',
  ],
  fee_bump_transaction: {
    hash: '523419fd6e7ba151d400271f264c49d1f45853dd61808a37f822c5c1105e5124',
    signatures: [
      'uHui/ym4tHxCPWwbI8HHLCIXlVChq4SSyaNuBJ9aosCnjGoSe5jfMKeS10JhTBLLcEw6aBHkXD2WSrx9/Xo4Bg==',
    ],
  },
  inner_transaction: {
    hash: '59debb76f4902d42e54c8f0114e9f4f3820283f7547370c585db0c877fce50dd',
    signatures: [
      'aNYjyoksRkh590AhTNTdZBA+oXabC+tErLaxNySIVlRS1XPmFmUDvTvjUyw2Zh0lhe73Noy3WXgXWNZ3ogU4Bw==',
    ],
    max_fee: '100',
  },
} as unknown as Horizon.ServerApi.TransactionRecord;
