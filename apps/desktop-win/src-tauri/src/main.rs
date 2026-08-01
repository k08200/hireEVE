// Klorn for Windows — a Tauri shell around the hosted web app.
//
// This is deliberately thin: the window IS app.klorn.ai. Everything the shell
// adds is listed here, and nothing else:
//   • single instance — a second launch focuses the first window
//   • the opener plugin — so the web app's shell.ts can hand Google OAuth to
//     the SYSTEM browser (Google rejects OAuth inside embedded webviews)
// The web app detects this shell via the injected IPC global
// (window.__TAURI_INTERNALS__) and takes its PKCE poll login flow; the deep
// link relay flow stays Capacitor-only.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("failed to launch Klorn");
}
