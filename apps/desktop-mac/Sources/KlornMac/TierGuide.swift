import SwiftUI

// What the four tiers mean, in the places someone would ask.
//
// The tier names are the product's core idea and they were never explained
// anywhere in the app: the sidebar showed "Push 3 / Queue 12 / Silent 40 /
// Auto 8" and left the reader to guess. Worse, the guess is usually wrong —
// "Silent" reads as deleted and "Auto" reads as "Klorn replied for me", and
// neither is true.

extension Tier {
    /// One line: what this tier does to your attention.
    var blurb: String {
        switch self {
        case .push: L("tier.push.blurb")
        case .queue: L("tier.queue.blurb")
        case .silent: L("tier.silent.blurb")
        case .auto: L("tier.auto.blurb")
        }
    }

    /// What an empty tier means — which is different for each one, and is the
    /// moment someone is most likely to wonder what the tier was for.
    var emptyTitle: String {
        switch self {
        case .push: L("tier.push.empty")
        case .queue: L("tier.queue.empty")
        case .silent: L("tier.silent.empty")
        case .auto: L("tier.auto.empty")
        }
    }

    var emptyIcon: String {
        switch self {
        case .push: "checkmark.shield"
        case .queue: "tray"
        case .silent: "moon"
        case .auto: "sparkles"
        }
    }
}

/// First-run explainer: what Klorn did to the mailbox, and what the four words
/// in the sidebar mean.
///
/// Shown once, then reachable forever from the sidebar — a one-shot tour that
/// can't be re-opened is a tour that was never really read. Nothing here is
/// dismissible-by-accident: it sits over the full view with an explicit Got it.
struct TierGuide: View {
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(L("guide.title"))
                    .font(.title3.weight(.semibold)).foregroundStyle(Theme.text)
                Spacer()
                Button(L("guide.done"), action: onClose)
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(.bottom, Theme.s2)

            Text(L("guide.intro"))
                .font(.callout).foregroundStyle(Theme.textDim)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, Theme.s4)

            VStack(alignment: .leading, spacing: Theme.s3) {
                ForEach(Tier.displayOrder) { tier in
                    HStack(alignment: .top, spacing: Theme.s3) {
                        Circle().fill(Theme.tint(tier))
                            .frame(width: 8, height: 8).padding(.top, 6)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tier.label).font(.body.weight(.semibold))
                                .foregroundStyle(Theme.text)
                            Text(tier.blurb).font(.caption).foregroundStyle(Theme.textDim)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(tier.label). \(tier.blurb)")
                }
            }

            Divider().overlay(Theme.line).padding(.vertical, Theme.s4)

            Text(L("guide.correcting"))
                .font(.caption).foregroundStyle(Theme.textDim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(22)
        .frame(width: 460)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.line))
        .shadow(color: Theme.panelShadow, radius: 24, y: 8)
    }
}

/// Whether the first-run guide has been shown. Persisted rather than derived:
/// "has this person seen the explanation" is not recoverable from any other
/// state, and showing it twice is as bad as never showing it.
enum GuideSeen {
    private static let key = "klorn.hasSeenTierGuide"

    static var value: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    /// The guide is for people who have mail to explain. Showing it over an
    /// empty signed-out shell teaches nothing and burns the one first run.
    nonisolated static func shouldPresent(seen: Bool, signedIn: Bool) -> Bool {
        !seen && signedIn
    }
}
