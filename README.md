# Playwright ステータス一括変更ツール

スプレッドシートのステータス列を判別し、同じ行にある自社管理画面のURLを開いて
ステータスをドロップダウンで変更・保存し、スプレッドシートの該当行を更新します。

## 処理フロー

```
スプレッドシート
 ┌──────────┬──────────┬────────────────────────────────┐
 │  A列     │  B列     │  C列                           │
 │ (状態)   │ (条件)   │ (管理画面URL)                  │
 ├──────────┼──────────┼────────────────────────────────┤
 │ 未処理   │ 対象     │ https://admin.example.com/123  │  ← 処理対象
 │ 処理済み │ 対象     │ https://admin.example.com/124  │  ← スキップ
 │ 未処理   │ 除外     │ https://admin.example.com/125  │  ← B列で除外
 └──────────┴──────────┴────────────────────────────────┘
        ↓ 条件一致行のみ
 管理画面を開いてドロップダウン操作 → 保存
        ↓ 成功後
 A列を「処理済み」に更新
```

## 必要なもの

- Node.js 18 以上
- Google Cloud プロジェクト（Sheets API 有効化済み）
- Google サービスアカウント（スプレッドシートの編集権限付き）

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
npx playwright install chromium
```

### 2. サービスアカウントキーの配置

Google Cloud Console でサービスアカウントキー（JSON）をダウンロードし、
プロジェクトルートに `service-account.json` として配置します。

スプレッドシートをサービスアカウントのメールアドレスに **編集者** として共有してください。

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して必要な値を設定します。

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `SPREADSHEET_ID` | スプレッドシートID（URLから取得） | `1BxiMVs...` |
| `SHEET_NAME` | シート名 | `Sheet1` |
| `TRIGGER_STATUS_A` | 処理対象とするA列の値 | `未処理` |
| `TRIGGER_STATUS_B` | 処理対象とするB列の値（空欄でチェック無し） | `対象` |
| `COMPLETED_STATUS` | 処理後にA列に書き込む値 | `処理済み` |
| `ADMIN_DROPDOWN_SELECTOR` | ドロップダウンのCSSセレクター | `select[name="status"]` |
| `ADMIN_DROPDOWN_VALUE` | 選択するvalue値 | `approved` |
| `ADMIN_SAVE_SELECTOR` | 保存ボタンのCSSセレクター | `button[type="submit"]` |
| `ADMIN_SUCCESS_SELECTOR` | 完了確認セレクター（省略可） | `.alert-success` |

### 4. 管理画面の Google 認証を保存（初回のみ）

```bash
npm run setup-auth
```

ブラウザが起動するので、管理画面で Google ログインを完了してください。
Enter キーを押すと `auth/state.json` に認証状態が保存されます。

## 実行

```bash
npm start
```

### オプション: ヘッドレスモード

`.env` で `HEADLESS=true` に設定するとブラウザを表示せずに実行できます。

## ファイル構成

```
playright_ikkatsumodoshi/
├── src/
│   ├── config.ts        # 環境変数の読み込みと設定
│   ├── sheets.ts        # Google Sheets API 操作
│   ├── admin.ts         # 管理画面の Playwright 操作
│   ├── main.ts          # メイン処理（エントリポイント）
│   └── setup-auth.ts    # Google 認証セットアップ
├── auth/
│   └── state.json       # 認証状態（自動生成・.gitignore対象）
├── .env                 # 環境変数（.gitignore対象）
├── .env.example         # 環境変数のテンプレート
├── service-account.json # サービスアカウントキー（.gitignore対象）
└── package.json
```

## カスタマイズのヒント

### 管理画面のセレクターが分からない場合

1. `.env` で `HEADLESS=false` に設定
2. `npm start` を実行してブラウザを表示
3. 管理画面が開いたら F12 → Elements で該当要素を右クリック → 「Copy selector」

### ステータス判定を複雑にしたい場合

`src/sheets.ts` の `readTargetRows()` 内のフィルタリングロジックを変更してください。

```typescript
// 例: A列が「未処理」かつ B列が空でない行を対象にする
const matchA = statusA === config.triggerStatusA;
const matchB = statusB !== '';
```

### 認証が切れた場合

```bash
npm run setup-auth
```

を再実行して認証状態を更新してください。
