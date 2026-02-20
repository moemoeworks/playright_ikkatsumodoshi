/**
 * setup-auth.ts
 *
 * 管理画面の Google 認証状態を保存するためのセットアップスクリプト。
 * 初回のみ実行が必要です。
 *
 * 使い方:
 *   npm run setup-auth
 *
 * ブラウザが開いたら、管理画面で Google ログインを完了してください。
 * ログイン完了後、このスクリプトを終了すると認証状態が保存されます。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { chromium } from 'playwright';
import { config } from './config';

function waitForEnter(message: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main(): Promise<void> {
  console.log('=== Google 認証セットアップ ===\n');

  // auth ディレクトリを作成
  const authDir = path.dirname(config.authStoragePath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log(`ディレクトリを作成: ${authDir}`);
  }

  console.log('ブラウザを起動します（ヘッド付きモード）...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Google のログインページを開く
  console.log('\n管理画面の URL を入力してください:');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const adminUrl = await new Promise<string>((resolve) => {
    rl.question('管理画面 URL: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (adminUrl) {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto('https://accounts.google.com', { waitUntil: 'domcontentloaded' });
  }

  console.log('\n');
  console.log('--------------------------------------------------');
  console.log('ブラウザが開きました。');
  console.log('管理画面で Google ログインを完了してください。');
  console.log('ログイン完了後、Enter キーを押して認証状態を保存します。');
  console.log('--------------------------------------------------\n');

  await waitForEnter('ログインが完了したら Enter を押してください...');

  // 認証状態を保存
  await context.storageState({ path: config.authStoragePath });
  console.log(`\n認証状態を保存しました: ${config.authStoragePath}`);
  console.log('次回から `npm start` で自動実行できます。\n');

  await browser.close();
}

main().catch((err) => {
  console.error('エラーが発生しました:', err);
  process.exit(1);
});
