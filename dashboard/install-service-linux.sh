#!/usr/bin/env bash
# Installs the Cyberspace Dashboard as a systemd --user service so it starts
# on boot without needing a terminal open. Native systemd — no PM2 required.
set -euo pipefail

DASHBOARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v node)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/cyberspace-dashboard.service"

if [ -z "$NODE_BIN" ]; then
  echo "node not found on PATH" >&2
  exit 1
fi

mkdir -p "$UNIT_DIR"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Cyberspace Intelligence Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$DASHBOARD_DIR
ExecStart=$NODE_BIN $DASHBOARD_DIR/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now cyberspace-dashboard.service

# Let the user service keep running after logout / start at boot before login.
if command -v loginctl >/dev/null; then
  loginctl enable-linger "$USER" || echo "Warning: could not enable linger — service may only run while logged in." >&2
fi

echo "Installed and started cyberspace-dashboard.service"
echo "Check status: systemctl --user status cyberspace-dashboard"
echo "View logs:    journalctl --user -u cyberspace-dashboard -f"
