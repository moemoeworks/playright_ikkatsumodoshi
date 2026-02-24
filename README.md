# Playwright ステータス一括変更ツール

スプレッドシートのステータス列を判別し、同じ行にある自社管理画面の URL を開いて
ステータスをドロップダウンで変更・保存し、スプレッドシートの該当行を更新します。

## 処理フロー

```
スプレッドシート（当日のタブを自動選択）
 ┌──────────┬──────────┬─────┬────────────────────────────────┐
 │  AG列    │  AH列    │ ... │  C列                           │
 │ (状態)   │ (除外)   │     │ (管理画面URL)                  │
 ├──────────┼──────────┼─────┼────────────────────────────────┤
 │ 戻し     │          │     │ https://admin.example.com/123  │  ← 処理対象
 │ 処理済み │          │     │ https://admin.example.com/124  │  ← AG列が対象外のためスキップ
 │ 戻し     │ユーザー… │     │ https://admin.example.com/125  │  ← AH列で除外
 └──────────┴──────────┴─────┴────────────────────────────────┘
        ↓ 条件一致行のみ
 管理画面を開いてドロップダウン操作 → 保存
        ↓ 成功後
 AG列を「処理済み」に更新
```

## 必要なもの

- Node.js 18 以上

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
npx playwright install chromium
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して必要な値を設定します。

| 変数名 | 必須 | 説明 | 例 |
|--------|------|------|-----|
| `SPREADSHEET_URL` | ✅ | スプレッドシートの URL（ブラウザのアドレスバーからコピー） | `https://docs.google.com/spreadsheets/d/1Bxi.../edit?gid=0` |
| `SHEET_DATE_FORMAT` | | タブ名の日付フォーマット（空欄で URL の gid を固定使用） | `M/D`、`YYYY-MM-DD`、`M月D日` |
| `TRIGGER_STATUS_A_LIST` | | 処理対象とする AG 列の値（カンマ区切りで複数可） | `戻し,解体車` |
| `TRIGGER_STATUS_B_EXCLUDE` | | スキップする AH 列の値 | `ユーザーキャンセル` |
| `COMPLETED_STATUS` | | 処理完了後に AG 列へ書き込む値 | `処理済み` |
| `ADMIN_VALUE_MAP` | ✅ | AG 列の値 → ドロップダウン値のマッピング（JSON） | `{"戻し":"戻し（都度）","解体車":"解体（都度戻し）"}` |
| `ADMIN_DROPDOWN_SELECTOR` | ✅ | ドロップダウンの CSS セレクター | `select[name="status"]` |
| `ADMIN_SAVE_SELECTOR` | ✅ | 保存ボタンの CSS セレクター | `button[type="submit"]` |
| `ADMIN_SUCCESS_SELECTOR` | | 完了確認セレクター（省略可） | `.alert-success` |
| `CHECK_COLUMN_A` | | ステータス確認列（デフォルト: AG） | `AG` |
| `CHECK_COLUMN_B` | | 除外条件列（デフォルト: AH） | `AH` |
| `URL_COLUMN` | | 管理画面 URL の列（デフォルト: C） | `C` |
| `HEADLESS` | | `true` でブラウザ非表示（デフォルト: false） | `true` |

### 3. 管理画面の認証を保存（初回のみ）

```bash
npm run setup-auth
```

ブラウザが起動するので、管理画面で Google ログインを完了してください。
Enter キーを押すと `auth/state.json` に認証状態が保存されます。

## 実行

```bash
npm start
```

## ファイル構成

```
playright_ikkatsumodoshi/
├── src/
│   ├── config.ts        # 環境変数の読み込みと設定
│   ├── sheets.ts        # Google Sheets をブラウザで操作（読み書き）
│   ├── admin.ts         # 管理画面の Playwright 操作
│   ├── main.ts          # メイン処理（エントリポイント）
│   └── setup-auth.ts    # 認証セットアップ
├── auth/
│   └── state.json       # 認証状態（自動生成・.gitignore対象）
├── .env                 # 環境変数（.gitignore対象）
├── .env.example         # 環境変数のテンプレート
└── package.json
```

## カスタマイズのヒント

### 管理画面のセレクターが分からない場合

1. `.env` で `HEADLESS=false` に設定
2. `npm start` を実行してブラウザを表示
3. 管理画面が開いたら F12 → Elements で該当要素を右クリック → 「Copy selector」

### 日付タブのフォーマットを変更したい場合

`SHEET_DATE_FORMAT` で以下のパターンが使えます：

| パターン | 説明 | 例（2026年2月24日） |
|---------|------|-----|
| `YYYY` | 西暦4桁 | `2026` |
| `YY` | 西暦下2桁 | `26` |
| `M` | 月（ゼロ埋めなし） | `2` |
| `MM` | 月（ゼロ埋め） | `02` |
| `D` | 日（ゼロ埋めなし） | `24` |
| `DD` | 日（ゼロ埋め） | `24` |

例: `M/D` → `2/24`、`M月D日` → `2月24日`

`SHEET_DATE_FORMAT` を空欄にすると、`SPREADSHEET_URL` の `gid=` で指定したタブを常に使用します。

### 認証が切れた場合

```bash
npm run setup-auth
```

を再実行して認証状態を更新してください。
