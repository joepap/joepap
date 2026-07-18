#!/usr/bin/env bash
# Run on the BACKUP laptop. Pulls the newest database snapshots from the mini
# over Tailscale into ./backups-from-mini/, so a total mini failure can't take
# the data with it. Run it a few times during the event (or loop it).
#
#   bash scripts/pull-backup.sh              one pull
#   bash scripts/pull-backup.sh loop         pull every 10 minutes until Ctrl-C
set -euo pipefail

MINI="${MINI_HOST:-josephpapariello@dcjoe-claude-macmini.tail5dba36.ts.net}"
REMOTE_DIR="${MINI_DIR:-Desktop/claude/local36}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/backups-from-mini"
mkdir -p "$DEST"

pull() {
  # live databases first (freshest possible), then the snapshot folder
  scp -q "$MINI:$REMOTE_DIR/data/checkin.db" "$DEST/checkin-live-$(date +%H%M).db" || true
  scp -q "$MINI:$REMOTE_DIR/data/queue.db"   "$DEST/queue-live-$(date +%H%M).db"   || true
  scp -q "$MINI:$REMOTE_DIR"'/backups/*' "$DEST/" 2>/dev/null || true
  # keep newest 40 files
  ls -t "$DEST" | tail -n +41 | while read -r f; do rm -f "$DEST/$f"; done
  echo "$(date '+%H:%M:%S') pulled — newest: $(ls -t "$DEST" | head -1)"
}

if [ "${1:-}" = "loop" ]; then
  echo "Pulling from $MINI every 10 min. Ctrl-C to stop."
  while true; do pull; sleep 600; done
else
  pull
fi
