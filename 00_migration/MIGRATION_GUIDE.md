# Claude 環境 移行ガイド（旧 PC → 常時稼働ミニ PC）

作成日: 2026-11-03
対象: 河合寿士（bz-office）の Claude Code / Claude Desktop 環境

## 0. 結論（この移行で作る形）

```
          ┌──────────── OneDrive（デスクトップアプリで同期）────────────┐
          │  OneDrive\bz-office\   ← 作業ルート。指示(CLAUDE.md)・成果物・_private  │
          └──────────────────────────────────────────────────────┘
                 ▲ 同期                                   ▲ 同期
   ┌─────────────┴────────────┐              ┌─────────────┴────────────┐
   │ 旧 PC                     │              │ ミニ PC（常時稼働）          │
   │ %USERPROFILE%\.claude\    │  1 回コピー   │ %USERPROFILE%\.claude\    │
   │ (PC ごとに持つ。同期しない) │ ───────────▶ │ (PC ごとに持つ。同期しない) │
   └──────────────────────────┘              └─────────────┬────────────┘
                                                            │ Remote Control
                                                            ▼
                                                   iPhone の Claude アプリ
                                                   （指示・承認・進捗確認）
```

| 何を | どう持ち回るか |
|---|---|
| 指示（CLAUDE.md の階層）、ひな型、成果物、`_private/` | **OneDrive** の `bz-office` フォルダに置く。両 PC で同じ相対パスに同期される |
| Claude Code の個人設定（`~/.claude/settings.json`、`~/.claude/CLAUDE.md`、自作スキル、自動メモリ） | 旧 PC から **1 回だけコピー**（後述のスクリプト）。`~/.claude` フォルダ自体は OneDrive に置かない |
| ログイン情報、MCP サーバー登録 | コピーしない。ミニ PC で **再ログイン・再登録** |
| claude.ai のチャット履歴・プロジェクト、Cowork のスキル / プラグイン / コネクタ | **アカウントに紐づく**ので何もしなくてよい（同じアカウントでログインすれば出る） |
| iPhone からの操作 | ミニ PC で **Remote Control** を常時オンにし、iPhone の Claude アプリから接続 |

> `~/.claude` を OneDrive に置かない理由: セッション中に頻繁に書き換わる `projects/*.jsonl`、`sessions/`、ロックファイルが同期衝突を起こし、履歴破損の原因になります。設定は 1 回コピーで十分です。

---

## 1. 移行対象の棚卸し

### 1-1. Claude Code（CLI / Desktop の Code タブ 共通）
場所: Windows `%USERPROFILE%\.claude\`（例 `C:\Users\<ユーザー名>\.claude\`）、Mac `~/.claude/`

| ファイル / フォルダ | 内容 | 移行 |
|---|---|---|
| `settings.json` | 個人設定（権限ルール、モデル、フック、`remoteControlAtStartup` 等） | **コピー** |
| `CLAUDE.md` | 全プロジェクト共通の個人指示 | **コピー**（この移行では中身を `00_migration/home-claude-templates/CLAUDE.md` に置き換えてもよい） |
| `rules/` | 個人ルール（あれば） | コピー |
| `skills/<自作スキル>/` | 自作スキル | **コピー**（`skills/synced/` は claude.ai から自動同期されるので不要） |
| `agents/`, `commands/`, `output-styles/`, `workflows/` | 自作サブエージェント・コマンド等（あれば） | コピー |
| `keybindings.json`, `themes/` | キー割当・テーマ（あれば） | コピー |
| `projects/<プロジェクト>/memory/` | **自動メモリ**（Claude が学んだ本人の好み・訂正） | コピー推奨。ただしフォルダ名はプロジェクトの絶対パスから作られるため、**両 PC で作業ルートの絶対パスが同じ** ときだけそのまま使える（§3-1 参照） |
| `projects/<プロジェクト>/*.jsonl` | 会話の記録（`claude --resume` 用） | 任意。古い会話を再開しないなら不要 |
| `history.jsonl` | 入力したプロンプト履歴（↑キー補完） | 任意 |
| `plugins/` | インストール済みプラグイン | コピーせず、ミニ PC で `claude plugin` から再インストール。`plugins/synced/` は自動同期 |
| `.credentials.json` | **ログイン資格情報** | **コピーしない**。ミニ PC で `/login` |
| `~/.claude.json`（`.claude` の外、ホーム直下） | アカウント情報、**ユーザー スコープの MCP サーバー**、フォルダごとの信頼判定 | **コピーしない**。MCP は旧 PC で `claude mcp list` を控えて再登録 |
| `shell-snapshots/`, `session-env/`, `backups/`, `debug/`, `file-history/`, `paste-cache/` | 一時データ | 不要 |

### 1-2. Claude Desktop（チャット / Cowork）
| 項目 | 移行 |
|---|---|
| ログイン、チャット履歴、プロジェクト | アカウント同期。何もしない |
| Cowork の スキル / プラグイン / コネクタ（Customize） | アカウント同期。何もしない（ミニ PC の `~/.claude/skills/synced/` に自動で降りてくる） |
| Desktop チャット用の MCP 設定 `claude_desktop_config.json` | 使っていれば **内容を控えて** ミニ PC で再設定。Windows の保存先は `%APPDATA%\Claude\`。ストア版（MSIX）では `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` に実体がある報告があり、アプリの「設定 › 開発者 › 構成を編集」から開くのが確実 |
| コネクタ（Google Drive, Slack 等）の認可 | PC ごとに再認可が必要なものがある。初回利用時に案内が出る |

### 1-3. 作業フォルダ（このリポジトリ）
`bz-office/` 全体。OneDrive に置くことで移行も日々の共有も完了する。

---

## 2. 旧 PC で行うこと（移行元）

### 2-1. 現状を記録する（5 分）
Claude Code を起動して次を実行し、結果を `00_migration/inventory_old_pc.md`（Git 管理外にしたい場合は `_private/`）に貼る。

```bash
claude --version
```
```bash
claude mcp list
```
Claude Code のセッション内で:
```
/status
```
```
/memory
```
```
/plugin
```
- `/status` の「Setting sources」に出るファイルが、コピー対象の設定ファイル。
- `/memory` に出る自動メモリのフォルダ名（`projects/<...>/memory`）を控える。
- `/plugin` でインストール済みプラグイン名を控える。

### 2-2. 作業フォルダを OneDrive に移す
1. OneDrive デスクトップアプリにサインインし、同期フォルダ（通常 `C:\Users\<ユーザー名>\OneDrive`）を確認する。
2. この `bz-office` フォルダを `OneDrive\bz-office` に移動（または GitHub から clone）する。
3. エクスプローラーで `bz-office` を右クリック →「**常にこのデバイス上に保持する**」。
   （ファイル オンデマンドのままだと、Claude が開いた瞬間にダウンロードが走り、読み取り失敗や遅延の原因になる）
4. 同期完了（緑チェック）を待つ。

### 2-3. `~/.claude` の持ち出し用コピーを作る
PowerShell で `00_migration/scripts/export-claude-config.ps1` を実行する（Mac は `export-claude-config.sh`）。
`OneDrive\bz-office\_private\claude-export\` に、§1-1 で「コピー」と書いたものだけが集まる。資格情報（`.credentials.json`, `.claude.json`）は含めない。

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\OneDrive\bz-office\00_migration\scripts\export-claude-config.ps1"
```

---

## 3. ミニ PC で行うこと（移行先）

### 3-1. OS とパスの準備
1. Windows Update を済ませ、**旧 PC と同じ Windows ユーザー名** でアカウントを作る（推奨）。
   - 理由: Claude Code は自動メモリの保存先フォルダ名を「作業フォルダの絶対パス」から作る。`C:\Users\<同じ名前>\OneDrive\bz-office` が一致すれば、旧 PC の自動メモリと会話履歴がそのまま使える。
   - ユーザー名が違う場合: 自動メモリは `projects/` 配下のフォルダ名を新パスに合わせてリネームすれば引き継げる（§3-5）。会話履歴（jsonl）はリネームだけでは完全に引き継げないことがあるので、諦めてよい。
2. OneDrive デスクトップアプリにサインイン →「`bz-office`」を「常にこのデバイス上に保持する」→ 同期完了を待つ。
3. `_private/clients.local.md` が降りてきていることを確認（Git には無いので、OneDrive 同期の確認になる）。

### 3-2. Claude のインストール
1. **Claude Desktop**（Windows）を https://claude.ai/download からインストールし、同じアカウントでログイン。
2. **Claude Code**（CLI）: PowerShell で
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
   （npm 派なら `npm install -g @anthropic-ai/claude-code`。どちらか一方で良い）
3. `OneDrive\bz-office` で `claude` を起動 → `/login` → フォルダの信頼確認に `y`。
4. `claude --version` が旧 PC と同じかそれ以上であることを確認。

### 3-3. 設定の取り込み
PowerShell で `00_migration/scripts/import-claude-config.ps1` を実行する。
`_private\claude-export\` の内容を `%USERPROFILE%\.claude\` に **上書きせず追記**（既存ファイルは `.bak` に退避）でコピーする。

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\OneDrive\bz-office\00_migration\scripts\import-claude-config.ps1"
```

手動でやる場合は §1-1 の「コピー」行だけを `%USERPROFILE%\.claude\` に置く。

### 3-4. 再登録が必要なもの
- **MCP サーバー**: 旧 PC の `claude mcp list` の結果を見ながら `claude mcp add ...` で再登録。
- **プラグイン**: `/plugin` から再インストール。
- **Desktop チャットの MCP**（使っていれば）: 設定 › 開発者 › 構成を編集。
- **コネクタの再認可**: 初回利用時に案内に従う。

### 3-5. 自動メモリの引き継ぎ（パスが違う場合のみ）
`%USERPROFILE%\.claude\projects\` の中に、旧 PC のパス由来の名前（例 `C--Users-old-OneDrive-bz-office`）のフォルダがある。
ミニ PC で一度 `bz-office` から `claude` を起動すると新しい名前のフォルダができるので、旧フォルダの `memory\` を新フォルダの `memory\` に移動する。

### 3-6. 動作確認
`OneDrive\bz-office\02_work\digirise` で `claude` を起動し、「このワークスペースはどこ？」と聞く。
→ ルート・`02_work`・`digirise` の 3 つの CLAUDE.md を読んで「ワークスペース: 株式会社デジライズ」と宣言すれば OK。
`/context` で読み込まれた CLAUDE.md の一覧、`/memory` で自動メモリの場所を確認する。

---

## 4. 常時稼働の設定（ミニ PC）

### 4-1. 電源・サインイン
- 設定 › システム › 電源: 画面オフは任意、**スリープは「なし」**。
- Windows Update の「アクティブ時間」を作業時間帯に合わせ、再起動は深夜に寄せる。再起動後に自動で復帰する構成にする（下記）。
- 再起動後も無人で Claude が立ち上がるには **自動サインイン** が必要（`netplwiz` のチェック外し、または Sysinternals Autologon）。
  - **セキュリティ注意**: 自動サインインは物理アクセスされると中身を見られる。BitLocker を有効にし、設置場所を限定し、Windows Hello / PIN でロック画面からの復帰は守る。クライアント情報を扱う PC なので、ここは省略しない。
- Claude Desktop を「スタートアップ」に登録（`shell:startup` にショートカット、またはアプリ設定で起動時に開く）。

### 4-2. Remote Control を常時オン
どちらか一方で良い。**A が簡単**。

**A. Claude Desktop に任せる（推奨）**
1. Desktop › 設定 › **Code**（または **Claude Code**）›「**新しいセッションを Remote Control に接続する**（Connect new sessions to Remote Control）」をオン。
2. Code タブで `OneDrive\bz-office` を開いたセッションを作る。以後、新規セッションは自動で iPhone / claude.ai/code に出る。

**B. CLI のサーバーモードを常駐させる**
1. `%USERPROFILE%\.claude\settings.json` に `"remoteControlAtStartup": true`（テンプレートに記載済み）。
2. タスク スケジューラで「ログオン時」に次を実行:
   ```powershell
   claude remote-control --name "bz-office" --permission-mode default
   ```
   開始フォルダ: `C:\Users\<ユーザー名>\OneDrive\bz-office`
   初回は手動で一度実行し、`Enable Remote Control? (y/n)` に `y`、フォルダの信頼に `y` を答えておく（無人実行では質問に答えられず終了するため）。
3. 停止後 4 時間以内なら同じフォルダで `claude remote-control` を再実行すると元のセッションが戻る。

### 4-3. 承認を iPhone でできるようにする
- 権限モードは **default**（都度確認）のままにする。`bypassPermissions` や `auto` は使わない。ルート `CLAUDE.md` の「実行前の承認」はこのモードで初めて機能する。
- iPhone 側は許可プロンプトがそのまま表示され、タップで承認 / 拒否できる。
- 通知: iPhone の Claude アプリで通知を許可すると、承認待ちや完了を受け取れる。
- 任意: claude.ai › 設定 › アカウントで **信頼済みデバイス（Require trusted devices）** をオンにすると、iPhone / 各 PC を登録した端末だけが Remote Control を操作できる。Face ID で 18 時間ごとの再確認になる。

### 4-4. もう一つの入口: Dispatch
iPhone の Claude アプリから「タスクを送る」と、Desktop（ミニ PC）の Cowork が受け取って実行する機能。長めの依頼を投げて放置するのに向く。設定はアプリ内の案内に従って Desktop とペアリングする。

---

## 5. iPhone で行うこと
1. App Store から **Claude** アプリをインストールし、同じアカウントでログイン。
2. Claude Code（Code）タブ → セッション一覧にミニ PC のセッション（名前は `--name` またはホスト名由来）が出る。
3. QR で素早く開く: ミニ PC 側のセッションで `/remote-control` を実行すると QR コードが出る。
4. ファイルや写真を添付すると、ミニ PC の `~/.claude/uploads/` に保存されて Claude に渡る。

---

## 6. 日々の運用ルール（OneDrive 共有）
1. **同時に作業しない**（前提どおり）。切り替えるときは、前の PC の OneDrive が「同期済み」になっているのを見てから次の PC で開く。
2. 同期衝突が起きると `ファイル名-<PC名>.md` のような複製ができる。見つけたら中身を比べて 1 つに戻す。
3. `.claude/settings.local.json`（「今後確認しない」で保存された許可）は PC ごとに別。片方で許可した操作は、もう片方では再度聞かれる。意図的な仕様として受け入れる。
4. Git への push は **ルート `CLAUDE.md` 第 3 項**: `_private/` と各部門フォルダの実データは `.gitignore` 済みだが、`git add` 前に必ず差分を見る。
5. 作業ルートの CLAUDE.md 群を変えたら、どちらの PC でも次のセッションから反映される（起動時に読むため、起動中のセッションには反映されない）。

---

## 7. トラブルシュート
| 症状 | 確認 |
|---|---|
| iPhone にセッションが出ない | ミニ PC で `claude` プロセスが生きているか。Desktop のセッション詳細の Remote Control スイッチ。スリープしていないか |
| 「Workspace not trusted」で止まる | 無人起動前に一度手動で `claude` を起動し、フォルダの信頼に `y` |
| 自動メモリが引き継がれない | `/memory` で現在の保存先を確認し、§3-5 の通り旧フォルダから `memory\` を移動 |
| CLAUDE.md が読まれていない | `/context` の Memory files を見る。サブフォルダの CLAUDE.md はそのフォルダ内のファイルを触った時点で読まれる（起動時ではない） |
| OneDrive の衝突ファイルが増える | 「常にこのデバイス上に保持する」になっているか。両 PC で同時に開いていないか |
| ログインが切れる | `/login` し直す。Remote Control は API キーでは使えないので claude.ai ログインを使う |

---

## 8. 参照した公式ドキュメント
- Remote Control: https://code.claude.com/docs/en/remote-control
- `.claude` ディレクトリの中身と、消してよいもの: https://code.claude.com/docs/en/claude-directory
- CLAUDE.md の読み込み順・自動メモリ: https://code.claude.com/docs/en/memory
- 設定ファイルと優先順位: https://code.claude.com/docs/en/settings
- Desktop アプリ: https://code.claude.com/docs/en/desktop
