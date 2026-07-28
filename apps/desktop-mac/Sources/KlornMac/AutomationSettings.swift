import Foundation

/// Server-owned behaviour settings (`/api/automations`).
///
/// These already existed on the backend and in the web settings screen; the
/// desktop app simply never exposed them, so "how does Klorn behave" was only
/// answerable in a browser. Decoding is tolerant on purpose — an older build
/// must keep working against a server that has grown new fields, and a missing
/// field falls back to the same default the server applies.
///
/// Decode-only: the PATCH body is hand-built by `patchPayload` because a
/// desktop save must send exactly the fields this panel owns, never the whole
/// struct (which would clobber settings the web app owns).
struct AutomationSettings: Decodable, Sendable, Equatable {
    var agentMode: AgentMode
    var replyTone: ReplyTone
    var notifyEmailUrgent: Bool
    var notifyMeeting: Bool
    var notifyTaskDue: Bool
    var notifyAgentProposal: Bool
    var notifyDailyBriefing: Bool
    var notifyEmailCandidate: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?

    enum CodingKeys: String, CodingKey {
        case agentMode, replyTone
        case notifyEmailUrgent, notifyMeeting, notifyTaskDue
        case notifyAgentProposal, notifyDailyBriefing, notifyEmailCandidate
        case quietHoursStart, quietHoursEnd
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        agentMode = AgentMode(rawValue: (try? c.decode(String.self, forKey: .agentMode)) ?? "") ?? .suggest
        replyTone = ReplyTone(rawValue: (try? c.decode(String.self, forKey: .replyTone)) ?? "") ?? .matchMe
        notifyEmailUrgent = (try? c.decode(Bool.self, forKey: .notifyEmailUrgent)) ?? true
        notifyMeeting = (try? c.decode(Bool.self, forKey: .notifyMeeting)) ?? true
        notifyTaskDue = (try? c.decode(Bool.self, forKey: .notifyTaskDue)) ?? true
        notifyAgentProposal = (try? c.decode(Bool.self, forKey: .notifyAgentProposal)) ?? true
        notifyDailyBriefing = (try? c.decode(Bool.self, forKey: .notifyDailyBriefing)) ?? true
        notifyEmailCandidate = (try? c.decode(Bool.self, forKey: .notifyEmailCandidate)) ?? true
        quietHoursStart = try? c.decodeIfPresent(String.self, forKey: .quietHoursStart)
        quietHoursEnd = try? c.decodeIfPresent(String.self, forKey: .quietHoursEnd)
    }

    /// Server defaults, used before the first fetch lands so the panel renders
    /// the same shape it will settle on instead of an empty flash.
    init(
        agentMode: AgentMode = .suggest,
        replyTone: ReplyTone = .matchMe,
        notifyEmailUrgent: Bool = true,
        notifyMeeting: Bool = true,
        notifyTaskDue: Bool = true,
        notifyAgentProposal: Bool = true,
        notifyDailyBriefing: Bool = true,
        notifyEmailCandidate: Bool = true,
        quietHoursStart: String? = nil,
        quietHoursEnd: String? = nil
    ) {
        self.agentMode = agentMode
        self.replyTone = replyTone
        self.notifyEmailUrgent = notifyEmailUrgent
        self.notifyMeeting = notifyMeeting
        self.notifyTaskDue = notifyTaskDue
        self.notifyAgentProposal = notifyAgentProposal
        self.notifyDailyBriefing = notifyDailyBriefing
        self.notifyEmailCandidate = notifyEmailCandidate
        self.quietHoursStart = quietHoursStart
        self.quietHoursEnd = quietHoursEnd
    }
}

/// How much Klorn is allowed to do on its own. Mirrors the server's
/// AGENT_MODE_POLICIES (agentcore/agent-mode.ts) — same three modes, same
/// order, so the picker can never offer a mode the server would reject.
enum AgentMode: String, CaseIterable, Sendable {
    case shadow = "SHADOW"
    case suggest = "SUGGEST"
    case auto = "AUTO"

    var label: String {
        switch self {
        case .shadow: return "Quiet"
        case .suggest: return "Ask first"
        case .auto: return "Auto"
        }
    }

    /// One line the user can act on — what changes for *them*, not what the
    /// autonomy level is called internally.
    var explanation: String {
        switch self {
        case .shadow:
            return "Klorn sorts and prepares in the background. It never interrupts you and never acts."
        case .suggest:
            return "Klorn drafts the reply and asks before anything is sent. You approve every action."
        case .auto:
            return "Klorn handles safe actions itself. You still hear about anything urgent or time-bound."
        }
    }
}

/// The register replies are written in. Mirrors learning/reply-tone.ts.
///
/// Founder decision (2026-07-28): this is a separate axis from the
/// accept/decline/info reply keys — picking a tone here changes how all three
/// of those drafts sound, it does not replace them.
enum ReplyTone: String, CaseIterable, Sendable {
    case matchMe = "MATCH_ME"
    case formal = "FORMAL"
    case friendly = "FRIENDLY"
    case casual = "CASUAL"

    var label: String {
        switch self {
        case .matchMe: return "Match me"
        case .formal: return "Formal"
        case .friendly: return "Friendly"
        case .casual: return "Casual"
        }
    }

    var explanation: String {
        switch self {
        case .matchMe: return "Learn the register from your own sent mail."
        case .formal: return "Polite and businesslike, with honorifics where the language has them."
        case .friendly: return "Warm but professional — the everyday default."
        case .casual: return "Relaxed and short, the way you'd write to a teammate."
        }
    }
}

// MARK: - Notification categories

/// One switchable alert category, paired with the settings field it writes.
/// Modelled as data rather than six hand-written toggles so the "Essentials
/// only" preset and the list stay in sync by construction.
struct NotifyCategory: Identifiable, Sendable {
    let id: String
    let title: String
    let detail: String
    /// Whether "Essentials only" keeps this category on. Essentials = the two
    /// things the user said must still reach them: real mail that needs an
    /// answer, and anything on the calendar.
    let essential: Bool
    /// Accessors rather than a `WritableKeyPath`: key paths aren't Sendable, and
    /// the alternative was marking the whole table `@unchecked Sendable` to work
    /// around a checker that is right in general.
    let read: @Sendable (AutomationSettings) -> Bool
    let write: @Sendable (inout AutomationSettings, Bool) -> Void

    static let all: [NotifyCategory] = [
        NotifyCategory(
            id: "notifyEmailUrgent", title: "Urgent email",
            detail: "Mail Klorn tiers as PUSH — someone is waiting on you.",
            essential: true, read: { $0.notifyEmailUrgent }, write: { $0.notifyEmailUrgent = $1 }),
        NotifyCategory(
            id: "notifyMeeting", title: "Meetings",
            detail: "Calendar events about to start.",
            essential: true, read: { $0.notifyMeeting }, write: { $0.notifyMeeting = $1 }),
        NotifyCategory(
            id: "notifyTaskDue", title: "Tasks due",
            detail: "Commitments approaching or past their due time.",
            essential: false, read: { $0.notifyTaskDue }, write: { $0.notifyTaskDue = $1 }),
        NotifyCategory(
            id: "notifyAgentProposal", title: "Klorn's proposals",
            detail: "Actions Klorn wants your approval for.",
            essential: false, read: { $0.notifyAgentProposal }, write: { $0.notifyAgentProposal = $1 }),
        NotifyCategory(
            id: "notifyDailyBriefing", title: "Daily briefing",
            detail: "The once-a-morning summary.",
            essential: false, read: { $0.notifyDailyBriefing }, write: { $0.notifyDailyBriefing = $1 }),
        NotifyCategory(
            id: "notifyEmailCandidate", title: "Attachment intake",
            detail: "Résumés and profile attachments Klorn has read.",
            essential: false, read: { $0.notifyEmailCandidate }, write: { $0.notifyEmailCandidate = $1 }),
    ]
}

extension AutomationSettings {
    /// True when exactly the essential categories are on — i.e. the state the
    /// "Essentials only" preset produces. Drives the preset's selected look.
    var isEssentialsOnly: Bool {
        NotifyCategory.all.allSatisfy { $0.read(self) == $0.essential }
    }

    /// True when nothing is muted.
    var isEverything: Bool {
        NotifyCategory.all.allSatisfy { $0.read(self) }
    }

    /// "Only the mail that needs an answer and anything on the calendar" —
    /// the founder's description of the default mode, as one click.
    func applyingEssentialsOnly() -> AutomationSettings {
        var copy = self
        for category in NotifyCategory.all {
            category.write(&copy, category.essential)
        }
        return copy
    }

    func applyingEverything() -> AutomationSettings {
        var copy = self
        for category in NotifyCategory.all {
            category.write(&copy, true)
        }
        return copy
    }

    /// The PATCH body for /api/automations. Only the fields this panel owns are
    /// sent, so a desktop save can't clobber a web-only setting.
    var patchPayload: [String: Any] {
        var payload: [String: Any] = [
            "agentMode": agentMode.rawValue,
            "replyTone": replyTone.rawValue,
        ]
        for category in NotifyCategory.all {
            payload[category.id] = category.read(self)
        }
        // NSNull, not omission: clearing quiet hours has to reach the server as
        // an explicit null, and dropping the key would silently keep the old
        // window instead.
        payload["quietHoursStart"] = quietHoursStart ?? NSNull()
        payload["quietHoursEnd"] = quietHoursEnd ?? NSNull()
        return payload
    }
}

/// Quiet-hours entry is free text ("22:00"), so it needs the same 24h
/// validation the server assumes. Pure, for the self-check harness.
enum QuietHours {
    /// Normalises "9:5", "09:05", "0905" → "09:05"; nil for anything else.
    /// An empty/whitespace string means "cleared" and also returns nil, so the
    /// caller can treat "invalid" and "cleared" the same way: no window.
    static func normalize(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return nil }

        let digitsOnly = trimmed.allSatisfy { $0.isNumber }
        let parts: [String]
        if digitsOnly && trimmed.count == 4 {
            parts = [String(trimmed.prefix(2)), String(trimmed.suffix(2))]
        } else {
            parts = trimmed.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        }
        guard parts.count == 2,
              let hour = Int(parts[0]), let minute = Int(parts[1]),
              (0...23).contains(hour), (0...59).contains(minute)
        else { return nil }

        return String(format: "%02d:%02d", hour, minute)
    }

    /// A window is only meaningful with both ends set; one end alone is
    /// discarded rather than sent as a half-open range the server can't use.
    static func pair(start: String, end: String) -> (start: String?, end: String?) {
        guard let s = normalize(start), let e = normalize(end) else { return (nil, nil) }
        return (s, e)
    }
}
