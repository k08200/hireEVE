import Carbon.HIToolbox
import SwiftUI

/// The Preferences overlay shown over the full view. A self-contained dark card:
/// notification control, hotkey reference, account, and about. Dismissed via
/// "Done" (default keyboard action) or by clicking the scrim (see FullView).
struct PreferencesView: View {
    @Environment(AppModel.self) private var model
    let actions: TopBarActions

    // Login-item state is owned by the OS (System Settings can flip it behind
    // our back), so it's read live on appear rather than persisted here.
    @State private var launchAtLogin = false
    @State private var loginItemError: String?
    @State private var updateChecking = false
    @State private var updateOutcome: UpdateCheck.Outcome?
    @State private var recordingShortcut = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(L("prefs.title")).font(.title3.weight(.semibold)).foregroundStyle(Theme.text)
                Spacer()
                // Amber, not system blue — the sheet's one primary action
                // speaks in the brand accent like every other primary.
                Button(L("prefs.done")) { model.showPreferences = false }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(.bottom, 12)

            // Pinned header, scrolling body: the behaviour sections push the
            // panel past the 860pt full view, and Done must stay reachable
            // without scrolling to the bottom first.
            ScrollView { sections }
                .frame(maxHeight: 620)
        }
        .onAppear { launchAtLogin = LoginItem.isEnabled }
        .padding(22)
        .frame(width: 440)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.line))
        .shadow(color: Theme.panelShadow, radius: 24, y: 8)
    }

    @ViewBuilder
    private var sections: some View {
        @Bindable var settings = model.settings

        VStack(alignment: .leading, spacing: 0) {
            // Server-owned behaviour first: "what does Klorn do, and what is
            // allowed to interrupt me" outranks local chrome like the hotkey.
            if model.phase == .signedIn {
                AutomationPreferences()
            }

            section(L("prefs.section.notifications")) {
                Toggle(isOn: $settings.notificationsEnabled) {
                    Text(L("prefs.banners")).foregroundStyle(Theme.text)
                }
                .toggleStyle(.switch).tint(Theme.accent)
                Text(L("prefs.banners.detail"))
                    .font(.caption).foregroundStyle(Theme.textDim).fixedSize(horizontal: false, vertical: true)
            }

            section(L("prefs.section.general")) {
                if LoginItem.isAvailable {
                    Toggle(isOn: $launchAtLogin) {
                        Text(L("prefs.launchAtLogin")).foregroundStyle(Theme.text)
                    }
                    .toggleStyle(.switch).tint(Theme.accent)
                    .onChange(of: launchAtLogin) { _, wanted in
                        guard wanted != LoginItem.isEnabled else { return }
                        if let error = LoginItem.setEnabled(wanted) {
                            loginItemError = error
                            launchAtLogin = LoginItem.isEnabled  // revert to OS truth
                        } else {
                            loginItemError = nil
                        }
                    }
                    if let loginItemError {
                        Text(loginItemError).font(.caption).foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    infoRow(L("prefs.launchAtLogin.unavailable.label"), L("prefs.launchAtLogin.unavailable.value"))
                }

                HStack {
                    Text(L("prefs.updates")).font(.body).foregroundStyle(Theme.text)
                    Spacer()
                    switch updateOutcome {
                    case .updateAvailable(let version):
                        Button(L("prefs.updates.get", version)) { UpdateCheck.openReleasePage() }
                            .buttonStyle(PrimaryButtonStyle())
                    case .upToDate:
                        Text(L("prefs.updates.upToDate", AppInfo.version))
                            .font(.caption).foregroundStyle(Theme.textDim)
                    case .unknown:
                        Text(L("prefs.updates.unknown"))
                            .font(.caption).foregroundStyle(Theme.textDim)
                    case nil:
                        EmptyView()
                    }
                    Button(updateChecking ? L("prefs.updates.checking") : L("prefs.updates.check")) {
                        updateChecking = true
                        Task {
                            updateOutcome = await UpdateCheck.run()
                            updateChecking = false
                        }
                    }
                    .buttonStyle(.bordered).controlSize(.small).disabled(updateChecking)
                }
            }

            section(L("prefs.section.topBar")) {
                Toggle(isOn: $settings.pillVisible) {
                    Text(L("prefs.pillVisible")).foregroundStyle(Theme.text)
                }
                .toggleStyle(.switch).tint(Theme.accent)
                Text(L("prefs.pillVisible.detail"))
                    .font(.caption).foregroundStyle(Theme.textDim).fixedSize(horizontal: false, vertical: true)

                Toggle(isOn: $settings.showInDock) {
                    Text(L("prefs.showInDock")).foregroundStyle(Theme.text)
                }
                .toggleStyle(.switch).tint(Theme.accent)
                Text(L("prefs.showInDock.detail"))
                    .font(.caption).foregroundStyle(Theme.textDim).fixedSize(horizontal: false, vertical: true)
            }

            section(L("prefs.section.keyboard")) {
                HStack {
                    Text(L("prefs.shortcut")).font(.body).foregroundStyle(Theme.text)
                    Spacer()
                    ShortcutRecorder(
                        shortcut: model.settings.shortcut,
                        recording: recordingShortcut,
                        onStartRecording: {
                            recordingShortcut = true
                            model.settings.onShortcutRecordingChanged?(true)
                        },
                        onCapture: { model.settings.shortcut = $0 },
                        onFinished: {
                            recordingShortcut = false
                            model.settings.onShortcutRecordingChanged?(false)
                        },
                        onReset: {
                            recordingShortcut = false
                            model.settings.onShortcutRecordingChanged?(false)
                            model.settings.shortcut = .defaultToggle
                        })
                }
                Text(recordingShortcut
                     ? L("prefs.shortcut.recording")
                     : L("prefs.shortcut.idle"))
                    .font(.caption).foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }

            section(L("prefs.section.language")) {
                HStack {
                    Text(L("lang.label")).font(.body).foregroundStyle(Theme.text)
                    Spacer()
                    Picker(L("lang.label"), selection: $settings.appLanguage) {
                        ForEach(AppLanguage.allCases, id: \.self) { language in
                            Text(language.label).tag(language)
                        }
                    }
                    .labelsHidden().pickerStyle(.menu).frame(width: 160)
                    .accessibilityLabel(L("lang.label"))
                }
                Text(L("lang.detail"))
                    .font(.caption).foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }

            section(L("prefs.section.account")) {
                infoRow(L("prefs.account.status"),
                        model.phase == .signedIn ? L("prefs.account.signedIn") : L("prefs.account.signedOut"))
                if model.phase == .signedIn {
                    Button(L("prefs.account.signOut")) { model.showPreferences = false; actions.onSignOut() }
                        .buttonStyle(.bordered).controlSize(.small)
                }
            }

            section(L("prefs.section.about")) {
                infoRow(L("prefs.about.version"), AppInfo.version)
                infoRow(L("prefs.about.api"), Config.apiBaseURL)
            }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ColumnHeader(title: title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        Divider().overlay(Theme.line)
    }

    /// A read-only label · value row; the value is selectable (e.g. the API URL).
    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.body).foregroundStyle(Theme.text)
            Spacer()
            Text(value).font(.callout.monospacedDigit()).foregroundStyle(Theme.textDim)
                .textSelection(.enabled).lineLimit(1).truncationMode(.middle)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L("prefs.infoRow.a11y", label, value))
    }
}

/// A macOS-style shortcut recorder: shows the current chord (⌥⌘K); click to
/// record, then the next valid key-with-modifier chord is captured via a local
/// NSEvent monitor (the Preferences panel is key while open). Esc cancels; the
/// ⌫ button resets to the default.
private struct ShortcutRecorder: View {
    let shortcut: Shortcut
    let recording: Bool
    let onStartRecording: () -> Void
    let onCapture: (Shortcut) -> Void
    let onFinished: () -> Void
    let onReset: () -> Void
    @State private var monitor: Any?

    var body: some View {
        HStack(spacing: 6) {
            Button(recording ? L("prefs.shortcut.typePrompt") : ShortcutFormat.display(shortcut)) {
                onStartRecording()
            }
            .buttonStyle(.bordered).controlSize(.small)
            .tint(recording ? Theme.accent : nil)
            .frame(minWidth: 96)
            .accessibilityLabel(L("prefs.shortcut.change.a11y", ShortcutFormat.display(shortcut)))

            Button(action: onReset) {
                Image(systemName: "arrow.uturn.backward").font(.caption)
            }
            .buttonStyle(.borderless).controlSize(.small)
            .help(L("prefs.shortcut.reset.help"))
            .accessibilityLabel(L("prefs.shortcut.reset.a11y"))
        }
        .onChange(of: recording) { _, isRecording in
            if isRecording { startCapture() } else { stopCapture() }
        }
        .onDisappear { stopCapture() }
    }

    private func startCapture() {
        stopCapture()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.keyCode == UInt16(kVK_Escape) {  // cancel, no change
                onFinished()
                return nil
            }
            let carbon = ShortcutFormat.carbonModifiers(from: event.modifierFlags)
            guard ShortcutFormat.isValid(carbonModifiers: carbon) else {
                return nil  // modifier-less / shift-only: ignore, keep listening
            }
            onCapture(Shortcut(keyCode: UInt32(event.keyCode), carbonModifiers: carbon))
            onFinished()
            return nil  // consume so the key doesn't leak into the app
        }
    }

    private func stopCapture() {
        if let monitor { NSEvent.removeMonitor(monitor); self.monitor = nil }
    }
}
