# 移行チェックリスト

## A. 旧 PC
- [ ] `claude --version` / `claude mcp list` / `/status` / `/memory` / `/plugin` の結果を記録した
- [ ] `bz-office` を OneDrive 配下に移動し、「常にこのデバイス上に保持する」にした
- [ ] `_private/clients.local.md` を作成した（`.example` からコピーして正式名称を記入）
- [ ] `export-claude-config.ps1`（Mac: `.sh`）を実行し `_private/claude-export/` ができた
- [ ] Claude Desktop を完全終了してから `export-desktop-data.ps1 -IncludeCodeSessions` を実行し `_private/claude-export/desktop/` ができた（Cowork 履歴）
- [ ] OneDrive が同期済み（緑チェック）になった

## B. ミニ PC
- [ ] Windows Update 完了、ユーザー名を旧 PC と揃えた（または違いを把握した）
- [ ] OneDrive サインイン、`bz-office` を「常にこのデバイス上に保持する」、同期完了
- [ ] `_private/clients.local.md` が見える
- [ ] Claude Desktop インストール・ログイン
- [ ] Claude Code インストール、`bz-office` で `claude` → `/login` → フォルダ信頼
- [ ] `import-claude-config.ps1` を実行した
- [ ] Claude Desktop を一度起動・ログインしてから完全終了し、`import-desktop-data.ps1` を実行 → 再起動 → Cowork のサイドバーに旧 PC のセッションが出た
- [ ] Desktop のコネクタを再接続し、プロジェクトのフォルダを選び直した
- [ ] 取り込み後、OneDrive 上の `_private/claude-export/desktop/` を削除した
- [ ] MCP サーバーを再登録した / プラグインを再インストールした
- [ ] `02_work/digirise` で起動し「ワークスペース: 株式会社デジライズ」と宣言される
- [ ] `/context` に ルート・`02_work`・`digirise` の CLAUDE.md が出る
- [ ] `/memory` で自動メモリの場所を確認した（必要なら旧 `memory/` を移動）
- [ ] `bz-office/.claude/settings.json` の deny / ask を `~/.claude/settings.json` に統合した（§3-5b）
- [ ] `client-a のフォルダにある資料を参考にして` と送り、承認を求めて止まることを確認した

## C. 常時稼働
- [ ] スリープ「なし」、アクティブ時間を設定
- [ ] BitLocker 有効、PIN / Windows Hello 設定
- [ ] 自動サインイン（必要な場合のみ。リスクを理解した上で）
- [ ] Claude Desktop をスタートアップに登録
- [ ] Remote Control: Desktop の「新しいセッションを Remote Control に接続する」オン（または `claude remote-control` の常駐）
- [ ] 権限モードは default のまま

## D. iPhone
- [ ] Claude アプリにログイン
- [ ] Code タブにミニ PC のセッションが出る
- [ ] 試しに「ファイル一覧を見せて」と送り、許可プロンプトを iPhone で承認できた
- [ ] 通知を許可した
- [ ] （任意）信頼済みデバイスを有効化し iPhone とミニ PC を登録

## E. 旧 PC の後始末（移行完了後）
- [ ] 旧 PC での Claude 作業をやめる、または OneDrive の同期が完了してから使う運用に切り替えた
- [ ] 旧 PC を手放す場合: `claude purge --all`、`%USERPROFILE%\.claude\` と `%USERPROFILE%\.claude.json` を削除、Claude Desktop からログアウト、OneDrive のリンク解除
