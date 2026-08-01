# Klorn for Windows

A deliberately thin Tauri v2 shell around the hosted web app. The window IS
app.klorn.ai; the shell adds exactly two things:

- **single instance** — a second launch focuses the first window
- **the opener plugin** — so the web app can hand Google OAuth to the SYSTEM
  browser (Google rejects OAuth inside embedded webviews, RFC 8252)

The web app detects this shell through the IPC global Tauri injects
(`window.__TAURI_INTERNALS__`) — see `packages/web/src/lib/native/shell.ts` —
and takes its PKCE poll login flow. The deep-link relay flow stays
Capacitor-only.

## Build

```
cd apps/desktop-win/src-tauri
cargo check          # compiles on any OS
cargo tauri build    # NSIS installer, Windows only
```

`icons/icon.ico` is still the placeholder question: bundling on Windows needs a
real multi-size .ico generated from the brand mark (`cargo tauri icon`), which
is committed (PNG-embedded multi-size .ico built from the brand mark).

## Not yet wired

- ~~Windows release workflow~~ → `.github/workflows/desktop-win-release.yml`, tag `desktop-win-v*`
- The landing's Windows card still points at the web app until an installer
  exists — flip `data-win-href` only after the first release is live.
