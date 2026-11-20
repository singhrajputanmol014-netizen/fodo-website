#!/bin/bash
# FODO Studio for Mac - one-line uninstaller. Open Terminal (Cmd + Space > Terminal), paste this line, press Enter:
#   curl -fsSL https://www.fodo.co.in/downloads/mac-uninstall.sh | bash
# Removes ~/Applications/FODO Studio and the FODO Studio app. Your videos and exports (the storage folder)
# are kept unless you type YES. Python, FFmpeg and Ollama are separate apps and are left alone.
DEST="$HOME/Applications/FODO Studio"
APP="$HOME/Applications/FODO Studio.app"
echo ""
echo "FODO Studio uninstaller for Mac"
cd "$HOME" || exit 1
if [ ! -d "$DEST" ] && [ ! -d "$APP" ]; then
  echo "FODO Studio is not installed for this Mac user (nothing in $DEST)."
  exit 0
fi
KEEP=1
if [ -d "$DEST/storage" ]; then
  echo ""
  echo "Your videos and exports are in: $DEST/storage"
  ans=""
  if [ -r /dev/tty ]; then
    printf "Delete them too? Type YES to delete, or just press Enter to keep them: "
    { read -r ans < /dev/tty; } 2>/dev/null || ans=""
  fi
  case "$ans" in YES|yes) KEEP=0;; esac
fi
echo "Closing FODO Studio..."
pkill -f "$DEST/" 2>/dev/null || true
osascript -e 'tell application "FODO Studio" to quit' >/dev/null 2>&1 || true
sleep 2
echo "Removing FODO Studio files..."
rm -rf "$APP"
if [ -d "$DEST" ]; then
  for item in "$DEST"/* "$DEST"/.[!.]*; do
    [ -e "$item" ] || continue
    if [ "$KEEP" = 1 ] && [ "$(basename "$item")" = "storage" ]; then continue; fi
    rm -rf "$item"
  done
  [ "$KEEP" = 0 ] && rm -rf "$DEST"
fi
echo ""
if [ "$KEEP" = 1 ] && [ -d "$DEST/storage" ]; then
  echo "FODO Studio is removed. Your videos are kept in: $DEST/storage"
else
  echo "FODO Studio is removed."
fi
echo "Your FODO key stays on your account: you can install FODO Studio again any time and log in with the same email."
