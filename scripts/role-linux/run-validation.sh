#!/bin/sh
# Run from the isolated source copy made by prepare-validation.ps1.
set -eu
runtime=$(cd .. && pwd)
export MOTION_PYTHON="$runtime/venv/bin/python"
export PLAYWRIGHT_BROWSERS_PATH="$runtime/browsers"
export LD_LIBRARY_PATH="$runtime/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export ROLE_REPLAY_YOUTH=1 ROLE_ALLOW_PAID=0
unset PLAYWRIGHT_CHANNEL PLAYWRIGHT_MODULE
exec env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 FONTCONFIG_FILE="$runtime/fonts.conf" MOTION_PYTHON="$MOTION_PYTHON" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" ROLE_REPLAY_YOUTH=1 ROLE_ALLOW_PAID=0 "$MOTION_PYTHON" scripts/role-linux/verify-environment.py "$runtime" "${1:-worker}"
