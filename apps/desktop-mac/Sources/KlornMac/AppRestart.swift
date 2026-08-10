import AppKit

/// Relaunch Klorn in place.
///
/// Signing out and back in was the only way to get a clean process, which is
/// a terrible workaround to hand a user (founder, 2026-08-10). Opens a second
/// instance and terminates this one, so the new process owns the menu bar
/// item and the hotkey.
enum AppRestart {
    @MainActor
    static func relaunch() {
        let config = NSWorkspace.OpenConfiguration()
        config.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: Bundle.main.bundleURL, configuration: config) {
            _, error in
            if let error {
                Log.app.error("restart failed: \(String(describing: error), privacy: .public)")
                return
            }
            // Give the second instance a moment to come up before this one
            // drops its status item, so the menu bar never goes empty.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { NSApp.terminate(nil) }
        }
    }
}
