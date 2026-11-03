# 旧 PC: export-desktop-data.ps1 で C:\cx などに書き出した内容を 7-Zip で書庫にまとめ、OneDrive に置く
# 書庫にすると中のパスの長さは OneDrive の制限（400 文字）に影響しない。2 GB ごとの分割書庫にする。
param(
  [string]$Source = "C:\cx",
  [string]$Destination = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Destination) { $Destination = Join-Path $root "_private\claude-export" }
if (-not (Test-Path (Join-Path $Source "desktop-manifest.json"))) { throw "$Source に desktop-manifest.json がありません。先に export-desktop-data.ps1 -Destination $Source を実行してください。" }

# 7-Zip の用意
$7z = "C:\Program Files\7-Zip\7z.exe"
if (-not (Test-Path $7z)) {
  Write-Host "7-Zip をインストールします（winget）"
  winget install --id 7zip.7zip -e --accept-source-agreements --accept-package-agreements
}
if (-not (Test-Path $7z)) { throw "7-Zip が見つかりません。https://www.7-zip.org/ からインストールして再実行してください。" }

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Get-ChildItem $Destination -Filter "desktop.7z.*" -ErrorAction SilentlyContinue | Remove-Item -Force
$archive = Join-Path $Destination "desktop.7z"
Write-Host "source  : $Source"
Write-Host "archive : $archive.001, .002, ...（2 GB ずつ）"
# -mx1: 速度優先（中身はほぼ圧縮済み） -v2g: 2 GB 分割 -ssw: 使用中ファイルも読む
& $7z a -t7z -mx1 -v2g -ssw "$archive" "$Source\*" | Select-String -Pattern "Everything is Ok|Error|WARNING" | ForEach-Object { Write-Host "  " $_.Line }
if ($LASTEXITCODE -gt 1) { throw "7-Zip がエラーで終了しました（code $LASTEXITCODE）。" }
$parts = Get-ChildItem $Destination -Filter "desktop.7z.*"
$gb = [math]::Round(($parts | Measure-Object Length -Sum).Sum / 1GB, 2)
Write-Host "done. $($parts.Count) 個の書庫、合計 $gb GB"
Write-Host "次に: OneDrive の同期（アップロード）が終わるのを待ち、ミニ PC で unpack-desktop-export.ps1 を実行してください。"
Write-Host "OneDrive の空き容量が $gb GB 未満だと同期に失敗します。足りない場合は OneDrive の設定で容量を確認してください。"
