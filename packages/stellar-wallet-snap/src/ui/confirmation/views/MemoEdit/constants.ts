export const MemoEditFormNames = {
  Open: 'memo-edit-open',
  Input: 'memo-edit-input',
  Save: 'memo-edit-save',
  Back: 'memo-edit-back',
} as const;

export type MemoEditFormNames =
  (typeof MemoEditFormNames)[keyof typeof MemoEditFormNames];
