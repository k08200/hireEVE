import Foundation
import Observation

/// User preferences, persisted in UserDefaults so they survive relaunch. Kept
/// tiny and sensibly defaulted; the default-resolution logic is pure and
/// exercised by the `--self-check` harness.
@MainActor
@Observable
final class AppSettings {
    static let notificationsKey = "klorn.notificationsEnabled"
    static let pillVisibleKey = "klorn.pillVisible"
    static let shortcutKey = "klorn.toggleShortcut"
    static let showInDockKey = "klorn.showInDock"

    private let defaults: UserDefaults

    /// Fired when the user changes the toggle shortcut, so the app can
    /// re-register the Carbon hotkey. Not persisted (wired at launch).
    var onShortcutChanged: ((Shortcut) -> Void)?

    /// Fired when the Preferences recorder starts/stops capturing, so the app
    /// can suspend the Carbon hotkey for the duration — otherwise pressing the
    /// currently-bound chord is consumed by the hotkey (toggling the bar)
    /// before the recorder's local monitor ever sees it. Not persisted.
    var onShortcutRecordingChanged: ((Bool) -> Void)?

    /// Fired when show-in-Dock flips, so the app can re-apply the activation
    /// policy immediately instead of at the next panel state change. Not
    /// persisted (wired at launch).
    var onShowInDockChanged: ((Bool) -> Void)?

    /// A new PUSH posts a macOS banner unless the user turns it off. The top-bar
    /// count always updates regardless — this only gates the system banner.
    var notificationsEnabled: Bool {
        didSet { defaults.set(notificationsEnabled, forKey: Self.notificationsKey) }
    }

    /// Whether the collapsed pill stays on screen. OFF = ambient-invisible mode:
    /// nothing is drawn until ⌥⌘K summons the panel or a PUSH card appears —
    /// the card and the background engine are unaffected.
    /// Whether Klorn appears in the Dock and Cmd+Tab while resting.
    ///
    /// OFF by default, which is the ambient firewall Klorn is designed as: no
    /// Dock icon, no app switcher, never steals focus (founder decision,
    /// 2026-07-28). It is opt-in rather than removed because people who expect
    /// Cmd+Tab to reach every running app were left with no way to find Klorn
    /// except the ⌥⌘K hotkey.
    var showInDock: Bool {
        didSet {
            defaults.set(showInDock, forKey: Self.showInDockKey)
            onShowInDockChanged?(showInDock)
        }
    }

    var pillVisible: Bool {
        didSet {
            defaults.set(pillVisible, forKey: Self.pillVisibleKey)
            // Breadcrumb: the pill has flipped hidden repeatedly in dogfood
            // with no obvious actor (2026-07-20). os.log turned out not to be
            // collectable on the dogfood Mac, so the trace ALSO goes to a file
            // in Application Support — the next occurrence names its caller.
            let stack = Thread.callStackSymbols.dropFirst().prefix(4).joined(separator: "\n    ")
            Log.app.notice("pillVisible → \(self.pillVisible, privacy: .public)")
            Self.appendPillTrace("pillVisible → \(pillVisible)\n    \(stack)")
        }
    }

    /// Append one pill-flip event to ~/Library/Application Support/Klorn/
    /// pill-trace.log. Best-effort; never throws into the UI path.
    private static func appendPillTrace(_ line: String) {
        let fm = FileManager.default
        guard let dir = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Klorn", isDirectory: true) else { return }
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("pill-trace.log")
        let stamp = ISO8601DateFormatter().string(from: Date())
        let entry = "\(stamp) \(line)\n"
        if let handle = try? FileHandle(forWritingTo: file) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: Data(entry.utf8))
        } else {
            try? Data(entry.utf8).write(to: file)
        }
    }

    /// App language: follow macOS (default) or override. Stored via L10n so a
    /// string lookup doesn't have to hop to the main actor; bumping
    /// `languageRevision` is what makes the change visible without a relaunch —
    /// SwiftUI can't observe a global function's return value.
    var appLanguage: AppLanguage = L10n.override {
        didSet {
            guard appLanguage != oldValue else { return }
            L10n.override = appLanguage
            languageRevision &+= 1
        }
    }

    /// Incremented on every language change; the root view keys its identity on
    /// it so the whole tree re-renders with the new strings.
    private(set) var languageRevision = 0

    /// The user's global toggle shortcut (default ⌥⌘K). Persisted as a small
    /// dict; changing it re-registers the hotkey via `onShortcutChanged`.
    var shortcut: Shortcut {
        didSet {
            defaults.set(
                ["keyCode": shortcut.keyCode, "carbonModifiers": shortcut.carbonModifiers],
                forKey: Self.shortcutKey)
            onShortcutChanged?(shortcut)
        }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.notificationsEnabled = Self.resolveNotifications(defaults.object(forKey: Self.notificationsKey))
        self.showInDock = Self.resolveShowInDock(defaults.object(forKey: Self.showInDockKey))
        self.pillVisible = Self.resolvePillVisible(defaults.object(forKey: Self.pillVisibleKey))
        self.shortcut = Self.resolveShortcut(defaults.object(forKey: Self.shortcutKey))
    }

    /// Default ⌥⌘K when unset; otherwise restore the stored {keyCode,modifiers}.
    /// A malformed value falls back to the default rather than crashing. Pure.
    nonisolated static func resolveShortcut(_ stored: Any?) -> Shortcut {
        guard let dict = stored as? [String: Any],
              let code = (dict["keyCode"] as? NSNumber)?.uint32Value
                  ?? (dict["keyCode"] as? UInt32),
              let mods = (dict["carbonModifiers"] as? NSNumber)?.uint32Value
                  ?? (dict["carbonModifiers"] as? UInt32)
        else { return .defaultToggle }
        return Shortcut(keyCode: code, carbonModifiers: mods)
    }

    /// Default ON when never set (`nil`); otherwise honor the stored flag. Pure.
    nonisolated static func resolveNotifications(_ stored: Any?) -> Bool {
        (stored as? Bool) ?? true
    }

    /// Default ON (pill shown) when never set; otherwise honor the stored flag. Pure.
    nonisolated static func resolvePillVisible(_ stored: Any?) -> Bool {
        (stored as? Bool) ?? true
    }

    /// Default OFF when never set: the resting app stays ambient (no Dock icon,
    /// out of Cmd+Tab) unless the user opts in. Pure.
    nonisolated static func resolveShowInDock(_ stored: Any?) -> Bool {
        (stored as? Bool) ?? false
    }
}

/// Static app metadata for the About section. Reads the packaged `.app`'s
/// Info.plist; falls back to "dev" under `swift run` (no bundle version).
enum AppInfo {
    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "dev"
    }
}
