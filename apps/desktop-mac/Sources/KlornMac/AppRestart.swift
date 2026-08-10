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
        // Asking LaunchServices to open our OWN bundle while this process is
        // still alive does not start a second instance — the app terminated
        // and never came back (founder, 2026-08-10). The reliable shape is a
        // DETACHED helper that outlives us: it waits for this pid to exit,
        // then opens the bundle fresh.
        let bundlePath = Bundle.main.bundleURL.path
        let pid = ProcessInfo.processInfo.processIdentifier
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/sh")
        task.arguments = [
            "-c",
            // Poll rather than sleep-a-fixed-time: `open` on a bundle that is
            // still running would just activate the dying instance.
            "while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done; open \"\(bundlePath)\"",
        ]
        do {
            try task.run()
        } catch {
            Log.app.error("restart failed to spawn: \(String(describing: error), privacy: .public)")
            return
        }
        NSApp.terminate(nil)
    }
}
