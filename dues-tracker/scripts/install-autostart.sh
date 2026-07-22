#!/usr/bin/env bash
# Install (or refresh) the macOS launchd agent so the dues tracker starts at
# login, restarts on crash, and survives reboots. Same pattern as the
# check-in app's autostart; a different label so they coexist on the mini.
#
#   bash scripts/install-autostart.sh          install/refresh + start
#   bash scripts/install-autostart.sh remove   stop + uninstall
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"     # …/dues-tracker
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
NAME="com.local36.duestracker"
PLIST="$AGENTS/$NAME.plist"
mkdir -p "$AGENTS" "$DIR/logs"

if [ "${1:-}" = "remove" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed: $NAME"
  exit 0
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$NAME</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/logs/duestracker.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/duestracker.log</string>
</dict>
</plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"
echo "installed + started: $NAME  →  http://localhost:8200"
echo "Log: $DIR/logs/duestracker.log"
echo "After a 'git pull', run this script again to restart with new code."
