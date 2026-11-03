# ミニ PC 初期セットアップ（Windows）
# 1 回だけ実行する。Git の導入、リポジトリの取得、OneDrive の常時保持、Claude Code の導入を行う。
# 実行方法（PowerShell）:
#   irm https://raw.githubusercontent.com/hisashi-1985/bz-office/claude/happy-allen-a29mju/00_migration/scripts/setup-new-pc.ps1 | iex
$ErrorActionPreference = "Stop"
$Branch = "claude/happy-allen-a29mju"
$RepoUrl = "https://github.com/hisashi-1985/bz-office"
$Root = Join-Path $env:USERPROFILE "OneDrive\bz-office"

Write-Host "== 1/4 Git の確認 =="
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
git --version

Write-Host "== 2/4 リポジトリの取得: $Root =="
if (Test-Path (Join-Path $Root ".git")) {
  git -C $Root fetch origin $Branch
  git -C $Root checkout $Branch
  git -C $Root pull --ff-only origin $Branch
} else {
  if ((Test-Path $Root) -and (Get-ChildItem $Root -Force | Measure-Object).Count -gt 0) {
    throw "$Root が空ではありません。中身を退避してから再実行してください。"
  }
  git clone -b $Branch $RepoUrl $Root
}

Write-Host "== 3/4 OneDrive: 常にこのデバイス上に保持する =="
attrib +P -U "$Root" /S /D | Out-Null

Write-Host "== 4/4 Claude Code の導入 =="
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  irm https://claude.ai/install.ps1 | iex
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
try { claude --version } catch { Write-Host "PowerShell を開き直してから claude --version を確認してください。" }

Write-Host ""
Write-Host "完了。次の手順:"
Write-Host "  1. PowerShell を開き直す"
Write-Host "  2. cd `"$Root`""
Write-Host "  3. claude  → /login → フォルダの信頼に y"
Write-Host "  4. Claude に「00_migration/MIGRATION_GUIDE.md の §3-3 以降と §4 を実行して。承認は都度求めて。」と指示する"
