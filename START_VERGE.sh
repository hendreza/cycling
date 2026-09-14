#!/bin/sh
# Run from any directory. The project data stays in this folder.
set -eu
verge_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$verge_dir"
if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3 is missing. See START_HERE.md for setup instructions." >&2
    exit 1
fi
printf '%s\n' 'Starting Verge on this computer.' 'Keep this terminal open. Press Ctrl+C here to stop Verge.'
exec python3 backend/scripts/run_dev.py --browser "$@"
