#!/bin/bash
# Open the offline app in the default browser; Python is not required.
set -e
ORCH_MIX_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
open "$ORCH_MIX_DIR/index.html"
