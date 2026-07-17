#!/usr/bin/env bash
# Install (or refresh) macOS launchd agents so the check-in server and the
# question queue start at login, restart on crash, and survive reboots.
# Run again any time (e.g. after git pull) to restart both with new code.
#
#   bash scripts/install-autostart.sh          install/refresh + start
#   bash scripts/install-autostart.sh remove   stop + uninstall
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$DIR/logs"

install_one() {
  local name="$1" script="$2"
  local plist="$AGENTS/com.local36.$name.plist"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.local36.$name</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/$script</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/logs/$name.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/$name.log</string>
</dict>
</plist>
EOF
  launchctl unload "$plist" 2>/dev/null || true
  launchctl load -w "$plist"
  echo "installed + started: com.local36.$name ($script)"
}

remove_one() {
  local name="$1"
  local plist="$AGENTS/com.local36.$name.plist"
  launchctl unload "$plist" 2>/dev/null || true
  rm -f "$plist"
  echo "removed: com.local36.$name"
}

if [ "${1:-}" = "remove" ]; then
  remove_one checkin
  remove_one queue
else
  install_one checkin server.js
  install_one queue queue-server.js
  echo
  echo "Both services now start at login and auto-restart if they crash."
  echo "Logs: $DIR/logs/checkin.log and $DIR/logs/queue.log"
  echo "After a 'git pull', run this script again to restart with new code."
  echo
  echo "Also keep the Mac awake (one time):  sudo pmset -a sleep 0 disksleep 0"
fi
