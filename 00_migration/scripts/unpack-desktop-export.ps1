# ミニ PC: OneDrive に置かれた desktop.7z.001... を C:\cx に展開し、続けて import-desktop-data.ps1 を実行する
param(
  [string]$Source = "",
  [string]$Target = "C:\cx",
  [switch]$NoImport
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Source) { $Source = Join-Path $root "_private\claude-export" }
$parts = @(Get-ChildItem $Source -Filter "desktop.7z.*" -ErrorAction SilentlyContinue | Sort-Object Name)
if ($parts.Count -eq 0) { throw "$Source に desktop.7z.001 がありません。旧 PC で pack-desktop-export.ps1 を実行し、OneDrive の同期完了を待ってください。" }

# OneDrive のオンラインのみファイルをローカルに取り寄せる
foreach ($p in $parts) { attrib +P -U "$($p.FullName)" | Out-Null }
$offline = $parts | Where-Object { ($_.Attributes -band 0x1000) -or ($_.Attributes -band 0x400000) }
if ($offline) { Write-Host "注意: OneDrive からダウンロード中のファイルがあります。展開中に自動で取り寄せますが、時間がかかります。" }

$7z = "C:\Program Files\7-Zip\7z.exe"
if (-not (Test-Path $7z)) {
  Write-Host "7-Zip をインストールします（winget）"
  winget install --id 7zip.7zip -e --accept-source-agreements --accept-package-agreements
}
if (-not (Test-Path $7z)) { throw "7-Zip が見つかりません。https://www.7-zip.org/ からインストールして再実行してください。" }

Write-Host "archive : $($parts[0].FullName)（$($parts.Count) 個）"
Write-Host "target  : $Target"
New-Item -ItemType Directory -Force -Path $Target | Out-Null
& $7z x "$($parts[0].FullName)" -o"$Target" -y | Select-String -Pattern "Everything is Ok|Error|WARNING" | ForEach-Object { Write-Host "  " $_.Line }
if ($LASTEXITCODE -gt 1) { throw "7-Zip の展開がエラーで終了しました（code $LASTEXITCODE）。書庫のダウンロードが終わっているか確認してください。" }
if (-not (Test-Path (Join-Path $Target "desktop-manifest.json"))) { throw "展開後に desktop-manifest.json が見つかりません。" }
Write-Host "展開完了。"
if ($NoImport) { Write-Host "次に: import-desktop-data.ps1 -Source $Target を実行してください。"; exit 0 }
& (Join-Path $PSScriptRoot "import-desktop-data.ps1") -Source $Target
