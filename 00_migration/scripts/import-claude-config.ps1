# ミニ PC: _private\claude-export の内容を %USERPROFILE%\.claude に取り込む
# 既存ファイルがある場合は .bak.<日時> に退避してから置く。削除はしない。
$ErrorActionPreference = "Stop"
$dst = Join-Path $env:USERPROFILE ".claude"
if ($env:CLAUDE_CONFIG_DIR) { $dst = $env:CLAUDE_CONFIG_DIR }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $root "_private\claude-export"
$tpl = Join-Path $root "00_migration\home-claude-templates"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

function Put-File($from, $to) {
  if (Test-Path $to) { Copy-Item $to "$to.bak.$stamp" -Force; Write-Host "  backup -> $to.bak.$stamp" }
  Copy-Item $from $to -Force; Write-Host "  placed $to"
}

Write-Host "import : $src"
Write-Host "target : $dst"

# 1) 単体ファイル（エクスポートに無ければテンプレートを使う）
foreach ($f in @("settings.json", "CLAUDE.md", "keybindings.json", "history.jsonl")) {
  $from = Join-Path $src $f
  if (-not (Test-Path $from)) { $from = Join-Path $tpl $f }
  if (Test-Path $from) { Put-File $from (Join-Path $dst $f) }
}

# 2) フォルダはマージ（上書きなし: 既存ファイルは残す）
foreach ($d in @("rules", "skills", "agents", "commands", "output-styles", "workflows", "themes", "agent-memory")) {
  $from = Join-Path $src $d
  if (Test-Path $from) {
    robocopy $from (Join-Path $dst $d) /E /XC /XN /XO /NFL /NDL /NJH /NJS /NP | Out-Null
    Write-Host "  merged $d\"
  }
}

# 3) 自動メモリ: フォルダ名が旧 PC のパス由来なので、そのまま置く。
#    ミニ PC で作業ルートのパスが違う場合は、MIGRATION_GUIDE.md §3-5 に従って memory\ を移動する。
$proj = Join-Path $src "projects"
if (Test-Path $proj) {
  robocopy $proj (Join-Path $dst "projects") /E /XC /XN /XO /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Host "  merged projects\<project>\memory\"
  Get-ChildItem $proj -Directory | ForEach-Object { Write-Host "    - $($_.Name)" }
}

Write-Host "done."
Write-Host "次に: claude を作業ルートで起動 -> /login -> /status -> /memory で確認。MCP は claude mcp add で再登録。"
