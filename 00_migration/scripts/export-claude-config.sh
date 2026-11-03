#!/usr/bin/env bash
# 旧 PC が Mac / Linux の場合のエクスポート。Windows 版 .ps1 と同じ範囲をコピーする（資格情報は含めない）。
set -euo pipefail
SRC="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DST="$ROOT/_private/claude-export"
mkdir -p "$DST"
echo "source : $SRC"; echo "export : $DST"
for f in settings.json CLAUDE.md keybindings.json history.jsonl; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/$f" && echo "  copied $f"
done
for d in rules skills agents commands output-styles workflows themes agent-memory; do
  [ -d "$SRC/$d" ] && rsync -a --exclude synced --exclude .trash "$SRC/$d/" "$DST/$d/" && echo "  copied $d/"
done
if [ -d "$SRC/projects" ]; then
  for p in "$SRC"/projects/*/; do
    [ -d "$p/memory" ] && mkdir -p "$DST/projects/$(basename "$p")" && rsync -a "$p/memory/" "$DST/projects/$(basename "$p")/memory/" && echo "  copied projects/$(basename "$p")/memory/"
  done
fi
{
  echo "exported: $(date -Iseconds)"; echo "host: $(hostname) user: $USER"
  echo "claude --version: $(claude --version 2>&1 || true)"
  echo "--- claude mcp list ---"; claude mcp list 2>&1 || true
} > "$DST/inventory.txt"
echo "done. inventory: $DST/inventory.txt"
echo "NOTE: .credentials.json と ~/.claude.json はコピーしていません。"
