export const MemoEditFormNames = {
  Open: 'memo-edit-open',
  Form: 'memo-edit-form',
  Input: 'memo-edit-input',
  Save: 'memo-edit-save',
  Back: 'memo-edit-back',
} as const;

export type MemoEditFormNames =
  (typeof MemoEditFormNames)[keyof typeof MemoEditFormNames];
