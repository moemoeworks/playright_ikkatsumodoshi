import { google } from 'googleapis';
import * as fs from 'fs';
import { config, columnLetterToIndex } from './config';

export interface SheetRow {
  /** スプレッドシート上の実際の行番号（1始まり） */
  rowNumber: number;
  /** A1記法でのセル値配列（行の全列） */
  values: string[];
}

/** Google Sheets API クライアントを初期化する */
function createSheetsClient() {
  const keyFile = JSON.parse(fs.readFileSync(config.serviceAccountKeyPath, 'utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * スプレッドシートからデータを読み込み、トリガー条件に一致する行を返す
 */
export async function readTargetRows(): Promise<SheetRow[]> {
  const sheets = createSheetsClient();

  // データ範囲全体を取得（ヘッダー含む）
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: config.sheetName,
  });

  const allRows = response.data.values ?? [];
  const targetRows: SheetRow[] = [];

  for (let i = config.startRow - 1; i < allRows.length; i++) {
    const rowValues = allRows[i] as string[];
    const statusA = (rowValues[config.checkColumnAIndex] ?? '').trim();
    const statusB = (rowValues[config.checkColumnBIndex] ?? '').trim();

    const matchA = statusA === config.triggerStatusA;
    const matchB = config.triggerStatusB === '' || statusB === config.triggerStatusB;

    if (matchA && matchB) {
      targetRows.push({
        rowNumber: i + 1, // 1始まり
        values: rowValues,
      });
    }
  }

  return targetRows;
}

/**
 * 指定行の更新列（UPDATE_COLUMN）に completedStatus を書き込む
 */
export async function markRowAsCompleted(rowNumber: number): Promise<void> {
  const sheets = createSheetsClient();

  const cellAddress = `${config.updateColumn}${rowNumber}`;
  const range = `${config.sheetName}!${cellAddress}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[config.completedStatus]],
    },
  });

  console.log(`  [Sheets] 行 ${rowNumber} の ${config.updateColumn}列 → "${config.completedStatus}" に更新しました`);
}

/**
 * 指定行の更新列にエラーメッセージを書き込む（失敗時の記録用）
 */
export async function markRowAsError(rowNumber: number, errorMessage: string): Promise<void> {
  const sheets = createSheetsClient();

  const cellAddress = `${config.updateColumn}${rowNumber}`;
  const range = `${config.sheetName}!${cellAddress}`;

  const errorText = `エラー: ${errorMessage.slice(0, 100)}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[errorText]],
    },
  });

  console.log(`  [Sheets] 行 ${rowNumber} の ${config.updateColumn}列 → エラー情報を記録しました`);
}
