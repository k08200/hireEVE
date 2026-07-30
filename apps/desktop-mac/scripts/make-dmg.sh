#!/usr/bin/env bash
# Wrap Klorn.app in a compressed disk image with a drag-to-Applications window.
#
# Why a DMG when the .zip already works: a quarantined app launched from where it
# was downloaded runs from a read-only AppTranslocation mount, so it never lives
# at a real path. SelfUpdate.installTarget() then finds neither
# ~/Applications/Klorn.app nor /Applications/Klorn.app and every in-app update
# falls back to opening the release page — permanently, for that user. The
# Applications symlink in this window is what makes people move the app before
# first launch, which is the only thing that ends translocation.
#
# The .zip is NOT replaced. SelfUpdate downloads that exact asset by name, so it
# stays the update channel; this DMG is the human install path.
#
# Deliberately no AppleScript: setting a background image and icon coordinates
# means driving Finder, which needs GUI automation consent and is the flakiest
# thing you can put in CI. The default icon view already shows the app beside the
# Applications alias, which is the part that changes behaviour.
#
# Usage:  scripts/make-dmg.sh <Klorn.app> <out.dmg> [volume-name]
set -euo pipefail

APP="${1:?usage: make-dmg.sh <Klorn.app> <out.dmg> [volume-name]}"
OUT="${2:?usage: make-dmg.sh <Klorn.app> <out.dmg> [volume-name]}"
VOLNAME="${3:-Klorn}"

[ -d "$APP" ] || { echo "✗ not an app bundle: $APP"; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "▸ Staging $(basename "$APP")…"
# ditto, not cp: it preserves the bundle's extended attributes and — critically —
# the stapled notarization ticket. cp -R drops xattrs on some configurations and
# the app inside would then need a network round-trip to validate.
ditto "$APP" "$STAGE/$(basename "$APP")"
ln -s /Applications "$STAGE/Applications"

echo "▸ Creating $OUT…"
rm -f "$OUT"
hdiutil create \
  -volname "$VOLNAME" \
  -srcfolder "$STAGE" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  -quiet \
  "$OUT"

echo "✓ Built $OUT ($(du -h "$OUT" | cut -f1))"
