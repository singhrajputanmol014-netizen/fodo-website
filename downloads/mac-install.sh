#!/bin/bash
# FODO Studio for Mac - one-line installer. In Terminal:
#   curl -fsSL https://www.fodo.co.in/downloads/mac-install.sh | bash
# Downloads FODO-Studio-Mac.zip from fodo.co.in, installs it for this user (no admin password)
# and runs the setup. Files fetched with curl are not quarantined, so macOS does not block them.
set -e
OSV="$(sw_vers -productVersion)"; MAJOR="${OSV%%.*}"
echo "FODO Studio installer for Mac (macOS $OSV, $(uname -m))"
if [ "$MAJOR" -lt 15 ]; then
  echo "FODO Studio needs macOS 15 Sequoia or newer. Update in System Settings > General > Software Update."
  exit 1
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Downloading FODO Studio..."
curl -fL --retry 3 --progress-bar -o "$TMP/fodo.zip" "https://www.fodo.co.in/downloads/FODO-Studio-Mac.zip"
ditto -x -k "$TMP/fodo.zip" "$TMP/x"
bash "$TMP/x/FODO Studio/Install FODO Studio.command" </dev/null
