# ミニ PC: export-desktop-data.ps1 で持ち出した Claude Desktop のローカル履歴を取り込む
# 事前条件: Claude Desktop をインストールして一度起動・ログイン済み、かつ今は完全終了していること。
# 既存のアプリデータは削除せず .bak.<日時> に退避する。
param([string]$Source = "")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Source) { $Source = Join-Path $root "_private\claude-export\desktop" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$manifestPath = Join-Path $Source "desktop-manifest.json"
if (-not (Test-Path $manifestPath)) { throw "$manifestPath がありません。旧 PC で export-desktop-data.ps1 を実行し、OneDrive の同期完了を待ってください。" }
$m = Get-Content $manifestPath -Raw | ConvertFrom-Json

# 0) 同期が終わっているか（ファイル数と総バイト数をマニフェストと比較）
$files = Get-ChildItem $Source -Recurse -Force -File | Where-Object { $_.Name -ne "desktop-manifest.json" -and $_.Name -ne "robocopy-export.log" }
$bytes = ($files | Measure-Object Length -Sum).Sum
if ($files.Count -lt $m.fileCount -or $bytes -lt $m.totalBytes) {
  throw "OneDrive の同期が終わっていないようです（期待 $($m.fileCount) ファイル / $($m.totalBytes) bytes、現在 $($files.Count) / $bytes）。緑チェックになってから再実行してください。"
}
if ($m.failedFiles -gt 0) { Write-Host "注意: 旧 PC 側のエクスポートで $($m.failedFiles) 件のコピー失敗がありました（旧 PC の robocopy-export.log 参照）。" }
if ($m.user -ne $env:USERNAME) { Write-Host "注意: 旧 PC のユーザー名 $($m.user) と異なります（現在 $env:USERNAME）。Code セッションや定期タスクのパスが合わない可能性があります。" }

# 1) Claude Desktop が動いていないか
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "*\Claude.exe" -and $_.Path -notlike "*\.local\bin\*" }
if ($running) { throw "Claude Desktop が起動中です。タスクトレイから終了し、タスクマネージャーに Claude.exe が無いことを確認してから再実行してください。" }

# 2) 取り込み先のアプリデータの場所
$pkgDirs = @(Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue)
$target = $null
if ($pkgDirs.Count -gt 0) { $target = Join-Path $pkgDirs[0].FullName "LocalCache\Roaming\Claude" } else { $target = Join-Path $env:APPDATA "Claude" }
if (-not (Test-Path $target)) { throw "取り込み先 $target がありません。先に Claude Desktop をインストールして一度起動・ログインし、完全終了してから再実行してください。" }
$isMsix = $target -like "*\Packages\Claude_*"
$pkgRoot = if ($isMsix) { ($target -split "\\LocalCache\\")[0] } else { "" }
Write-Host "target appData : $target"

# 3) 既存アプリデータを退避して差し替え
$bak = "$target.bak.$stamp"
Move-Item $target $bak
Write-Host "  backup -> $bak"
New-Item -ItemType Directory -Force -Path $target | Out-Null
robocopy (Join-Path $Source "appdata") $target /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
foreach ($f in @("host-creds-*.json","ccd-environment-config.json","cowork-enabled-cli-ops.json")) { Get-ChildItem $target -Filter $f -ErrorAction SilentlyContinue | Remove-Item -Force }
if (Test-Path (Join-Path $target "ccd-session-secrets")) { Remove-Item (Join-Path $target "ccd-session-secrets") -Recurse -Force }
Get-ChildItem (Join-Path $target "spaces-present") -Recurse -Filter "link-key" -ErrorAction SilentlyContinue | Remove-Item -Force
Write-Host "  placed appdata\ (ant-did, local-agent-mode-sessions, claude-code-sessions ...)"

# 4) vm_bundles
if (Test-Path (Join-Path $Source "vm_bundles")) {
  $vmTarget = $null
  if ($m.vmKind -like "msix:*" -and $isMsix) { $vmTarget = Join-Path $pkgRoot $m.vmKind.Substring(5) }
  elseif ($m.vmKind -like "abs:*") { $vmTarget = $m.vmKind.Substring(4) }
  else { $vmTarget = Join-Path $env:LOCALAPPDATA "Claude\vm_bundles" }
  if (Test-Path $vmTarget) { Move-Item $vmTarget "$vmTarget.bak.$stamp"; Write-Host "  backup -> $vmTarget.bak.$stamp" }
  New-Item -ItemType Directory -Force -Path $vmTarget | Out-Null
  robocopy (Join-Path $Source "vm_bundles") $vmTarget /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Host "  placed vm_bundles -> $vmTarget"
}

# 5) 成果物フォルダ ~\Claude（上書きなしでマージ）
if (Test-Path (Join-Path $Source "home-Claude")) {
  $hc = if ($m.homeClaude -like "*\Documents\Claude") { "$env:USERPROFILE\Documents\Claude" } else { "$env:USERPROFILE\Claude" }
  robocopy (Join-Path $Source "home-Claude") $hc /E /XC /XN /XO /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Host "  merged $hc"
}

# 6) Code タブの会話記録（あれば。上書きなしでマージ）
if (Test-Path (Join-Path $Source "projects-full")) {
  robocopy (Join-Path $Source "projects-full") "$env:USERPROFILE\.claude\projects" /E /XC /XN /XO /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Host "  merged ~\.claude\projects"
}

Write-Host ""
Write-Host "done. 次の手順:"
Write-Host "  1. PC を再起動する"
Write-Host "  2. Claude Desktop を起動し、求められたら同じアカウントでログインする"
Write-Host "  3. Cowork のサイドバーに旧 PC のセッションが出ることを確認する"
Write-Host "  4. コネクタ（Google Drive 等）は再接続が必要。プロジェクトのフォルダも選び直す"
Write-Host "  5. 問題なければ OneDrive 上の $Source を削除して容量を戻す（旧 PC には元データが残っている）"
Write-Host "  出なかった場合: $bak と $target の ant-did を比べ、違っていたら旧 PC で再エクスポートする"
