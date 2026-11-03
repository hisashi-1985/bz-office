# 旧 PC: Claude Code の持ち出し可能な設定だけを OneDrive\bz-office\_private\claude-export にコピーする
# 資格情報 (.credentials.json, ~/.claude.json) はコピーしない。削除も一切しない。
$ErrorActionPreference = "Stop"
$src = Join-Path $env:USERPROFILE ".claude"
if ($env:CLAUDE_CONFIG_DIR) { $src = $env:CLAUDE_CONFIG_DIR }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # .../bz-office
$dst = Join-Path $root "_private\claude-export"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Write-Host "source : $src"
Write-Host "export : $dst"

# 1) 単体ファイル
foreach ($f in @("settings.json", "CLAUDE.md", "keybindings.json", "history.jsonl")) {
  $p = Join-Path $src $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $dst $f) -Force; Write-Host "  copied $f" }
}

# 2) フォルダ（synced/ は claude.ai から自動同期されるので除外）
foreach ($d in @("rules", "skills", "agents", "commands", "output-styles", "workflows", "themes", "agent-memory")) {
  $p = Join-Path $src $d
  if (Test-Path $p) {
    robocopy $p (Join-Path $dst $d) /E /XD synced .trash /NFL /NDL /NJH /NJS /NP | Out-Null
    Write-Host "  copied $d\"
  }
}

# 3) 自動メモリ（projects\<project>\memory のみ。会話ログ jsonl は含めない）
$proj = Join-Path $src "projects"
if (Test-Path $proj) {
  Get-ChildItem $proj -Directory | ForEach-Object {
    $mem = Join-Path $_.FullName "memory"
    if (Test-Path $mem) {
      $to = Join-Path $dst ("projects\" + $_.Name + "\memory")
      robocopy $mem $to /E /NFL /NDL /NJH /NJS /NP | Out-Null
      Write-Host "  copied projects\$($_.Name)\memory\"
    }
  }
}

# 4) 棚卸し情報
$inv = Join-Path $dst "inventory.txt"
"exported: $(Get-Date -Format s)" | Out-File $inv -Encoding utf8
"computer: $env:COMPUTERNAME  user: $env:USERNAME" | Out-File $inv -Append -Encoding utf8
try { "claude --version: " + (& claude --version 2>&1) | Out-File $inv -Append -Encoding utf8 } catch {}
try { "--- claude mcp list ---" | Out-File $inv -Append -Encoding utf8; (& claude mcp list 2>&1) | Out-File $inv -Append -Encoding utf8 } catch {}
Write-Host "done. inventory: $inv"
Write-Host "NOTE: .credentials.json と ~/.claude.json はコピーしていません。ミニ PC で /login と claude mcp add を行ってください。"
