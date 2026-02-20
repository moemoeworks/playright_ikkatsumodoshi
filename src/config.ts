import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`環境変数 ${key} が設定されていません。.env を確認してください。`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/** 列文字 (A, B, C...) を0始まりインデックスに変換 */
export function columnLetterToIndex(col: string): number {
  const upper = col.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

const checkColumnA = optional('CHECK_COLUMN_A', 'A');
const checkColumnB = optional('CHECK_COLUMN_B', 'B');
const urlColumn    = optional('URL_COLUMN', 'C');
const updateColumn = optional('UPDATE_COLUMN', 'A');

export const config = {
  // --- Google Sheets ---
  spreadsheetId:        required('SPREADSHEET_ID'),
  sheetName:            optional('SHEET_NAME', 'Sheet1'),
  serviceAccountKeyPath: path.resolve(optional('SERVICE_ACCOUNT_KEY_PATH', './service-account.json')),
  startRow:             parseInt(optional('START_ROW', '2')),

  // --- 列設定 ---
  checkColumnA,
  checkColumnB,
  urlColumn,
  updateColumn,

  // インデックス（0始まり）
  checkColumnAIndex: columnLetterToIndex(checkColumnA),
  checkColumnBIndex: columnLetterToIndex(checkColumnB),
  urlColumnIndex:    columnLetterToIndex(urlColumn),
  updateColumnIndex: columnLetterToIndex(updateColumn),

  // --- ステータス値 ---
  triggerStatusA:  optional('TRIGGER_STATUS_A', '未処理'),
  triggerStatusB:  optional('TRIGGER_STATUS_B', ''),
  completedStatus: optional('COMPLETED_STATUS', '処理済み'),

  // --- 管理画面 ---
  adminDropdownSelector: optional('ADMIN_DROPDOWN_SELECTOR', 'select[name="status"]'),
  adminDropdownValue:    optional('ADMIN_DROPDOWN_VALUE', ''),
  adminSaveSelector:     optional('ADMIN_SAVE_SELECTOR', 'button[type="submit"]'),
  adminSuccessSelector:  optional('ADMIN_SUCCESS_SELECTOR', ''),
  pageLoadTimeout:       parseInt(optional('PAGE_LOAD_TIMEOUT', '10000')),

  // --- 認証 ---
  authStoragePath: path.resolve(optional('AUTH_STORAGE_PATH', './auth/state.json')),

  // --- 動作設定 ---
  headless:           optional('HEADLESS', 'false') !== 'false',
  delayBetweenRows:   parseInt(optional('DELAY_BETWEEN_ROWS', '2000')),
} as const;
