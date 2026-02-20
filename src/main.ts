import * as fs from 'fs';
import { chromium, BrowserContext } from 'playwright';
import { config } from './config';
import { readTargetRows, markRowAsCompleted, markRowAsError } from './sheets';
import { changeAdminStatus } from './admin';

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

  // --- スプレッドシートから対象行を取得 ---
  console.log('スプレッドシートから対象行を読み込み中...');
  const targetRows = await readTargetRows();

  if (targetRows.length === 0) {
    console.log(`処理対象なし（${config.checkColumnA}列="${config.triggerStatusA}" の行が見つかりません）`);
    return;
  }

  console.log(`処理対象: ${targetRows.length} 件\n`);

  // --- Playwright ブラウザ起動 ---
  const browser = await chromium.launch({ headless: config.headless });
  const context = await loadBrowserContext(browser);

  let successCount = 0;
  let errorCount = 0;

  try {
    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      const url = (row.values[config.urlColumnIndex] ?? '').trim();

      console.log(`[${i + 1}/${targetRows.length}] 行 ${row.rowNumber} を処理中...`);

      if (!url) {
        console.warn(`  ⚠ ${config.urlColumn}列のURLが空です。スキップします。`);
        await markRowAsError(row.rowNumber, 'URLが空のためスキップ');
        errorCount++;
        continue;
      }

      const page = await context.newPage();
      try {
        await changeAdminStatus(page, url);
        await markRowAsCompleted(row.rowNumber);
        console.log(`  ✓ 完了\n`);
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ エラー: ${message}\n`);
        await markRowAsError(row.rowNumber, message).catch(() => {});
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
    // 認証状態を保存（セッションの更新を反映）
    await context.storageState({ path: config.authStoragePath });
    await browser.close();
  }

  console.log('=== 完了 ===');
  console.log(`成功: ${successCount} 件 / エラー: ${errorCount} 件 / 合計: ${targetRows.length} 件`);
}

main().catch((err) => {
  console.error('予期しないエラーが発生しました:', err);
  process.exit(1);
});
