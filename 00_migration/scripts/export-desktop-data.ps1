# 旧 PC: Claude Desktop（Cowork / Chat / Code タブ）のローカル履歴を持ち出し用にコピーする
# 対象: アプリデータ(local-agent-mode-sessions など)、vm_bundles、~\Claude（成果物）、任意で ~\.claude\projects 全体
# 事前に Claude Desktop を完全終了すること（ウィンドウを閉じるだけでは不十分。トレイから終了）。削除は一切しない。
param(
  [string]$Destination = "",
  [switch]$IncludeCodeSessions
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Destination) { $Destination = Join-Path $root "_private\claude-export\desktop" }

# 0) Claude Desktop が動いていないか
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like "*\Claude.exe" -and $_.Path -notlike "*\.local\bin\*" }
if ($running) { throw "Claude Desktop が起動中です。タスクトレイの Claude アイコンを右クリックして終了し、タスクマネージャーに Claude.exe が無いことを確認してから再実行してください。" }

# 1) アプリデータの場所を探す（ストア版 MSIX → 従来版 の順）
$pkgDirs = @(Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue)
$candidates = @()
foreach ($p in $pkgDirs) { $candidates += (Join-Path $p.FullName "LocalCache\Roaming\Claude") }
$candidates += (Join-Path $env:APPDATA "Claude")
$appData = $candidates | Where-Object { Test-Path (Join-Path $_ "local-agent-mode-sessions") } | Select-Object -First 1
if (-not $appData) { throw "Cowork の保存フォルダ (local-agent-mode-sessions) が見つかりません。候補: $($candidates -join ' / ')" }
$isMsix = $appData -like "*\Packages\Claude_*"
$pkgRoot = if ($isMsix) { ($appData -split "\\LocalCache\\")[0] } else { "" }

# 2) vm_bundles の場所
$vmCandidates = @()
if ($isMsix) { $vmCandidates += (Join-Path $pkgRoot "LocalCache\Local\vm_bundles"); $vmCandidates += (Join-Path $pkgRoot "LocalCache\Local\Claude\vm_bundles") }
$vmCandidates += (Join-Path $env:LOCALAPPDATA "Claude\vm_bundles")
$vmCandidates += (Join-Path $appData "vm_bundles")
$vmCandidates += "C:\ClaudeData\vm_bundles"
$vm = $vmCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$vmKind = if (-not $vm) { "" } elseif ($isMsix -and $vm -like "$pkgRoot*") { "msix:" + $vm.Substring($pkgRoot.Length + 1) } else { "abs:" + $vm }

# 3) 成果物フォルダ
$homeClaude = @("$env:USERPROFILE\Claude", "$env:USERPROFILE\Documents\Claude") | Where-Object { Test-Path $_ } | Select-Object -First 1

# 長いパス（260 文字超）でも数えられるように \\?\ 接頭辞で列挙する
function Get-TreeStats($path, $excludeNames) {
  $lp = if ($path -like "\\?\*") { $path } else { "\\?\" + $path }
  $items = @(Get-ChildItem -LiteralPath $lp -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $excludeNames -notcontains $_.Name })
  $sum = ($items | Measure-Object Length -Sum).Sum
  if (-not $sum) { $sum = 0 }
  return @{ Count = $items.Count; Bytes = [long]$sum }
}
$log = Join-Path $Destination "robocopy-export.log"
function Copy-Tree($from, $to, $extra) {
  # robocopy の戻り値 8 以上はコピー失敗あり。ERROR 行をログに残して件数を数える
  $args = @($from, $to, "/E", "/COPY:DAT", "/R:1", "/W:1", "/NDL", "/NP", "/LOG+:$log") + $extra
  & robocopy @args | Out-Null
  $code = $LASTEXITCODE
  $errs = (Select-String -Path $log -Pattern "ERROR \d+ " -ErrorAction SilentlyContinue | Where-Object { $_.Line -like "*$to*" -or $_.Line -like "*$from*" }).Count
  if ($code -ge 8) { Write-Host "  !! $from : コピーに失敗したファイルがあります（robocopy code $code）。ログ: $log" }
  return $code
}
function Get-SizeGB($p) { if ($p -and (Test-Path $p)) { [math]::Round((Get-TreeStats $p @()).Bytes / 1GB, 2) } else { 0 } }
Write-Host "source appData : $appData  ($(Get-SizeGB $appData) GB)"
Write-Host "source vm      : $vm  ($(Get-SizeGB $vm) GB)"
Write-Host "source outputs : $homeClaude  ($(Get-SizeGB $homeClaude) GB)"
Write-Host "destination    : $Destination"
$total = (Get-SizeGB $appData) + (Get-SizeGB $homeClaude)
if ($vm -and -not ($vm -like "$appData\*")) { $total += (Get-SizeGB $vm) }
if (-not (Test-Path (Split-Path -Qualifier $Destination))) { throw "出力先のドライブ $(Split-Path -Qualifier $Destination) が見つかりません。USB を挿し、エクスプローラーでドライブ文字を確認して -Destination を指定し直してください（例: -Destination D:\cx）。" }
$free = [math]::Round((Get-PSDrive (Split-Path -Qualifier $Destination).TrimEnd(':')).Free / 1GB, 2)
if ($free -lt $total + 1) { throw "出力先の空き容量が足りません（必要 約 $total GB、空き $free GB）。" }
if ($total -gt 5) { Write-Host "注意: 合計 $total GB あります。OneDrive 経由だと同期に時間がかかります。USB メモリや外付けドライブを使う場合は -Destination で指定してください。" }
if ($Destination -like "*\OneDrive\*") { Write-Host "注意: OneDrive はパス全体が 400 文字を超えるファイルを同期できません。長いパスのエラーが出た場合は、-Destination で短いパス（例: E:\cx や C:\cx）を指定し、USB などで運んでください。" }
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
if (Test-Path $log) { Remove-Item $log -Force }

# 4) アプリデータ（一時ファイルと再生成されるキャッシュは除外）
$codes = @()
$xd = @("/XD","ccd-session-secrets","Cache","Code Cache","GPUCache","DawnGraphiteCache","DawnWebGPUCache","logs")
if ($vm -and $vm -like "$appData\*") { $xd += "vm_bundles" }   # appData 内にある場合は別枠でコピーするので二重にしない
$codes += Copy-Tree $appData (Join-Path $Destination "appdata") (@(
  "/XF","host-creds-*.json","ccd-environment-config.json","cowork-enabled-cli-ops.json","link-key") + $xd)
Write-Host "  copied appdata\ (local-agent-mode-sessions, claude-code-sessions, ant-did ...)"
if ($vm) { $codes += Copy-Tree $vm (Join-Path $Destination "vm_bundles") @(); Write-Host "  copied vm_bundles\" }
if ($homeClaude) { $codes += Copy-Tree $homeClaude (Join-Path $Destination "home-Claude") @(); Write-Host "  copied home-Claude\ (成果物)" }
if ($IncludeCodeSessions -and (Test-Path "$env:USERPROFILE\.claude\projects")) {
  $codes += Copy-Tree "$env:USERPROFILE\.claude\projects" (Join-Path $Destination "projects-full") @()
  Write-Host "  copied projects-full\ (Code タブの会話記録を含む)"
}
$failed = @(Select-String -Path $log -Pattern "ERROR \d+ " -ErrorAction SilentlyContinue)
if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "!! コピーに失敗したファイル: $($failed.Count) 件（詳細: $log）"
  $failed | Select-Object -First 5 | ForEach-Object { Write-Host "   " $_.Line.Trim() }
  Write-Host "   パスが長すぎる場合は、-Destination で短いパス（例: E:\cx）を指定して再実行してください。"
}

# 5) マニフェスト（取り込み側で同期完了の確認に使う）
$stats = Get-TreeStats $Destination @("robocopy-export.log","desktop-manifest.json")
$ver = try { (Get-AppxPackage -Name "*Claude*" -ErrorAction Stop | Select-Object -First 1).Version.ToString() } catch { "" }
$antDid = if (Test-Path (Join-Path $appData "ant-did")) { Get-Content (Join-Path $appData "ant-did") -Raw } else { "" }
@{
  exportedAt = (Get-Date -Format s); computer = $env:COMPUTERNAME; user = $env:USERNAME
  desktopVersion = $ver; isMsix = $isMsix; appDataSource = $appData; vmKind = $vmKind; homeClaude = $homeClaude
  antDidPresent = [bool]$antDid; fileCount = $stats.Count; totalBytes = $stats.Bytes; failedFiles = $failed.Count
} | ConvertTo-Json | Out-File (Join-Path $Destination "desktop-manifest.json") -Encoding utf8
Write-Host "done. files: $($stats.Count)  manifest: $(Join-Path $Destination 'desktop-manifest.json')"
Write-Host "次に: ミニ PC へ運び（USB なら差し替え、OneDrive なら同期完了を待つ）、Claude Desktop を終了してから import-desktop-data.ps1 -Source <この出力先> を実行してください。"
