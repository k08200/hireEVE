import SwiftUI

/// The Preferences sections backed by `/api/automations` — how much Klorn does
/// on its own, how its replies sound, and what is allowed to interrupt you.
///
/// These settings existed on the server and in the web app from the start; the
/// desktop app just never showed them, so the only way to answer "why did it
/// notify me" or "why does it write like that" was to open a browser.
struct AutomationPreferences: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            section("HOW KLORN WORKS") { modeSection }
            section("REPLIES") { replySection }
            section("WHAT INTERRUPTS YOU") { notificationSection }
        }
    }

    // MARK: Agent mode

    @ViewBuilder
    private var modeSection: some View {
        VStack(alignment: .leading, spacing: Theme.s2) {
            ForEach(AgentMode.allCases, id: \.self) { mode in
                ChoiceRow(
                    title: mode.label,
                    detail: mode.explanation,
                    selected: model.automation.agentMode == mode,
                    disabled: model.automationSaving
                ) {
                    model.updateAutomation { $0.agentMode = mode }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("How Klorn works")
    }

    // MARK: Reply tone

    @ViewBuilder
    private var replySection: some View {
        // A Picker, not another stack of cards: the tone list is longer and
        // secondary to the mode choice, and a menu keeps the panel readable.
        HStack {
            Text("Tone").font(.body).foregroundStyle(Theme.text)
            Spacer()
            Picker("Tone", selection: toneBinding) {
                ForEach(ReplyTone.allCases, id: \.self) { tone in
                    Text(tone.label).tag(tone)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(width: 160)
            .disabled(model.automationSaving)
            .accessibilityLabel("Reply tone")
        }
        Text(model.automation.replyTone.explanation)
            .font(.caption).foregroundStyle(Theme.textDim)
            .fixedSize(horizontal: false, vertical: true)
        Text("Applies to all three one-key replies — accept, decline, and ask. It changes how they sound, not what they say.")
            .font(.caption).foregroundStyle(Theme.textDim)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var toneBinding: Binding<ReplyTone> {
        Binding(
            get: { model.automation.replyTone },
            set: { tone in model.updateAutomation { $0.replyTone = tone } })
    }

    // MARK: Notifications

    @ViewBuilder
    private var notificationSection: some View {
        HStack(spacing: Theme.s2) {
            PresetChip(
                title: "Essentials only",
                selected: model.automation.isEssentialsOnly,
                disabled: model.automationSaving
            ) {
                model.updateAutomation { $0 = $0.applyingEssentialsOnly() }
            }
            PresetChip(
                title: "Everything",
                selected: model.automation.isEverything,
                disabled: model.automationSaving
            ) {
                model.updateAutomation { $0 = $0.applyingEverything() }
            }
            Spacer()
        }
        Text("Essentials only: mail that needs an answer, plus anything on your calendar. Everything else stays in the bar without a banner.")
            .font(.caption).foregroundStyle(Theme.textDim)
            .fixedSize(horizontal: false, vertical: true)

        VStack(alignment: .leading, spacing: Theme.s2) {
            ForEach(NotifyCategory.all) { category in
                Toggle(isOn: categoryBinding(category)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(category.title).foregroundStyle(Theme.text)
                        Text(category.detail).font(.caption).foregroundStyle(Theme.textDim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .toggleStyle(.switch).tint(Theme.accent)
                .disabled(model.automationSaving)
            }
        }
        .padding(.top, Theme.s1)

        QuietHoursField(
            start: model.automation.quietHoursStart,
            end: model.automation.quietHoursEnd,
            disabled: model.automationSaving
        ) { start, end in
            model.updateAutomation {
                $0.quietHoursStart = start
                $0.quietHoursEnd = end
            }
        }

        if let error = model.automationError {
            Text(error).font(.caption).foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isStaticText)
        }
    }

    private func categoryBinding(_ category: NotifyCategory) -> Binding<Bool> {
        Binding(
            get: { category.read(model.automation) },
            set: { on in model.updateAutomation { category.write(&$0, on) } })
    }

    // MARK: Layout

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Theme.s2) {
            ColumnHeader(title: title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Theme.s3)
        Divider().overlay(Theme.line)
    }
}

/// A radio-style option: title, one line of consequence, and a check when
/// chosen. A whole-row button so the target clears 44pt without a custom hit
/// area, and `.isSelected` so VoiceOver announces state rather than colour.
private struct ChoiceRow: View {
    let title: String
    let detail: String
    let selected: Bool
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: Theme.s3) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? Theme.accent : Theme.textDim)
                    .font(.body)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(selected ? .semibold : .regular))
                        .foregroundStyle(Theme.text)
                    Text(detail).font(.caption).foregroundStyle(Theme.textDim)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, Theme.s2)
            .padding(.horizontal, Theme.s3)
            .frame(minHeight: 44, alignment: .top)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(selected ? Theme.surfaceSelected : Theme.surfaceRaised))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(selected ? Theme.accent.opacity(0.5) : Theme.line))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail)")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// A one-click notification preset. Selected state is derived from the actual
/// toggles, so flipping a single switch drops the chip out of its preset
/// instead of leaving a lie on screen.
private struct PresetChip: View {
    let title: String
    let selected: Bool
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.callout.weight(selected ? .semibold : .regular))
                .foregroundStyle(selected ? Theme.accentDeep : Theme.text)
                .padding(.horizontal, Theme.s3)
                .frame(minHeight: 44)
                .background(
                    Capsule().fill(selected ? Theme.surfaceSelected : Theme.surfaceRaised))
                .overlay(
                    Capsule().strokeBorder(selected ? Theme.accent.opacity(0.5) : Theme.line))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// Quiet-hours window. Committed on Enter or focus loss rather than per
/// keystroke — "2" on the way to "22:00" is not a value worth PATCHing.
/// Clearing either field clears the window.
private struct QuietHoursField: View {
    let start: String?
    let end: String?
    let disabled: Bool
    let onCommit: (String?, String?) -> Void

    @State private var startText = ""
    @State private var endText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.s1) {
            HStack(spacing: Theme.s2) {
                Text("Quiet hours").font(.body).foregroundStyle(Theme.text)
                Spacer()
                field($startText, label: "Quiet hours start")
                Text("→").foregroundStyle(Theme.textDim)
                field($endText, label: "Quiet hours end")
            }
            Text(invalid
                 ? "Use 24-hour times like 22:00 and 08:00. Clear both to switch it off."
                 : "No banners during this window. A window that crosses midnight is fine.")
                .font(.caption)
                .foregroundStyle(invalid ? .orange : Theme.textDim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Theme.s2)
        .onAppear { syncFromModel() }
        .onChange(of: start) { _, _ in syncFromModel() }
        .onChange(of: end) { _, _ in syncFromModel() }
    }

    /// Both fields blank = deliberately cleared, which is valid. Anything else
    /// that doesn't parse as a full window is flagged.
    private var invalid: Bool {
        let bothBlank = startText.trimmingCharacters(in: .whitespaces).isEmpty
            && endText.trimmingCharacters(in: .whitespaces).isEmpty
        if bothBlank { return false }
        let pair = QuietHours.pair(start: startText, end: endText)
        return pair.start == nil
    }

    private func field(_ text: Binding<String>, label: String) -> some View {
        TextField("--:--", text: text)
            .textFieldStyle(.roundedBorder)
            .frame(width: 76)
            .multilineTextAlignment(.center)
            .disabled(disabled)
            .accessibilityLabel(label)
            .onSubmit(commit)
    }

    private func syncFromModel() {
        startText = start ?? ""
        endText = end ?? ""
    }

    private func commit() {
        let pair = QuietHours.pair(start: startText, end: endText)
        onCommit(pair.start, pair.end)
        // Echo the normalized values back so "9:5" visibly becomes "09:05";
        // an unparseable entry keeps what was typed so it can be corrected.
        if let s = pair.start, let e = pair.end {
            startText = s
            endText = e
        }
    }
}
