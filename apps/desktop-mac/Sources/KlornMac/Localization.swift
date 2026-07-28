import Foundation

/// App language: follow macOS, or override.
///
/// "System" is the default and the correct behaviour for a Mac app — it reads
/// the user's Preferred Languages list. The override exists because Klorn's
/// users routinely run an English macOS while writing Korean mail, so the OS
/// language is not always the language they want the app in.
enum AppLanguage: String, CaseIterable, Sendable {
    case system
    case english = "en"
    case korean = "ko"

    /// Shown in its own language — a language picker the user can't read is
    /// useless. "System" is the exception: it names a behaviour, not a language.
    var label: String {
        switch self {
        case .system: return L10n.t("lang.system")
        case .english: return "English"
        case .korean: return "한국어"
        }
    }
}

/// Localized string lookup, honouring the in-app language override.
///
/// SwiftUI's automatic `Text("literal")` localization always resolves against
/// the main bundle's language, which cannot be overridden without a relaunch.
/// Routing every string through `L10n.t` instead lets the override take effect
/// on the next render, and makes the untranslated-string audit a grep.
enum L10n {
    private static let storageKey = "klorn.appLanguage"

    /// Cached so a lookup isn't a bundle search per string per frame.
    private nonisolated(unsafe) static var cachedBundle: Bundle?
    private nonisolated(unsafe) static var cachedCode: String?

    /// The language actually in effect: the override, or the best match between
    /// the user's Preferred Languages and what Klorn ships. Falls back to
    /// English — an unshipped language must degrade to a real translation, not
    /// to raw keys on screen.
    static func resolvedCode(
        override: AppLanguage,
        preferred: [String] = Locale.preferredLanguages,
        available: [String] = ["en", "ko"]
    ) -> String {
        if override != .system { return override.rawValue }
        for tag in preferred {
            // "ko-KR" / "ko-Hang-KR" → "ko"
            guard let base = tag.split(separator: "-").first.map(String.init) else { continue }
            if available.contains(base) { return base }
        }
        return "en"
    }

    /// Persisted override. Read from UserDefaults rather than AppSettings so a
    /// lookup on a background render path doesn't need the main actor.
    static var override: AppLanguage {
        get {
            AppLanguage(rawValue: UserDefaults.standard.string(forKey: storageKey) ?? "") ?? .system
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: storageKey)
            cachedBundle = nil
            cachedCode = nil
        }
    }

    private static func bundle() -> Bundle {
        let code = resolvedCode(override: override)
        if let cached = cachedBundle, cachedCode == code { return cached }
        // Bundle.module under SwiftPM, the .app under Xcode — both resolve the
        // same .lproj folders.
        let root = Bundle.module
        let resolved = root.path(forResource: code, ofType: "lproj")
            .flatMap(Bundle.init(path:)) ?? root
        cachedBundle = resolved
        cachedCode = code
        return resolved
    }

    /// Look up `key`. A missing key returns the key itself, which is visible in
    /// the UI on purpose: a silent fallback to English would hide the gap until
    /// a user found it.
    static func t(_ key: String) -> String {
        NSLocalizedString(key, tableName: "Localizable", bundle: bundle(), value: key, comment: "")
    }

    /// Formatted lookup, e.g. "Get v%@".
    static func t(_ key: String, _ args: CVarArg...) -> String {
        String(format: t(key), arguments: args)
    }
}

extension L10n {
    /// Every key defined for a language, for the drift check. Reads the raw
    /// .strings file rather than NSLocalizedString, which cannot enumerate.
    static func keys(forLanguage code: String) -> Set<String> {
        guard let path = Bundle.module.path(forResource: code, ofType: "lproj"),
              let url = Bundle(path: path)?.url(forResource: "Localizable", withExtension: "strings"),
              let dict = NSDictionary(contentsOf: url) as? [String: String]
        else { return [] }
        return Set(dict.keys)
    }

    /// Languages Klorn ships. The picker and the drift check read this, so
    /// adding a translation is one .lproj folder plus one case.
    static let shipped = ["en", "ko"]
}

/// Shorthand so a view reads `L("prefs.done")` rather than `L10n.t("prefs.done")`.
func L(_ key: String) -> String { L10n.t(key) }

func L(_ key: String, _ args: CVarArg...) -> String {
    String(format: L10n.t(key), arguments: args)
}
