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

/** 列文字 (A, B, ... Z, AA, AB...) を0始まりインデックスに変換 */
export function columnLetterToIndex(col: string): number {
  const upper = col.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

/** SPREADSHEET_URL からスプレッドシートIDとGIDを抽出する */
function parseSpreadsheetUrl(url: string): { spreadsheetId: string; gid: string } {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) {
    throw new Error(
      'SPREADSHEET_URL が無効です。Google スプレッドシートの URL を確認してください。\n' +
      '例: https://docs.google.com/spreadsheets/d/YOUR_ID/edit?gid=0'
    );
  }
  const gidMatch = url.match(/[?#&]gid=(\d+)/);
  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch ? gidMatch[1] : '0',
  };
}

/**
 * 日付フォーマット文字列からシートタブ名を生成する
 * パターン例: "M/D" → "2/24", "YYYY/M/D" → "2026/2/24", "M月D日" → "2月24日"
 */
export function formatSheetDate(format: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return format
    .replace('YYYY', String(y))
    .replace('YY',   String(y).slice(-2))
    .replace('MM',   String(m).padStart(2, '0'))
    .replace('DD',   String(d).padStart(2, '0'))
    .replace('M',    String(m))
    .replace('D',    String(d));
}

const spreadsheetUrl = required('SPREADSHEET_URL');
const { spreadsheetId, gid: spreadsheetGid } = parseSpreadsheetUrl(spreadsheetUrl);

const checkColumnA = optional('CHECK_COLUMN_A', 'AG');
const checkColumnB = optional('CHECK_COLUMN_B', 'AH');
const urlColumn    = optional('URL_COLUMN', 'C');
const updateColumn = optional('UPDATE_COLUMN', 'AG');

// TRIGGER_STATUS_A_LIST: カンマ区切りで複数の判別値を指定できる
// 例: "戻し,解体車"
const triggerStatusAListRaw = optional('TRIGGER_STATUS_A_LIST', optional('TRIGGER_STATUS_A', '戻し,解体車'));
const triggerStatusAList = triggerStatusAListRaw.split(',').map(s => s.trim()).filter(Boolean);

// ADMIN_VALUE_MAP: 判別値 → 管理画面ドロップダウン値 のJSONマッピング
// 例: {"戻し":"戻し（都度）","解体車":"解体（都度戻し）"}
let adminValueMap: Record<string, string> = {};
const adminValueMapRaw = optional('ADMIN_VALUE_MAP', '{"戻し":"戻し（都度）","解体車":"解体（都度戻し）"}');
try {
  adminValueMap = JSON.parse(adminValueMapRaw);
} catch {
  console.warn('⚠ ADMIN_VALUE_MAP の JSON パースに失敗しました。デフォルト値を使用します。');
  adminValueMap = { '戻し': '戻し（都度）', '解体車': '解体（都度戻し）' };
}

export const config = {
  // --- Google Sheets ---
  spreadsheetUrl,
  spreadsheetId,
  spreadsheetGid,
  startRow: parseInt(optional('START_ROW', '2')),

  /**
   * シートタブ名のフォーマット（当日の日付から自動生成）
   * 例: "M/D" → "2/24" / "YYYY/M/D" → "2026/2/24" / "M月D日" → "2月24日"
   * 空欄にすると SPREADSHEET_URL の gid で固定指定になる
   */
  sheetDateFormat: optional('SHEET_DATE_FORMAT', 'YYYY-MM-DD'),

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
  /** 処理対象とするA列の値リスト（複数可） */
  triggerStatusAList,
  /** 処理除外とするB列の値（この値の行はスキップ） */
  triggerStatusBExclude: optional('TRIGGER_STATUS_B_EXCLUDE', 'ユーザーキャンセル'),
  /** 処理完了後にUPDATE_COLUMNに書き込む値 */
  completedStatus: optional('COMPLETED_STATUS', '処理済み'),

  // --- 管理画面ドロップダウン マッピング ---
  /**
   * { "AG列の値": "ドロップダウンで選択するvalue" }
   * 例: { "戻し": "戻し（都度）", "解体車": "解体（都度戻し）" }
   */
  adminValueMap,

  // --- 管理画面（Playwright）設定 ---
  adminDropdownSelector: optional('ADMIN_DROPDOWN_SELECTOR', 'select[name="status"]'),
  adminSaveSelector:     optional('ADMIN_SAVE_SELECTOR', 'button[type="submit"]'),
  adminSuccessSelector:  optional('ADMIN_SUCCESS_SELECTOR', '.bg-blue-50'),
  pageLoadTimeout:       parseInt(optional('PAGE_LOAD_TIMEOUT', '10000')),

  // --- 認証 ---
  authStoragePath: path.resolve(optional('AUTH_STORAGE_PATH', './auth/state.json')),

  // --- 動作設定 ---
  headless:         optional('HEADLESS', 'false') !== 'false',
  delayBetweenRows: parseInt(optional('DELAY_BETWEEN_ROWS', '2000')),
  /** 処理件数の上限（0 = 無制限） */
  maxRows:          parseInt(optional('MAX_ROWS', '0')),
} as const;
