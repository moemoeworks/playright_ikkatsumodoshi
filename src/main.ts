import * as fs from 'fs';
import { chromium, BrowserContext } from 'playwright';
import { config } from './config';
import {
  readTargetRows,
  markRowAsCompleted,
  markRowAsError,
  closeSheetsPage,
  getLogSheetNextRow,
  writeLogRow,
  closeLogPage,
} from './sheets';

import { changeAdminStatus } from './admin';

const LOG_HEADERS = ['実行日時', 'スプシ行番号', 'URL', 'ステータス値', '結果', 'エラー内容'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadBrowserContext(browser: import('playwright').Browser): Promise<BrowserContext> {
  if (fs.existsSync(config.authStoragePath)) {
    console.log(`認証状態を読み込み中: ${config.authStoragePath}`);
    return browser.newContext({ storageState: config.authStoragePath });
  }

  console.warn('⚠ 認証状態ファイルが見つかりません。未認証状態で起動します。');
  console.warn('  先に `npm run setup-auth` を実行してください。');
  return browser.newContext();
}

async function main(): Promise<void> {
  console.log('=== Playwright ステータス一括変更ツール ===\n');

  // --- Playwright ブラウザ起動（スプレッドシート読み込みにも使用）---
  const browser = await chromium.launch({ headless: config.headless });
  const context = await loadBrowserContext(browser);

  let successCount = 0;
  let errorCount = 0;
  let totalRows = 0;

  try {
    // --- スプレッドシートから対象行を取得（ブラウザ経由）---
    console.log('スプレッドシートから対象行を読み込み中...');
    const targetRows = await readTargetRows(context);
    totalRows = targetRows.length;

    if (config.maxRows > 0 && targetRows.length > config.maxRows) {
      targetRows.splice(config.maxRows);
      console.log(`（MAX_ROWS=${config.maxRows} のため先頭 ${config.maxRows} 件に絞り込み）\n`);
    }

    if (targetRows.length === 0) {
      const triggerList = config.triggerStatusAList.join(' / ');
      console.log(
        `処理対象なし（${config.checkColumnA}列="${triggerList}" かつ ` +
        `${config.checkColumnB}列≠"${config.triggerStatusBExclude}" の行が見つかりません）`
      );
      return;
    }

    console.log(`処理対象: ${targetRows.length} 件\n`);

    // --- ログシートの初期化 ---
    let logNextRow = 2;
    try {
      console.log(`ログシート「${config.logSheetName}」を確認中...`);
      logNextRow = await getLogSheetNextRow(context);
      if (logNextRow === 1) {
        await writeLogRow(context, 1, LOG_HEADERS);
        logNextRow = 2;
        console.log('  ヘッダーを書き込みました');
      }
      console.log(`  次の記録行: ${logNextRow}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠ ログシートの初期化に失敗しました: ${msg}`);
      console.warn('  ログへの記録はスキップされます。\n');
      logNextRow = -1; // -1 = ログ無効
    }

    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      const url = (row.values[config.urlColumnIndex] ?? '').trim();

      console.log(
        `[${i + 1}/${targetRows.length}] 行 ${row.rowNumber} を処理中...` +
        `（${config.checkColumnA}列: "${row.triggerValue}"）`
      );

      if (!url) {
        console.warn(`  ⚠ ${config.urlColumn}列のURLが空です。スキップします。`);
        await markRowAsError(context, row.rowNumber, 'URLが空のためスキップ');
        if (logNextRow > 0) {
          const ts = new Date().toLocaleString('ja-JP');
          await writeLogRow(context, logNextRow, [ts, String(row.rowNumber), '', row.triggerValue, 'エラー', 'URLが空のためスキップ']).catch(() => {});
          logNextRow++;
        }
        errorCount++;
        continue;
      }

      const page = await context.newPage();
      try {
        await changeAdminStatus(page, url, row.triggerValue);
        await markRowAsCompleted(context, row.rowNumber);
        if (logNextRow > 0) {
          const ts = new Date().toLocaleString('ja-JP');
          await writeLogRow(context, logNextRow, [ts, String(row.rowNumber), url, row.triggerValue, '成功', '']).catch(() => {});
          logNextRow++;
        }
        console.log(`  ✓ 完了\n`);
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ エラー: ${message}\n`);
        await markRowAsError(context, row.rowNumber, message).catch(() => {});
        if (logNextRow > 0) {
          const ts = new Date().toLocaleString('ja-JP');
          await writeLogRow(context, logNextRow, [ts, String(row.rowNumber), url, row.triggerValue, 'エラー', message]).catch(() => {});
          logNextRow++;
        }
        errorCount++;
      } finally {
        await page.close();
      }

      // 次の行へ進む前に待機（サーバー負荷軽減）
      if (i < targetRows.length - 1) {
        await sleep(config.delayBetweenRows);
      }
    }
  } finally {
    // シートページを閉じる
    await closeSheetsPage();
    await closeLogPage();
    // 認証状態を保存（セッションの更新を反映）
    await context.storageState({ path: config.authStoragePath });
    await browser.close();
  }

  console.log('=== 完了 ===');
  console.log(`成功: ${successCount} 件 / エラー: ${errorCount} 件 / 合計: ${totalRows} 件`);
}

main().catch((err) => {
  console.error('予期しないエラーが発生しました:', err);
  process.exit(1);
});
