#!/usr/bin/env bash
# Wrap Klorn.app in a drag-to-install DMG whose window actually looks installed:
# branded background, app on the left, Applications on the right, an arrow
# between them.
#
# Layout comes from dmgbuild (pure Python: it writes the .DS_Store directly),
# NOT from scripting Finder — Finder automation needs GUI consent and is the
# flakiest thing you can put in CI. The background is rendered from Swift
# source at build time, so there is no binary design asset to rot in the repo.
#
# Why a DMG at all: an app launched from where it was downloaded runs
# translocated, SelfUpdate.installTarget() then finds no install path, and
# in-app updates fail permanently for that user. The drag is the cure.
# Klorn-macos.zip stays the in-app updater channel; this is the human path.
#
# Usage:  scripts/make-dmg.sh <Klorn.app> <out.dmg> [volume-name]
set -euo pipefail
cd "$(dirname "$0")/.."   # → apps/desktop-mac

# ── Window geometry, single source of truth ──────────────────────────────────
# Finder counts the title bar inside the window rect it restores, and the icon
# label hangs below the icon. Guessing this once shipped a build whose labels
# sat 7px from the cut. The numbers below are asserted, not eyeballed:
#
#   content_h  = WIN_H - TITLEBAR
#   label_bot  = ICON_Y + ICON/2 + LABEL_GAP + LABEL_H
#   slack      = content_h - label_bot     (must clear MIN_SLACK)
WIN_W=660
WIN_H=520
TITLEBAR=28
ICON=128
ICON_Y=330
LABEL_GAP=6
LABEL_H=18
MIN_SLACK=60

CONTENT_H=$(( WIN_H - TITLEBAR ))
LABEL_BOT=$(( ICON_Y + ICON / 2 + LABEL_GAP + LABEL_H ))
SLACK=$(( CONTENT_H - LABEL_BOT ))
if [ "$SLACK" -lt "$MIN_SLACK" ]; then
  echo "✗ labels would sit ${SLACK}px from the window cut (need ${MIN_SLACK}px)"; exit 1
fi

APP="${1:?usage: make-dmg.sh <Klorn.app> <out.dmg> [volume-name]}"
OUT="${2:?usage: make-dmg.sh <Klorn.app> <out.dmg> [volume-name]}"
VOLNAME="${3:-Klorn}"

[ -d "$APP" ] || { echo "✗ not an app bundle: $APP"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# dmgbuild lives in a throwaway venv: the runner's python3 is Homebrew-managed
# and PEP 668 refuses `pip install --user` outright (that refusal killed the
# 80025 release). A venv is allowed everywhere and costs a few seconds.
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q dmgbuild

echo "▸ Rendering window background"
swiftc -O scripts/render-dmg-background.swift -o "$WORK/render-bg"
"$WORK/render-bg" "$WORK/bg" "../../website/brand/mark.png" "$WIN_W" "$WIN_H" "$ICON_Y" >/dev/null
tiffutil -cathidpicheck "$WORK/bg.png" "$WORK/bg@2x.png" -out "$WORK/bg.tiff" 2>/dev/null

# dmgbuild settings. Icon rows sit at y=205 (top-origin) to line up with the
# arrow the background draws; app left, Applications right — the direction you
# read, and the direction you drag.
# Paths reach Python via the environment, not string interpolation — shell
# quoting rules and Python literal rules disagree, and the runner's /bin/bash
# is 3.2 (\${var@Q} does not exist there; that trap killed the first release).
export KLORN_DMG_APP="$(cd "$(dirname "$APP")" && pwd)/$(basename "$APP")"
export KLORN_DMG_BG="$WORK/bg.tiff"
export KLORN_WIN_W="$WIN_W" KLORN_WIN_H="$WIN_H" KLORN_ICON_Y="$ICON_Y"
cat > "$WORK/settings.py" <<'PYEOF'
import os
import os.path
app = os.environ["KLORN_DMG_APP"]
files = [app]
symlinks = {"Applications": "/Applications"}
background = os.environ["KLORN_DMG_BG"]
window_rect = ((200, 120), (int(os.environ["KLORN_WIN_W"]), int(os.environ["KLORN_WIN_H"])))
icon_size = 128
text_size = 13
icon_locations = {
    os.path.basename(app): (180, int(os.environ["KLORN_ICON_Y"])),
    "Applications": (480, int(os.environ["KLORN_ICON_Y"])),
}
format = "UDZO"
PYEOF

echo "▸ Window ${WIN_W}x${WIN_H}, icons y=${ICON_Y}, label clears the cut by ${SLACK}px"
echo "▸ Creating ${OUT}"
rm -f "$OUT"
"$WORK/venv/bin/python" -m dmgbuild -s "$WORK/settings.py" "$VOLNAME" "$OUT"

echo "✓ Built $OUT ($(du -h "$OUT" | cut -f1))"
