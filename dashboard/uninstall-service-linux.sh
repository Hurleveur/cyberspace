#!/usr/bin/env bash
# Removes the Cyberspace Dashboard systemd --user service.
set -euo pipefail

UNIT_FILE="$HOME/.config/systemd/user/cyberspace-dashboard.service"

systemctl --user disable --now cyberspace-dashboard.service 2>/dev/null || true
rm -f "$UNIT_FILE"
systemctl --user daemon-reload

echo "Removed cyberspace-dashboard.service"
