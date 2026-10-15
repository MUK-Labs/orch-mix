#!/bin/bash
# Launch the stable local address used for remembered folders and MIDI.
set -e
ORCH_MIX_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$ORCH_MIX_DIR"

# Finder's PATH can omit Homebrew, so also check its usual installation paths.
ORCH_MIX_PYTHON=""
for ORCH_MIX_CANDIDATE in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if ORCH_MIX_EXECUTABLE="$(command -v "$ORCH_MIX_CANDIDATE" 2>/dev/null)" && \
      "$ORCH_MIX_EXECUTABLE" -c 'import sys; raise SystemExit(sys.version_info < (3, 9))' >/dev/null 2>&1; then
    ORCH_MIX_PYTHON="$ORCH_MIX_EXECUTABLE"
    break
  fi
done

if [ -z "$ORCH_MIX_PYTHON" ]; then
  printf '%s\n' 'Orch Mix needs Python 3.9 or newer for saved folders and MIDI.' \
    'Install Python 3, then double-click Start.command again.' \
    'You can still open index.html directly for ordinary playback.'
  if [ -t 0 ]; then read -r -p 'Press Return to close. ' ORCH_MIX_REPLY; fi
  exit 1
fi

printf '%s\n' 'Starting Orch Mix at http://127.0.0.1:8765/' \
  'Leave this Terminal window open while using the app. Ctrl+C stops the server.'
exec "$ORCH_MIX_PYTHON" "$ORCH_MIX_DIR/scripts/serve.py" --prefer-chromium
