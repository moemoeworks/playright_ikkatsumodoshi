import { Page } from 'playwright';
import { config } from './config';

/**
 * 管理画面を開き、ステータスをドロップダウンで変更・保存する
 *
 * @param page  Playwright の Page オブジェクト
 * @param url   管理画面の URL（スプレッドシートの URL 列から取得）
 */
export async function changeAdminStatus(page: Page, url: string): Promise<void> {
  console.log(`  [Admin] ページを開いています: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.pageLoadTimeout });

  // --- Google ログインが求められた場合の検出 ---
  // ログインページ（accounts.google.com）にリダイレクトされた場合はエラーとして扱う
  if (page.url().includes('accounts.google.com')) {
    throw new Error(
      'Google ログインが要求されました。先に `npm run setup-auth` を実行して認証状態を保存してください。'
    );
  }

  // --- ドロップダウンの操作 ---
  console.log(`  [Admin] ドロップダウン (${config.adminDropdownSelector}) を待機中...`);
  await page.waitForSelector(config.adminDropdownSelector, { timeout: config.pageLoadTimeout });

  await page.selectOption(config.adminDropdownSelector, config.adminDropdownValue);
  console.log(`  [Admin] ドロップダウンで "${config.adminDropdownValue}" を選択しました`);

  // --- 保存ボタンのクリック ---
  console.log(`  [Admin] 保存ボタン (${config.adminSaveSelector}) をクリック中...`);
  await page.click(config.adminSaveSelector);

  // --- 保存完了の確認 ---
  if (config.adminSuccessSelector) {
    console.log(`  [Admin] 完了確認セレクター (${config.adminSuccessSelector}) を待機中...`);
    await page.waitForSelector(config.adminSuccessSelector, { timeout: config.pageLoadTimeout });
    console.log(`  [Admin] 保存完了を確認しました`);
  } else {
    // セレクターが未設定の場合はページ遷移・安定を待つ
    await page.waitForLoadState('domcontentloaded');
    console.log(`  [Admin] 保存完了（ページ安定を確認）`);
  }
}
