import { BrowserContext, Page } from 'playwright';
import { config, formatSheetDate } from './config';

export interface SheetRow {
  /** スプレッドシート上の実際の行番号（1始まり） */
  rowNumber: number;
  /** 行の全列の値 */
  values: string[];
  /** 処理を決定したトリガー値（AG列の値） */
  triggerValue: string;
}

// --- 内部: シートページのキャッシュ ---
let _sheetsPage: Page | null = null;

/** 当日のシートタブ名を返す */
function getTodaySheetName(): string | null {
  if (!config.sheetDateFormat) return null;
  return formatSheetDate(config.sheetDateFormat);
}

/**
 * CSV をパースして行の配列に変換する
 * RFC 4180 準拠（クォート内のカンマ・改行に対応）
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const row: string[] = [];
    let line = lines[i];

    while (line.length > 0 || row.length === 0) {
      if (line.startsWith('"')) {
        // クォートフィールド
        let field = '';
        let j = 1;
        while (true) {
          if (j >= line.length) {
            // 次の行へ続く（改行を含むフィールド）
            field += line.slice(j === 1 ? 1 : 0) + '\n';
            i++;
            if (i >= lines.length) break;
            line = lines[i];
            j = 0;
          } else if (line[j] === '"' && line[j + 1] === '"') {
            field += '"';
            j += 2;
          } else if (line[j] === '"') {
            j++;
            break;
          } else {
            field += line[j++];
          }
        }
        row.push(field);
        // 次の区切りへ
        if (line[j] === ',') {
          line = line.slice(j + 1);
        } else {
          break;
        }
      } else {
        // 通常フィールド（カンマまたは行末まで）
        const commaIdx = line.indexOf(',');
        if (commaIdx === -1) {
          row.push(line);
          break;
        } else {
          row.push(line.slice(0, commaIdx));
          line = line.slice(commaIdx + 1);
        }
      }
    }

    if (row.length > 0) rows.push(row);
    i++;
  }

  return rows;
}

/**
 * スプレッドシートの CSV をブラウザ経由で取得し、対象行を返す
 *
 * 対象条件:
 *   - CHECK_COLUMN_A (AG列) が triggerStatusAList のいずれかに一致
 *   - CHECK_COLUMN_B (AH列) が triggerStatusBExclude (ユーザーキャンセル) に一致しない
 */
export async function readTargetRows(context: BrowserContext): Promise<SheetRow[]> {
  const todayTab = getTodaySheetName();
  let csvUrl: string;

  if (todayTab) {
    // 当日タブ名でCSVエクスポート
    csvUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&sheet=${encodeURIComponent(todayTab)}`;
    console.log(`  [Sheets] 本日のシートタブ「${todayTab}」を読み込み中...`);
  } else {
    // gid 固定
    csvUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&gid=${config.spreadsheetGid}`;
    console.log(`  [Sheets] gid=${config.spreadsheetGid} のシートを読み込み中...`);
  }

  const response = await context.request.get(csvUrl, {
    headers: { 'Accept': 'text/csv,text/plain,*/*' },
  });

  if (!response.ok()) {
    const status = response.status();
    if (status === 302 || status === 401 || status === 403) {
      throw new Error(
        `スプレッドシートへのアクセスが拒否されました (HTTP ${status})。\n` +
        '先に `npm run setup-auth` を実行して Google アカウントにログインしてください。'
      );
    }
    throw new Error(`スプレッドシートの読み込みに失敗しました (HTTP ${status})`);
  }

  const csvText = await response.text();

  // ログインページ（HTML）が返ってきた場合の検出
  if (csvText.trimStart().startsWith('<')) {
    throw new Error(
      'スプレッドシートの取得に失敗しました（ログインページが返されました）。\n' +
      '先に `npm run setup-auth` を実行して Google アカウントにログインしてください。'
    );
  }

  const allRows = parseCsv(csvText);
  const targetRows: SheetRow[] = [];

  for (let i = config.startRow - 1; i < allRows.length; i++) {
    const rowValues = allRows[i] as string[];

    const statusA = (rowValues[config.checkColumnAIndex] ?? '').trim();
    const statusB = (rowValues[config.checkColumnBIndex] ?? '').trim();

    // AG列が対象の値（戻し / 解体車）のいずれかに一致
    const matchA = config.triggerStatusAList.includes(statusA);
    // AH列が「ユーザーキャンセル」以外
    const matchB = statusB !== config.triggerStatusBExclude;

    if (matchA && matchB) {
      targetRows.push({
        rowNumber: i + 1, // 1始まり
        values: rowValues,
        triggerValue: statusA,
      });
    }
  }

  return targetRows;
}

// --- 内部: シートページを開く（再利用） ---

/** Playwright でシートページを開き、当日タブに切り替える */
async function openSheetsPage(context: BrowserContext): Promise<Page> {
  if (_sheetsPage && !_sheetsPage.isClosed()) {
    return _sheetsPage;
  }

  const baseUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit?gid=${config.spreadsheetGid}`;
  const page = await context.newPage();
  console.log('  [Sheets] スプレッドシートを開いています...');
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Google ログインチェック
  if (page.url().includes('accounts.google.com')) {
    await page.close();
    throw new Error(
      'Google ログインが要求されました。`npm run setup-auth` を実行してください。'
    );
  }

  // グリッドが表示されるまで待機
  await page.waitForSelector('[role="grid"], .waffle-column-header-container', {
    timeout: 30000,
  });

  // 当日タブに切り替え
  const todayTab = getTodaySheetName();
  if (todayTab) {
    console.log(`  [Sheets] タブ「${todayTab}」に切り替え中...`);
    try {
      // Google Sheets のタブ要素（複数のセレクターを試行）
      const tabLocator = page.locator('[role="tab"]').filter({ hasText: todayTab }).first();
      await tabLocator.click({ timeout: 10000 });
      await page.waitForTimeout(1000);
    } catch {
      console.warn(
        `  ⚠ タブ「${todayTab}」が見つかりませんでした。\n` +
        `    SHEET_DATE_FORMAT の書式を確認するか、URL の gid で直接指定してください。`
      );
    }
  }

  _sheetsPage = page;
  return page;
}

/**
 * セルに値を書き込む（Name Box ナビゲーション）
 * Name Box: Google Sheets 左上のセル参照欄（例: "A1"）
 */
async function writeCellValue(
  context: BrowserContext,
  column: string,
  rowNumber: number,
  value: string
): Promise<void> {
  const page = await openSheetsPage(context);
  const cellAddress = `${column}${rowNumber}`;

  // Name Box をクリックしてセルアドレスを入力（複数セレクターを試行）
  const nameBoxSelectors = [
    '[aria-label="Name Box"]',
    '.t-name-box-input',
    '[class*="name-box"]',
  ];

  let focused = false;
  for (const selector of nameBoxSelectors) {
    try {
      await page.click(selector, { timeout: 3000 });
      focused = true;
      break;
    } catch {
      // 次のセレクターを試す
    }
  }

  if (!focused) {
    // フォールバック: URL 付きで再読み込み（セルをプリセレクト）
    console.warn('  ⚠ Name Box が見つかりません。URL でセルに移動します...');
    const todayTab = getTodaySheetName();
    const gid = config.spreadsheetGid;
    const rangeUrl =
      `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit` +
      `?gid=${gid}&range=${cellAddress}`;
    await page.goto(rangeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('[role="grid"]', { timeout: 30000 });
    if (todayTab) {
      const tabLocator = page.locator('[role="tab"]').filter({ hasText: todayTab }).first();
      await tabLocator.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    // 直接タイプで上書き
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    console.log(`  [Sheets] 行 ${rowNumber} の ${column}列 → "${value}" に更新しました`);
    return;
  }

  // Name Box でセルアドレスを入力してナビゲート
  await page.keyboard.press('Control+A');
  await page.keyboard.type(cellAddress);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  // セルに値を入力
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500); // 自動保存を待機

  console.log(`  [Sheets] 行 ${rowNumber} の ${column}列 → "${value}" に更新しました`);
}

/**
 * 指定行の更新列（UPDATE_COLUMN）に completedStatus を書き込む
 */
export async function markRowAsCompleted(
  context: BrowserContext,
  rowNumber: number
): Promise<void> {
  await writeCellValue(context, config.updateColumn, rowNumber, config.completedStatus);
}

/**
 * 指定行の更新列にエラーメッセージを書き込む（失敗時の記録用）
 */
export async function markRowAsError(
  context: BrowserContext,
  rowNumber: number,
  errorMessage: string
): Promise<void> {
  const errorText = `エラー: ${errorMessage.slice(0, 100)}`;
  await writeCellValue(context, config.updateColumn, rowNumber, errorText);
}

/** シートページを閉じる（処理完了後に呼び出す） */
export async function closeSheetsPage(): Promise<void> {
  if (_sheetsPage && !_sheetsPage.isClosed()) {
    await _sheetsPage.close();
  }
  _sheetsPage = null;
}
