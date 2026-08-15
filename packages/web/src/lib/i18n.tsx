"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Locale = "en" | "ko";

// English is the source of truth for keys; Korean is a full mirror (founder
// decision 2026-07-06 reversing the earlier English-only policy — the UI is
// selectable en/ko via Settings → Language).
const enTranslations: Record<string, string> = {
  // Nav
  "nav.dashboard": "Dashboard",
  "nav.chat": "Chat",
  "nav.email": "Email",
  "nav.calendar": "Calendar",
  "nav.tasks": "Tasks",
  "nav.notes": "Notes",
  "nav.contacts": "Contacts",
  "nav.reminders": "Reminders",
  "nav.auto": "Auto",
  "nav.decisionQueue": "Decision queue",
  "nav.mail": "Mail",
  "nav.briefing": "Briefing",
  "nav.assistant": "Assistant",
  "nav.admin": "Admin",
  "nav.graph": "Graph",
  "nav.billing": "Plan and billing",
  "nav.usage": "Usage",
  "nav.workspace": "Workspace",
  "nav.logIn": "Log in",
  "nav.logout": "Log out",
  "nav.home": "Home",
  "nav.earlyAccess": "Early access",
  // Bottom tabs (mobile)
  "tabs.queue": "Queue",
  "tabs.account": "Account",
  // Auth
  "auth.signIn": "Sign in",
  "auth.signUp": "Create account",
  "auth.signingIn": "Signing in...",
  "auth.creatingAccount": "Creating account...",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name",
  "auth.noAccount": "Don't have an account? Sign up",
  "auth.hasAccount": "Already have an account? Sign in",
  "auth.backHome": "Back to home",
  "auth.welcome": "Welcome back!",
  "auth.accountCreated": "Account created!",
  "auth.welcomeBack": "Welcome back",
  "auth.titleLogin": "Return to your decision queue",
  "auth.titleRegister": "Start with Klorn",
  "auth.descLogin": "Reconnect your work signals and continue where you left off.",
  "auth.descRegister":
    "Connect Gmail and Calendar to turn team signals into evidence-backed decision cards.",
  "auth.inviteOnlyTitle": "Klorn is invite-only.",
  "auth.inviteOnlyBody":
    "The beta is capped while Google's security review clears, so every account is approved by hand. Request access first — you can sign in the moment you're approved.",
  "auth.requestEarlyAccess": "Request early access",
  "auth.googleApprovedSignIn": "Already approved? Sign in with Google",
  "auth.continueWithGoogle": "Continue with Google",
  "auth.orContinueEmail": "or continue with email",
  "auth.orSignInEmail": "or sign in with email",
  "auth.signUpShort": "Sign up",
  "auth.resetPassword": "Reset password",
  "auth.passwordMin": "At least 8 characters",
  "auth.openDecisionQueue": "Open decision queue",
  "auth.needAccount": "Need an account?",
  "auth.haveAccount": "Already have an account?",
  "auth.switchToSignUp": "Switch to sign-up",
  "auth.switchToLogIn": "Switch to log-in",
  "auth.approvedCantSignIn": "Approved but can't sign in?",
  "auth.resetYourPassword": "Reset your password",
  // Auth — login left panel (aside), doctrine, toasts, deep-link banner
  "auth.asideTitle": "Keep only the work that needs a decision",
  "auth.asideBody":
    "Klorn reads mail, calendar, and task signals, then turns them into cards you can review before anything runs.",
  "auth.stepSignal": "Signal",
  "auth.stepSignalDesc": "Detect meaningful changes in mail and calendar",
  "auth.stepContext": "Context",
  "auth.stepContextDesc": "Connect people, deadlines, and projects",
  "auth.stepApproval": "Approval",
  "auth.stepApprovalDesc": "Review evidence before external execution",
  "auth.betaScope":
    "Free during the private beta. Google flags unverified apps with the restricted Gmail scope until CASA review clears — standard for every Gmail integration.",
  "auth.noSilentActions":
    "What we don't do: send mail without a click-through receipt. Every send, permanent delete, and external forward is hash-bound and verifiable on read.",
  "auth.readDoctrine": "Read the doctrine before the login flow →",
  "auth.openSourceVersion": "Open source · AGPLv3 · v0.3.0",
  "auth.signInToContinue": "Sign in to continue to {destination}.",
  "auth.googleSignInError": "Google sign-in could not be completed. Please try again.",
  "auth.googleDenied": "Google connection was canceled — just try again whenever you're ready.",
  "auth.googleUnverified":
    "Google reports this account's email address as unverified, so it can't be used to sign in. Verify the address with Google, or use a different account.",
  "auth.continueWithApple": "Continue with Apple",
  "auth.continueWithNaver": "Continue with Naver",
  "auth.socialSignInError": "Sign-in could not be completed. Please try again.",
  "auth.socialDenied": "Sign-in was canceled — just try again whenever you're ready.",
  "auth.socialEmailInUse":
    "This email already has a Klorn account. Sign in the way you originally did — you can link other accounts from Settings.",
  "auth.socialEmailUnverified":
    "This provider can't verify that email address, so it can't be used to sign in. Use an address the provider owns, or a different sign-in method.",
  "auth.sessionExpired": "Your session expired. Please sign in again.",
  "auth.inviteOnlyRedirect":
    "Klorn is invite-only right now. Request access from the early access page.",
  "auth.emailVerified": "Email verified. You can sign in now.",
  "auth.passwordMinChars": "Use at least {count} characters.",
  "auth.genericError": "Something went wrong.",
  "auth.formGroupLabel": "Sign in or create an account",
  "auth.destMemory": "Memory settings",
  "auth.destUsage": "Usage settings",
  "auth.destStatus": "System status",
  "auth.destFeedback": "Mail feedback",
  "auth.destFiles": "Files",
  // Settings
  "settings.title": "Settings",
  "settings.subtitle": "Profile, notifications, execution boundaries, and data",
  "settings.profile": "Operator profile",
  "settings.security": "Access security",
  "settings.integrations": "Connections",
  "settings.displayName": "Display name",
  "settings.language": "Language",
  "settings.timezone": "Time zone",
  "settings.saveProfile": "Save profile",
  "settings.saved": "Saved",
  "settings.currentPassword": "Current password",
  "settings.newPassword": "New password",
  "settings.changePassword": "Change password",
  "settings.changing": "Changing...",
  "settings.connected": "Connected",
  "settings.disconnect": "Disconnect",
  "settings.connect": "Connect",
  "settings.envVars": "Set env vars to enable",
  "settings.quickActions": "Quick Actions",
  "settings.dailyBriefing": "Daily briefing",
  "settings.generateNow": "Generate Now",
  "settings.capabilities": "Decision OS Surfaces",
  "settings.data": "Workspace data",
  "settings.exportData": "Export workspace data",
  "settings.export": "Export",
  "settings.dangerZone": "Workspace reset",
  "settings.deleteAll": "Delete workspace",
  "settings.deleteBtn": "Delete account",
  "settings.about": "About",
  "settings.section.appearance": "Appearance",
  "settings.appearance.theme": "Theme",
  "settings.appearance.themeDesc": "System follows your OS setting and updates live.",
  "settings.appearance.system": "System",
  "settings.appearance.light": "Light",
  "settings.appearance.dark": "Dark",
  "settings.namePlaceholder": "Name",
  "settings.newPasswordPlaceholder": "At least 6 characters",
  "settings.toast.saveNameFailed": "Could not save your name. Please try again.",
  "settings.toast.profileSaved": "Profile saved.",
  "settings.oauthNoPassword.line1":
    "You are signed in with Google. Set a password to also use email login.",
  "settings.oauthNoPassword.line2": "Once saved, this account can sign in with email and password.",
  "settings.setPassword": "Set password",
  "settings.saving": "Saving...",
  "settings.toast.passwordMinLength": "Password must be at least 6 characters.",
  "settings.toast.passwordChanged": "Password changed — please log in again on your devices.",
  "settings.toast.passwordSet": "Password set.",
  "settings.toast.genericFailed": "Failed.",
  "settings.section.replies": "Replies",
  "settings.field.replyTone": "Reply tone",
  "settings.field.replyToneDesc":
    "How Klorn's drafts sound. It changes the wording, not what the reply says — and never the language: a reply is always written in the language of the mail it answers.",
  "settings.replyTone.matchMe.label": "Match me",
  "settings.replyTone.matchMe.desc": "Learn from my sent mail",
  "settings.replyTone.formal.label": "Formal",
  "settings.replyTone.formal.desc": "Polite and businesslike",
  "settings.replyTone.friendly.label": "Friendly",
  "settings.replyTone.friendly.desc": "Warm but professional",
  "settings.replyTone.casual.label": "Casual",
  "settings.replyTone.casual.desc": "Relaxed and short",
  "settings.field.notificationLanguage": "Notification language",
  "settings.field.notificationLanguageDesc":
    'The language Klorn writes its own notifications in ("Draft ready"). Separate from the app language above, because a notification is composed on the server.',
  "settings.toast.replyToneFailed": "Could not save reply tone.",
  "settings.toast.notifLanguageFailed": "Could not save notification language.",
  "settings.section.signalRhythm": "Signal rhythm",
  "settings.morningBriefing.title": "Morning briefing",
  "settings.morningBriefing.desc":
    "Sends one daily decision briefing in your time zone, even when you are away.",
  "settings.morningBriefing.timezoneNote":
    "Time zone: {timezone}. Change it in the profile section above.",
  "settings.field.deliveryTime": "Delivery time",
  "settings.deliveryTime.defaultNote": "Default is 06:00.",
  "settings.pushNotifications.title": "Push notifications",
  "settings.pushNotifications.unsupported": "This browser does not support push notifications.",
  "settings.pushNotifications.on": "On - receive reminders, briefings, and important mail alerts.",
  "settings.pushNotifications.blocked":
    "Blocked by the browser. Allow notifications in browser settings.",
  "settings.pushNotifications.off": "Receive reminders, briefings, and important mail alerts.",
  "settings.pushNotifications.blockedChip": "Blocked",
  "settings.pushNotifications.unsupportedChip": "Unsupported",
  "settings.turnOff": "Turn off",
  "settings.turnOn": "Turn on",
  "settings.toast.pushUnsupported": "This browser does not support notifications.",
  "settings.toast.pushEnabled": "macOS notifications enabled.",
  "settings.toast.pushRegistrationFailed": "Push registration failed.",
  "settings.toast.pushBlocked": "Notifications are blocked. Allow them in browser settings.",
  "settings.toast.pushDisabled": "Push notifications disabled.",
  "settings.notifPrefs.legend": "Which signals are worth interrupting you?",
  "settings.notifPrefs.legendDesc":
    "Disabled categories stay quiet across push and in-app notifications.",
  "settings.notifPrefs.essentialsOnly": "Essentials only",
  "settings.notifPrefs.essentialsOnlyDesc":
    "Mail that needs an answer, plus anything on your calendar. Everything else stays in the app without a notification.",
  "settings.notifPrefs.urgentMail.label": "Urgent mail",
  "settings.notifPrefs.urgentMail.desc": "New mail Klorn considers time-sensitive",
  "settings.notifPrefs.meeting.label": "Meeting reminders",
  "settings.notifPrefs.meeting.desc": "Upcoming meetings and standup reminders",
  "settings.notifPrefs.taskDue.label": "Due and overdue",
  "settings.notifPrefs.taskDue.desc": "Task due-date reminders",
  "settings.notifPrefs.agentProposal.label": "Agent proposals",
  "settings.notifPrefs.agentProposal.desc": "When Klorn needs approval before acting",
  "settings.notifPrefs.dailyBriefing.label": "Daily briefing",
  "settings.notifPrefs.dailyBriefing.desc": "Your daily decision briefing",
  "settings.quietHours.title": "Quiet hours",
  "settings.quietHours.desc":
    "Pause push notifications during this window. Leave blank for no limit.",
  "settings.quietHours.startSrLabel": "Quiet hours start time",
  "settings.quietHours.startAriaLabel": "Quiet hours start",
  "settings.quietHours.endSrLabel": "Quiet hours end time",
  "settings.quietHours.endAriaLabel": "Quiet hours end",
  "settings.quietHours.to": "to",
  "settings.phoneEscalation.title": "Phone escalation",
  "settings.phoneEscalation.desc":
    "Calls you once when an urgent notification goes unacknowledged for 5 minutes. Max 3 calls/day. Quiet hours always win. Requires a verified phone number and server-side Twilio setup.",
  "settings.toast.settingSaveFailed": "Could not save setting.",
  "settings.toast.presetFailed": "Could not apply the preset.",
  "settings.toast.briefingEnabled": "Daily briefing enabled.",
  "settings.toast.briefingDisabled": "Daily briefing disabled.",
  "settings.toast.briefingSaveFailed": "Could not save briefing setting.",
  "settings.toast.briefingTimeSaved": "Briefing time saved.",
  "settings.toast.briefingTimeSaveFailed": "Could not save briefing time.",
  "settings.toast.phoneEscalationEnabled": "Phone escalation enabled.",
  "settings.toast.phoneEscalationDisabled": "Phone escalation disabled.",
  "settings.section.decisionAgent": "Decision agent",
  "settings.executionBoundary.title": "Execution boundary",
  "settings.executionBoundary.desc":
    "Let Klorn watch work, calendar, and mail in the background within approval limits.",
  "settings.field.agentMode": "Agent mode",
  "settings.agentMode.shadowNote":
    "Klorn quietly prepares drafts and approval-ready work, then queues it.",
  "settings.agentMode.autoNote":
    "Low-risk internal work can run automatically. Replies, calendar changes, and destructive work still require explicit approval.",
  "settings.field.alwaysAllowedTools": "Always-allowed tools",
  "settings.tool.runWithinPolicy": "Run within policy",
  "settings.tool.reviewFirst": "Review first",
  "settings.alwaysAllowedTools.note":
    "Enabled tools still run only within policy. Mail replies and destructive work cannot be pre-approved here.",
  "settings.field.checkInterval": "Check interval",
  "settings.checkInterval.3min": "Every 3 min",
  "settings.checkInterval.5min": "Every 5 min (default)",
  "settings.checkInterval.10min": "Every 10 min",
  "settings.checkInterval.15min": "Every 15 min",
  "settings.checkInterval.30min": "Every 30 min",
  "settings.autoMarkRead.label": "Auto-mark Gmail as read",
  "settings.autoMarkRead.desc":
    "In auto mode, Klorn can mark the original Gmail thread as read after sending a reply. Default is off so unread mail remains a fallback.",
  "settings.state.on": "On",
  "settings.state.off": "Off",
  "settings.proactiveAlerts.label": "Proactive alerts",
  "settings.proactiveAlerts.desc":
    "Klorn watches for unanswered emails, overdue tasks, upcoming meetings, and follow-up opportunities — and alerts you before they slip.",
  "settings.toast.proactiveOn":
    "Proactive alerts on — Klorn will notify you about unanswered emails, overdue tasks, and upcoming meetings.",
  "settings.toast.proactiveOff": "Proactive alerts off.",
  "settings.runAgentNow": "Run agent now",
  "settings.state.running": "Running...",
  "settings.runAgentNow.desc": "Check signals now without waiting for the next cycle.",
  "settings.toast.agentRunStarted": "Agent run started. Check the decision queue for results.",
  "settings.toast.agentRunFailed": "Could not run the agent.",
  "settings.viewRecentActivity": "View recent activity",
  "settings.agentLog.toolPrefix": "Tool: {tool}",
  "settings.refreshPatterns": "Refresh learned patterns",
  "settings.whatLearned": "What has Klorn learned about you?",
  "settings.state.analyzing": "Analyzing...",
  "settings.patterns.notEnough": "Not enough data yet — patterns emerge after a few days of use.",
  "settings.confidence.high": "HIGH",
  "settings.confidence.med": "MED",
  "settings.confidence.low": "LOW",
  "settings.toast.agentEnabled": "Decision agent enabled.",
  "settings.toast.agentDisabled": "Decision agent disabled.",
  "settings.toast.updateFailed": "Could not update.",
  "settings.toast.intervalSaveFailed": "Could not save check interval.",
  "settings.toast.modeSaveFailed": "Could not save mode.",
  "settings.toast.updateFailedWithReason": "Update failed: {reason}",
  "settings.error": "Error",
  "settings.confirm.allowTool.title": "Allow this tool to run automatically?",
  "settings.confirm.allowTool.message":
    "{tool} can run without a separate approval when Auto mode decides it is within policy. Mail replies and destructive actions still require approval.",
  "settings.confirm.allowTool.confirmLabel": "Allow tool",
  "settings.confirm.autoMode.title": "Switch to Auto mode?",
  "settings.confirm.autoMode.message":
    "Klorn can run low-risk internal actions automatically. External replies, calendar changes, destructive work, and anything outside policy still require approval.",
  "settings.confirm.autoMode.confirmLabel": "Use Auto mode",
  "settings.confirm.autoMarkRead.title": "Auto-mark Gmail as read?",
  "settings.confirm.autoMarkRead.message":
    "After Klorn sends an approved auto-mode reply, the original Gmail thread can be marked as read. Keep this off if unread mail is part of your fallback workflow.",
  "settings.confirm.autoMarkRead.confirmLabel": "Turn on",
  "settings.confirm.disconnectGoogle.title": "Disconnect Google",
  "settings.confirm.disconnectGoogle.message":
    "Remove Gmail and Calendar access. You can reconnect at any time.",
  "settings.confirm.disconnectGoogle.confirmLabel": "Disconnect",
  "settings.confirm.deleteWorkspace.title": "Delete workspace data",
  "settings.confirm.deleteWorkspace.message":
    "Delete all decision threads, tasks, memories, contacts, and reminders. This cannot be undone.",
  "settings.confirm.deleteWorkspace.confirmLabel": "Delete workspace",
  "settings.confirm.deleteAccount.title": "Delete your account",
  "settings.confirm.deleteAccount.message":
    "This permanently deletes your Klorn account and ALL of your data — emails, classifications, tasks, memories, calendar events, connected Google access, and settings. This cannot be undone.",
  "settings.confirm.deleteAccount.confirmLabel": "Delete my account",
  "settings.section.connections": "Connections",
  "settings.integration.google.desc":
    "Reads Gmail and Calendar signals and connects them to meeting prep.",
  "settings.integration.slack.connectedVia": "Connected via {method}",
  "settings.integration.slack.viaBotToken": "bot token",
  "settings.integration.slack.viaWebhook": "webhook",
  "settings.integration.slack.adminOnly": "An admin must set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL.",
  "settings.integration.notion.desc": "Prepares page search, document drafts, and database access.",
  "settings.sendTest": "Send test",
  "settings.state.sending": "Sending...",
  "settings.chip.adminSetup": "Admin setup",
  "settings.chip.comingSoon": "Coming soon",
  "settings.toast.slackTestSent": "Slack test message sent.",
  "settings.toast.slackTestFailed": "Could not send test message.",
  "settings.toast.googleDisconnectFailed": "Could not disconnect Google.",
  "settings.toast.googleDisconnected": "Google disconnected.",
  "settings.toast.requestFailed": "Request failed.",
  "settings.realtimeSync.title": "Real-time mail sync",
  "settings.realtimeSync.activeUntil":
    "Gmail push is active until {date}. It renews automatically before expiration.",
  "settings.realtimeSync.active":
    "Gmail push is active and renews automatically before expiration.",
  "settings.realtimeSync.subscribe":
    "Subscribe to Gmail push so mail signals arrive immediately. If off, Klorn checks every minute.",
  "settings.realtimeSync.notConfigured":
    "The server Pub/Sub topic is not configured yet. Ask an admin to enable it.",
  "settings.realtimeSync.unavailable": "Unavailable",
  "settings.toast.gmailPushEnableFailed": "Could not enable real-time sync.",
  "settings.toast.gmailPushEnabled": "Real-time mail sync enabled.",
  "settings.toast.gmailPushDisableFailed": "Could not disable real-time sync.",
  "settings.toast.gmailPushDisabled":
    "Real-time mail sync disabled. Scheduled checks will continue.",
  "settings.section.manualRuns": "Manual runs",
  "settings.manualRuns.dailyBriefing.desc":
    "Build a priority briefing from tasks, calendar, and mail signals.",
  "settings.generateBriefing": "Generate briefing",
  "settings.toast.briefingGenerated": "Briefing generated. Review it on the briefing screen.",
  "settings.toast.briefingGenerateFailed": "Could not generate briefing.",
  "settings.exportWorkspace.desc":
    "Download decision threads, signals, memory, and execution history as JSON.",
  "settings.toast.exportFailed": "Data export failed.",
  "settings.toast.exported": "Data exported.",
  "settings.deleteWorkspace.desc":
    "Permanently delete decision threads, tasks, memories, contacts, and reminders.",
  "settings.deleteAccount.desc":
    "Permanently delete your account, Google access, and all data. This cannot be undone.",
  "settings.toast.deleteWorkspaceFailed": "Could not delete workspace data.",
  "settings.toast.workspaceDeleted": "Workspace data deleted.",
  "settings.toast.deleteAccountFailed": "Could not delete your account.",
  "settings.about.tagline": "Decision OS",
  "settings.about.desc": "Built to reduce scattered tabs and make the next decision clearer.",
  "settings.about.version": "v0.2.0 — MVP",
  // Onboarding
  "onboarding.welcome.titleLine1": "Klorn surfaces only the",
  "onboarding.welcome.titleLine2": "decisions worth acting on.",
  "onboarding.welcome.desc":
    "Connect Gmail and Google Calendar. Klorn pulls the items that need a decision and quiets the rest.",
  "onboarding.welcome.connecting": "Redirecting to Google...",
  "onboarding.welcome.connectButton": "Connect Gmail & Calendar",
  "onboarding.welcome.preferNaver": "Prefer Naver Mail?",
  "onboarding.welcome.connectViaImap": "Connect it via IMAP in Settings",
  "onboarding.welcome.feature.readMail": "Read mail",
  "onboarding.welcome.feature.trackMeetings": "Track meetings",
  "onboarding.welcome.feature.surfaceDecisions": "Surface decisions",
  "onboarding.welcome.permissions.pre": "Klorn",
  "onboarding.welcome.permissions.emphasis1": "only reads",
  "onboarding.welcome.permissions.mid":
    "Gmail and Calendar. Sending mail or creating events always waits for",
  "onboarding.welcome.permissions.emphasis2": "your approval",
  "onboarding.welcome.permissions.suffix": ".",
  "onboarding.syncing.title": "Setting up your workspace...",
  "onboarding.syncing.titleDone": "Sync complete.",
  "onboarding.syncing.desc":
    "Reading your recent emails and calendar. This takes about 30 seconds.",
  "onboarding.syncing.descDone": "Klorn has read your inbox and mapped your schedule.",
  "onboarding.syncing.emailsProcessed": "{count} emails processed",
  "onboarding.syncing.readingEmails": "Reading emails...",
  "onboarding.syncing.eventsSynced": "{count} events synced",
  "onboarding.syncing.syncingCalendar": "Syncing calendar...",
  "onboarding.syncing.contactsSaved": "{count} contacts saved",
  "onboarding.syncing.loadingContacts": "Loading contacts...",
  "onboarding.syncing.continueSeeFound": "See what Klorn found",
  "onboarding.syncing.continueToInbox": "Continue to inbox",
  "onboarding.ready.title": "You're set up.",
  "onboarding.ready.desc":
    "Klorn is running. It'll surface decisions, track commitments, and prepare your morning briefing — all before you open your inbox.",
  "onboarding.ready.stat.emailsRead": "Emails read",
  "onboarding.ready.stat.eventsSynced": "Events synced",
  "onboarding.ready.stat.contacts": "Contacts",
  "onboarding.ready.whatNext.title": "What happens next",
  "onboarding.ready.whatNext.item1": "Your morning briefing will be ready before you wake up.",
  "onboarding.ready.whatNext.item2":
    "Decision cards appear when Klorn finds something that needs your approval.",
  "onboarding.ready.whatNext.item3": "Commitments are tracked automatically from your emails.",
  "onboarding.ready.openQueue": "Open decision queue",
  "onboarding.review.title": "Does this look right?",
  "onboarding.review.desc":
    "Klorn sorted your recent inbox into tiers. Confirm the calls it got right and fix the ones it didn't — a few is enough to teach it what matters to you.",
  "onboarding.review.readingInbox": "Reading your inbox…",
  "onboarding.review.loadError":
    "Couldn't load your classifications right now. You can review them anytime from your inbox.",
  "onboarding.review.emptyState":
    "No mail to review yet — Klorn will sort new email as it arrives.",
  "onboarding.review.groupAriaLabel": "{tier} emails",
  "onboarding.review.continueReviewed": "Continue — {count} reviewed",
  "onboarding.review.continueDefault": "Looks good — continue",
  "onboarding.review.footerNote":
    "Every confirm or fix teaches Klorn. You can refine any tier later from your inbox.",
  "onboarding.review.card.unknownSender": "Unknown sender",
  "onboarding.review.card.noSubject": "(no subject)",
  "onboarding.review.card.keptIn": "Kept in {tier} ✓",
  "onboarding.review.card.movedTo": "Moved to {tier} ✓",
  "onboarding.review.card.looksRight": "Looks right",
  "onboarding.review.card.orMoveTo": "or move to",
  // Dashboard
  "dashboard.greeting": "Good {timeOfDay}, {name}",
  "dashboard.morning": "morning",
  "dashboard.afternoon": "afternoon",
  "dashboard.evening": "evening",
  // Chat
  "chat.newConversation": "New decision thread",
  "chat.typeMessage": "Ask for a decision, context trace, or next move...",
  "chat.send": "Send",
  "chat.newChat": "New chat",
  "chat.suggestion1": "Summarize my unread mail",
  "chat.suggestion2": "Find the last email from my boss",
  "chat.suggestion3": "What's on my calendar tomorrow?",
  "chat.suggestion4": "내일 3시 김대표 미팅 잡아줘",
  "chat.emptyState":
    "Ask about your mail, calendar, or briefing — or speak with the mic. I work only on your Klorn data.",
  "chat.loadingConversation": "Loading conversation…",
  "chat.inputPlaceholder": "Ask about your mail or calendar…",
  "chat.thinking": "Thinking…",
  "chat.sendFailed": "Could not send your message — it's back in the input box. Try again.",
  // Calendar event draft card
  "draft.title": "Calendar event draft",
  "draft.save": "Save to calendar",
  "draft.saving": "Saving…",
  "draft.saved": "Saved to your calendar ✓",
  "draft.paywall": "Saving events needs a Pro plan.",
  "draft.seePlans": "See plans",
  "draft.error": "Could not save the event. Please try again.",
  // Mail
  "mail.filterAll": "All signals",
  "mail.filterReplyNeeded": "Needs reply",
  "mail.filterUrgent": "Urgent",
  "mail.filterUnread": "Unread",
  "mail.filterAttachments": "Attachments",
  "mail.filterCandidates": "Candidates",
  "mail.filterThreads": "Threads",
  "mail.filterAutomated": "Automated",
  "mail.compose": "Compose",
  "mail.searchMail": "Search mail",
  "mail.searchPlaceholder": "Search mail, attachments, fields",
  "mail.emptyReplyTitle": "Nothing needs a reply",
  "mail.emptyTitle": "No mail here",
  "mail.emptyDemoBody": "Connect Gmail in Settings so Klorn can sort your real mail.",
  "mail.emptyBody": "When Klorn finds mail that needs you, it rises to the top.",
  "mail.emptyAll": "No mail signals yet.",
  "mail.emptyReplyNow": "Nothing needs a reply right now.",
  "mail.emptyFilter": "No signals match this filter.",
  "mail.emptyReplyHint":
    "Switch tabs to see urgent, unread, or all mail — Klorn promotes a thread here when it detects something you should answer.",
  "mail.emptySyncHint": "After sync, mail that needs action rises to the top.",
  "mail.showAllSignals": "Show all signals",
  "mail.connectGoogle": "Connect Google",
  // Calendar
  "calendar.newEvent": "New event",
  "calendar.needPrep": "Meetings that need prep",
  "calendar.voiceParsing": "Understanding your event…",
  // Decision queue (inbox)
  "inbox.decisions": "Decisions",
  "inbox.tracking": "Tracking",
  "inbox.allClear": "All clear",
  "inbox.nothingNeedsYou": "Nothing needs you right now",
  "inbox.nothingToDecide": "Nothing to decide",
  "inbox.nothingToDecideToday": "Nothing to decide today.",
  "inbox.emptyBody":
    "Klorn is watching your mail and calendar. When something needs a decision, it lands here.",
  "inbox.emptyBodyMobile": "Klorn is watching your mail and calendar. New decisions land here.",
  "inbox.openMail": "Open mail",
  "inbox.tourTitle": "New here? 30-second tour",
  // Briefing
  "briefing.learningMode":
    "Klorn learns mail and calendar patterns during the first 2-3 days. The top actions get sharper as you use the workspace.",
  "briefing.heading": "Today's decision brief",
  "briefing.notGenerated": "Not generated yet",
  "briefing.generate": "Generate",
  "briefing.generateNow": "Generate now",
  "briefing.generating": "Generating...",
  "briefing.regenerate": "Regenerate",
  // Common
  "common.loading": "Loading...",
  "common.syncNow": "Sync now",
  "common.syncing": "Syncing...",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "common.save": "Save",
  "common.or": "or",
  // Skills
  "skills.title": "Skills",
  "skills.subtitle": "Reusable workflows Klorn can run for you",
  "skills.newSkill": "+ New Skill",
  "skills.edit": "Edit Skill",
  "skills.name": "Skill name",
  "skills.description": "Description (optional)",
  "skills.prompt": "Prompt template",
  "skills.create": "Create",
  "skills.update": "Update",
  "skills.empty": "No skills yet",
  // Approval UX
  "approval.approve": "Approve",
  "approval.reject": "Reject",
  "approval.alwaysAllow": "Always allow",
  "approval.neverSuggest": "Never suggest this",
  // Notifications
  "notif.title": "Notifications",
  "notif.push": "Push Notifications",
  "notif.preferences": "Which notifications do you want?",
  "notif.quietHours": "Quiet hours",
  "notif.quietHoursDesc": "Suppress push notifications during this window",
  "notif.categoryEmailUrgent": "Urgent email alerts",
  "notif.categoryMeeting": "Meeting reminders",
  "notif.categoryTaskDue": "Task due soon or overdue",
  "notif.categoryAgentProposal": "Agent proposals",
  "notif.categoryDailyBriefing": "Daily briefing",
  // Billing
  "billing.title": "Billing",
  "billing.subtitle":
    "Review decision limits, model usage, execution modes, and the plan that fits your team.",
  "billing.subscriptionActive": "Subscription is active.",
  "billing.checkoutCanceled": "Checkout was canceled.",
  "billing.currentPlan": "Current plan",
  "billing.aboutCostThisMonth": "About {amount} this month",
  "billing.manageSubscription": "Manage subscription",
  "billing.decisions": "Decisions",
  "billing.tokens": "Tokens",
  "billing.viewDetailedUsage": "View detailed usage",
  "billing.recommended": "Recommended",
  "billing.includedWithEveryPlan": "Included with every plan",
  "billing.contactSales": "Contact sales",
  "billing.subscriptionComingSoon": "Subscription coming soon",
  "billing.startTrial": "Start 7-day free trial",
  "billing.planDetailsHeading": "Plan details",
  "billing.error.loadStatus": "Could not load billing status.",
  "billing.error.unsafeRedirect": "Unsafe billing redirect URL.",
  "billing.error.checkoutFailed": "Could not create checkout session.",
  "billing.error.portalFailed": "Could not open billing portal.",
  "billing.plan.free.name": "Free",
  "billing.plan.free.limit": "50 decisions/mo · 500K tokens",
  "billing.plan.free.feature.mailCalendar": "Mail and calendar reading",
  "billing.plan.free.feature.tasksMemory": "Tasks and memory",
  "billing.plan.free.feature.freeModels": "Free OpenRouter models",
  "billing.plan.pro.name": "Pro",
  "billing.plan.pro.period": "/mo",
  "billing.plan.pro.trialNote": "7-day free trial · cancel anytime before it ends and pay nothing",
  "billing.plan.pro.limit": "2K decisions/mo · 10M tokens",
  "billing.plan.pro.feature.everythingFree": "Everything in Free",
  "billing.plan.pro.feature.sendMail": "Send mail and create calendar events",
  "billing.plan.pro.feature.decisionLoop": "Decision loop mode: suggest + policy execution",
  "billing.plan.pro.feature.briefings": "Daily briefings and mail triage",
  "billing.plan.pro.feature.replyDrafts": "Reply drafts and pattern learning",
  "billing.plan.pro.feature.integrations": "Slack and Notion integrations (coming soon)",
  "billing.plan.pro.feature.webResearch": "Web research and document drafts",
  "billing.plan.pro.feature.sonnet": "Claude Sonnet model selection",
  "billing.plan.enterprise.name": "Enterprise",
  "billing.plan.enterprise.price": "Custom",
  "billing.plan.enterprise.limit": "Unlimited",
  "billing.plan.enterprise.feature.everythingPro": "Everything in Pro",
  "billing.plan.enterprise.feature.opus": "Claude Opus selection",
  "billing.plan.enterprise.feature.onPrem": "On-prem options",
  "billing.plan.enterprise.feature.sla": "SLA support",
  "billing.plan.enterprise.feature.customIntegrations": "Custom integrations",
  "billing.faq.trial.q": "How does the 7-day free trial work?",
  "billing.faq.trial.a":
    'Starting Pro costs $0 today and unlocks everything in Pro immediately. The first charge of {price} happens when the 7-day trial ends. Cancel anytime before then from "Manage subscription" and you pay nothing.',
  "billing.faq.freeVsPro.q": "What is the difference between Free and Pro?",
  "billing.faq.freeVsPro.a":
    "Free reads and organizes: Klorn watches mail and calendar and turns them into decision cards, within 50 decisions and 500K tokens per month on free models. Pro executes: sending mail, creating calendar events, reply drafts, daily briefings, and the decision loop's suggest + policy execution — with 2K decisions and 10M tokens per month and Claude Sonnet model selection.",
  "billing.faq.enterprise.q": "What does Enterprise add?",
  "billing.faq.enterprise.a":
    "Custom limits instead of fixed quotas, Claude Opus model selection, on-prem deployment options, SLA-backed support, and custom integrations. Pricing depends on scope — contact sales.",
  "billing.faq.manage.q": "How do I cancel or manage my subscription?",
  "billing.faq.manage.a":
    '"Manage subscription" on this page opens the billing portal of Paddle, our merchant of record, where you can cancel, change the payment method, or download invoices. After cancelling, Pro stays active until the end of the period you already paid for.',
  // Usage
  "usage.title": "Usage",
  "usage.subtitlePre":
    "What the assistant actually spent — tokens, messages, and estimated model cost. Plan limits live on",
  "usage.subtitleLinkLabel": "billing",
  "usage.subtitlePost": ".",
  "usage.period.week": "This week",
  "usage.period.month": "This month",
  "usage.period.all": "All time",
  "usage.period.ariaLabel": "Usage period",
  "usage.error.load": "Could not load usage data. Please try again.",
  "usage.empty.title": "No model usage in this period",
  "usage.empty.description":
    "When the assistant classifies mail, drafts replies, or answers chat, the spend shows up here.",
  "usage.stat.estimatedCost": "Estimated cost",
  "usage.stat.tokens": "Tokens",
  "usage.stat.tokensDetail": "{prompt} prompt · {completion} completion",
  "usage.stat.messages": "Messages",
  "usage.dailyActivity.title": "Daily activity",
  "usage.dailyActivity.subtitle": "Tokens per day, newest first.",
  "usage.conversations.title": "Top conversations",
  "usage.conversations.subtitle":
    "The 20 assistant conversations that used the most tokens, all time.",
  "usage.conversations.colConversation": "Conversation",
  "usage.conversations.colMessages": "Messages",
  "usage.conversations.colTokens": "Tokens",
  "usage.conversations.colEstCost": "Est. cost",
  "usage.conversations.untitled": "Untitled conversation",
  // Receipt (What Klorn did today)
  "receipt.error.load": "Could not load today's attention receipt.",
  "receipt.error.noReceipt": "No receipt available.",
  "receipt.loading": "Loading today's receipt",
  "receipt.title": "What Klorn did today",
  "receipt.refresh": "Refresh",
  "receipt.metric.signalsSeen": "Signals seen",
  "receipt.metric.pushed": "Pushed",
  "receipt.autoHandled.title": "Auto-handled",
  "receipt.autoHandled.description": "Low-risk actions Klorn executed without interrupting you",
  "receipt.pushed.title": "Pushed to you",
  "receipt.pushed.description": "Signals Klorn judged urgent enough to interrupt you",
  "receipt.queued.title": "Queued in inbox",
  "receipt.queued.description": "Items placed in your decision queue — no push sent",
  "receipt.silenced.title": "Silenced",
  "receipt.silenced.description": "Signals Klorn filtered out to protect your focus",
  "receipt.undo.creating": "Creating undo...",
  "receipt.undo.request": "Request undo",
  "receipt.undo.error": "Could not create undo proposal. Please try again.",
  "receipt.empty.title": "No signals processed today yet.",
  "receipt.empty.description":
    "Come back later — Klorn processes your mail and meetings continuously.",
  "receipt.backToQueue": "← Back to Decision Queue",
  "receipt.status.opened": "Opened",
  "receipt.status.sent": "Sent",
  "receipt.type.commitmentDue": "Commitment due",
  "receipt.type.commitmentOverdue": "Overdue commitment",
  "receipt.type.commitmentUnconfirmed": "Unconfirmed commitment",
  "receipt.type.replyNeeded": "Reply needed",
  "receipt.type.deadline": "Deadline",
  "receipt.type.agentProposal": "Agent proposal",
  "receipt.type.decision": "Auto action",
  "receipt.source.pendingAction": "Agent",
  "receipt.source.task": "Task",
  "receipt.source.calendarEvent": "Calendar",
  "receipt.source.notification": "Notification",
  "receipt.source.commitment": "Commitment",
  "receipt.source.email": "Email",
  // Verify email
  "verifyEmail.verifying": "Verifying your email…",
  "verifyEmail.eyebrow": "Email verification",
  "verifyEmail.title.sent": "Verification email sent",
  "verifyEmail.title.pending": "Verify your email",
  "verifyEmail.title.error": "Verification failed",
  "verifyEmail.description.sent":
    "Open the verification link in your inbox to unlock your Klorn workspace.",
  "verifyEmail.description.pending": "Verify your account email to unlock every workspace feature.",
  "verifyEmail.description.error":
    "The link is expired or invalid. Sign in again and request a new verification email.",
  "auth.backToLogin": "Back to login",
  "verifyEmail.nextStep": "Next step",
  "verifyEmail.nextStepBody.sent":
    "Open the Klorn verification email and follow the link. You can return to the decision queue after verification.",
  "verifyEmail.nextStepBody.pending": "If the email is missing, send a fresh verification link.",
  "verifyEmail.nextStepBody.error":
    "Return to login, check your account state, then request a new verification email.",
  "verifyEmail.resendAgain": "Resend again",
  "verifyEmail.resendVerification": "Resend verification email",
  // Reset password
  "resetPassword.eyebrow": "Password reset",
  "resetPassword.checkEmail.title": "Check your email",
  "resetPassword.checkEmail.description":
    "If that email account exists, we sent a password reset link.",
  "resetPassword.checkEmail.body":
    "The link is only valid for a limited time. Check spam if it does not appear.",
  "resetPassword.openLogin": "Open login",
  "resetPassword.description": "Enter your account email and we will send a secure reset link.",
  "resetPassword.error.sendFailed":
    "Could not send the reset link. Check the address and try again.",
  "resetPassword.emailPlaceholder": "you@example.com",
  "resetPassword.sending": "Sending...",
  "resetPassword.sendLink": "Send reset link",
  "resetPassword.newPassword.eyebrow": "New password",
  "resetPassword.newPassword.title": "Set a new password",
  "resetPassword.newPassword.description": "Enter the password you will use for your next login.",
  "resetPassword.newPassword.label": "New password",
  "resetPassword.confirmPassword.label": "Confirm password",
  "resetPassword.confirmPassword.placeholder": "Re-enter password",
  "resetPassword.confirmPassword.mismatch": "Passwords do not match.",
  "resetPassword.resetting": "Resetting...",
  "resetPassword.updated.eyebrow": "Password updated",
  "resetPassword.updated.title": "Password reset complete",
  "resetPassword.updated.description":
    "Your password was changed. You can now log in with the new password.",
  "resetPassword.error.genericFailed": "Reset failed.",
};

const koTranslations: Record<string, string> = {
  // Nav
  "nav.dashboard": "대시보드",
  "nav.chat": "챗",
  "nav.email": "메일",
  "nav.calendar": "캘린더",
  "nav.tasks": "할 일",
  "nav.notes": "노트",
  "nav.contacts": "연락처",
  "nav.reminders": "리마인더",
  "nav.auto": "자동",
  "nav.decisionQueue": "결정 큐",
  "nav.mail": "메일",
  "nav.briefing": "브리핑",
  "nav.assistant": "어시스턴트",
  "nav.admin": "관리자",
  "nav.graph": "그래프",
  "nav.billing": "플랜 및 결제",
  "nav.usage": "사용량",
  "nav.workspace": "워크스페이스",
  "nav.logIn": "로그인",
  "nav.logout": "로그아웃",
  "nav.home": "홈",
  "nav.earlyAccess": "얼리 액세스",
  // Bottom tabs (mobile)
  "tabs.queue": "큐",
  "tabs.account": "계정",
  // Auth
  "auth.signIn": "로그인",
  "auth.signUp": "계정 만들기",
  "auth.signingIn": "로그인 중...",
  "auth.creatingAccount": "계정 생성 중...",
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.name": "이름",
  "auth.noAccount": "계정이 없으신가요? 가입하기",
  "auth.hasAccount": "이미 계정이 있으신가요? 로그인",
  "auth.backHome": "홈으로 돌아가기",
  "auth.welcome": "다시 만나서 반가워요!",
  "auth.accountCreated": "계정이 생성되었습니다!",
  "auth.welcomeBack": "다시 오신 것을 환영해요",
  "auth.titleLogin": "결정 큐로 돌아가세요",
  "auth.titleRegister": "Klorn 시작하기",
  "auth.descLogin": "업무 신호를 다시 연결하고 하던 곳에서 이어가세요.",
  "auth.descRegister": "Gmail과 캘린더를 연결해 팀 신호를 근거 기반 결정 카드로 바꿔보세요.",
  "auth.inviteOnlyTitle": "Klorn은 현재 초대 전용입니다.",
  "auth.inviteOnlyBody":
    "Google 보안 심사가 끝날 때까지 베타 인원이 제한되어, 모든 계정을 직접 승인하고 있습니다. 먼저 액세스를 요청하세요 — 승인되는 즉시 로그인할 수 있어요.",
  "auth.requestEarlyAccess": "얼리 액세스 요청",
  "auth.googleApprovedSignIn": "이미 승인되셨나요? Google로 로그인",
  "auth.continueWithGoogle": "Google로 계속하기",
  "auth.orContinueEmail": "또는 이메일로 계속하기",
  "auth.orSignInEmail": "또는 이메일로 로그인",
  "auth.signUpShort": "가입하기",
  "auth.resetPassword": "비밀번호 재설정",
  "auth.passwordMin": "8자 이상",
  "auth.openDecisionQueue": "결정 큐 열기",
  "auth.needAccount": "계정이 필요하신가요?",
  "auth.haveAccount": "이미 계정이 있으신가요?",
  "auth.switchToSignUp": "가입으로 전환",
  "auth.switchToLogIn": "로그인으로 전환",
  "auth.approvedCantSignIn": "승인됐는데 로그인이 안 되나요?",
  "auth.resetYourPassword": "비밀번호를 재설정하세요",
  // Auth — 로그인 좌측 패널, 도크트린, 토스트, 딥링크 배너
  "auth.asideTitle": "결정이 필요한 일만 남기세요",
  "auth.asideBody":
    "Klorn이 메일·캘린더·업무 신호를 읽어, 무엇이든 실행되기 전에 검토할 수 있는 카드로 만들어 줍니다.",
  "auth.stepSignal": "신호",
  "auth.stepSignalDesc": "메일과 캘린더의 의미 있는 변화를 감지합니다",
  "auth.stepContext": "컨텍스트",
  "auth.stepContextDesc": "사람·마감·프로젝트를 연결합니다",
  "auth.stepApproval": "승인",
  "auth.stepApprovalDesc": "외부 실행 전에 근거를 검토합니다",
  "auth.betaScope":
    "비공개 베타 기간 동안 무료입니다. Google은 CASA 심사가 끝날 때까지 제한된 Gmail 범위를 사용하는 미검증 앱을 표시하며, 이는 모든 Gmail 연동에 적용되는 표준 절차입니다.",
  "auth.noSilentActions":
    "저희가 하지 않는 것: 클릭 확인 없이 메일을 보내지 않습니다. 모든 발송·영구 삭제·외부 전달은 해시로 묶여 있어 열람 시 검증할 수 있습니다.",
  "auth.readDoctrine": "로그인 전에 설계 원칙 읽기 →",
  "auth.openSourceVersion": "오픈소스 · AGPLv3 · v0.3.0",
  "auth.signInToContinue": "{destination}(으)로 이어가려면 로그인하세요.",
  "auth.googleSignInError": "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  "auth.googleDenied": "Google 연결이 취소되었어요 — 준비되면 다시 시도하면 됩니다.",
  "auth.googleUnverified":
    "Google에서 이 계정의 이메일 주소가 미확인 상태로 보고되어 로그인에 사용할 수 없습니다. Google에서 주소를 인증하시거나 다른 계정을 사용해 주세요.",
  "auth.continueWithApple": "Apple로 계속하기",
  "auth.continueWithNaver": "네이버로 계속하기",
  "auth.socialSignInError": "로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  "auth.socialDenied": "로그인이 취소되었어요 — 준비되면 다시 시도하면 됩니다.",
  "auth.socialEmailInUse":
    "이 이메일로 만든 Klorn 계정이 이미 있습니다. 원래 쓰던 방법으로 로그인해 주세요 — 다른 계정 연결은 설정에서 할 수 있어요.",
  "auth.socialEmailUnverified":
    "해당 서비스가 이 이메일 주소를 보증할 수 없어 로그인에 사용할 수 없습니다. 서비스 자체 주소를 쓰시거나 다른 로그인 방법을 사용해 주세요.",
  "auth.sessionExpired": "세션이 만료되었습니다. 다시 로그인해 주세요.",
  "auth.inviteOnlyRedirect":
    "Klorn은 현재 초대 전용입니다. 얼리 액세스 페이지에서 액세스를 신청해 주세요.",
  "auth.emailVerified": "이메일이 확인되었습니다. 이제 로그인할 수 있어요.",
  "auth.passwordMinChars": "최소 {count}자 이상 입력해 주세요.",
  "auth.genericError": "문제가 발생했습니다.",
  "auth.formGroupLabel": "로그인 또는 계정 만들기",
  "auth.destMemory": "메모리 설정",
  "auth.destUsage": "사용량 설정",
  "auth.destStatus": "시스템 상태",
  "auth.destFeedback": "메일 피드백",
  "auth.destFiles": "파일",
  // Settings
  "settings.title": "설정",
  "settings.subtitle": "프로필, 알림, 실행 범위, 데이터",
  "settings.profile": "운영자 프로필",
  "settings.security": "액세스 보안",
  "settings.integrations": "연결",
  "settings.displayName": "표시 이름",
  "settings.language": "언어",
  "settings.timezone": "시간대",
  "settings.saveProfile": "프로필 저장",
  "settings.saved": "저장됨",
  "settings.currentPassword": "현재 비밀번호",
  "settings.newPassword": "새 비밀번호",
  "settings.changePassword": "비밀번호 변경",
  "settings.changing": "변경 중...",
  "settings.connected": "연결됨",
  "settings.disconnect": "연결 해제",
  "settings.connect": "연결",
  "settings.envVars": "환경변수를 설정하면 활성화됩니다",
  "settings.quickActions": "빠른 작업",
  "settings.dailyBriefing": "데일리 브리핑",
  "settings.generateNow": "지금 생성",
  "settings.capabilities": "Decision OS 표면",
  "settings.data": "워크스페이스 데이터",
  "settings.exportData": "워크스페이스 데이터 내보내기",
  "settings.export": "내보내기",
  "settings.dangerZone": "워크스페이스 초기화",
  "settings.deleteAll": "워크스페이스 삭제",
  "settings.deleteBtn": "계정 삭제",
  "settings.about": "정보",
  "settings.section.appearance": "모양",
  "settings.appearance.theme": "테마",
  "settings.appearance.themeDesc": "시스템은 OS 설정을 따르며 실시간으로 반영됩니다.",
  "settings.appearance.system": "시스템",
  "settings.appearance.light": "라이트",
  "settings.namePlaceholder": "이름",
  "settings.newPasswordPlaceholder": "6자 이상",
  "settings.toast.saveNameFailed": "이름을 저장하지 못했습니다. 다시 시도해 주세요.",
  "settings.toast.profileSaved": "프로필이 저장되었습니다.",
  "settings.oauthNoPassword.line1":
    "Google로 로그인 중입니다. 이메일 로그인도 쓰려면 비밀번호를 설정하세요.",
  "settings.oauthNoPassword.line2": "저장하면 이 계정으로 이메일과 비밀번호 로그인이 가능해져요.",
  "settings.setPassword": "비밀번호 설정",
  "settings.saving": "저장 중...",
  "settings.toast.passwordMinLength": "비밀번호는 6자 이상이어야 합니다.",
  "settings.toast.passwordChanged":
    "비밀번호가 변경되었습니다 — 다른 기기에서는 다시 로그인해 주세요.",
  "settings.toast.passwordSet": "비밀번호가 설정되었습니다.",
  "settings.toast.genericFailed": "실패했습니다.",
  "settings.section.replies": "답장",
  "settings.field.replyTone": "답장 톤",
  "settings.field.replyToneDesc":
    "Klorn 초안의 어투를 정합니다. 표현만 달라질 뿐 내용은 바뀌지 않으며, 언어는 절대 바뀌지 않습니다 — 답장은 항상 원본 메일의 언어로 작성됩니다.",
  "settings.replyTone.matchMe.label": "내 스타일대로",
  "settings.replyTone.matchMe.desc": "보낸 메일에서 학습",
  "settings.replyTone.formal.label": "격식체",
  "settings.replyTone.formal.desc": "정중하고 사무적으로",
  "settings.replyTone.friendly.label": "친근하게",
  "settings.replyTone.friendly.desc": "따뜻하면서도 전문적으로",
  "settings.replyTone.casual.label": "캐주얼",
  "settings.replyTone.casual.desc": "편하고 짧게",
  "settings.field.notificationLanguage": "알림 언어",
  "settings.field.notificationLanguageDesc":
    'Klorn이 자체 알림("초안 준비 완료" 등)을 작성하는 언어입니다. 알림은 서버에서 생성되므로 위의 앱 언어와는 별개입니다.',
  "settings.toast.replyToneFailed": "답장 톤을 저장하지 못했습니다.",
  "settings.toast.notifLanguageFailed": "알림 언어를 저장하지 못했습니다.",
  "settings.section.signalRhythm": "신호 리듬",
  "settings.morningBriefing.title": "모닝 브리핑",
  "settings.morningBriefing.desc":
    "자리를 비웠어도 시간대에 맞춰 하루 한 번 결정 브리핑을 보냅니다.",
  "settings.morningBriefing.timezoneNote":
    "시간대: {timezone}. 위의 프로필 섹션에서 바꿀 수 있습니다.",
  "settings.field.deliveryTime": "발송 시각",
  "settings.deliveryTime.defaultNote": "기본값은 06:00입니다.",
  "settings.pushNotifications.title": "푸시 알림",
  "settings.pushNotifications.unsupported": "이 브라우저는 푸시 알림을 지원하지 않습니다.",
  "settings.pushNotifications.on": "켜짐 - 리마인더, 브리핑, 중요 메일 알림을 받습니다.",
  "settings.pushNotifications.blocked":
    "브라우저에서 차단되었습니다. 브라우저 설정에서 알림을 허용하세요.",
  "settings.pushNotifications.off": "리마인더, 브리핑, 중요 메일 알림을 받습니다.",
  "settings.pushNotifications.blockedChip": "차단됨",
  "settings.pushNotifications.unsupportedChip": "지원 안 됨",
  "settings.turnOff": "끄기",
  "settings.turnOn": "켜기",
  "settings.toast.pushUnsupported": "이 브라우저는 알림을 지원하지 않습니다.",
  "settings.toast.pushEnabled": "macOS 알림이 활성화되었습니다.",
  "settings.toast.pushRegistrationFailed": "푸시 등록에 실패했습니다.",
  "settings.toast.pushBlocked": "알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.",
  "settings.toast.pushDisabled": "푸시 알림이 꺼졌습니다.",
  "settings.notifPrefs.legend": "어떤 신호가 방해할 만큼 중요한가요?",
  "settings.notifPrefs.legendDesc":
    "비활성화한 항목은 푸시와 인앱 알림 모두에서 조용히 처리됩니다.",
  "settings.notifPrefs.essentialsOnly": "필수만",
  "settings.notifPrefs.essentialsOnlyDesc":
    "답장이 필요한 메일과 캘린더 일정만 알립니다. 나머지는 알림 없이 앱 안에만 남습니다.",
  "settings.notifPrefs.urgentMail.label": "긴급 메일",
  "settings.notifPrefs.urgentMail.desc": "Klorn이 시간이 중요하다고 판단한 새 메일",
  "settings.notifPrefs.meeting.label": "미팅 리마인더",
  "settings.notifPrefs.meeting.desc": "예정된 미팅과 스탠드업 리마인더",
  "settings.notifPrefs.taskDue.label": "마감 및 기한 초과",
  "settings.notifPrefs.taskDue.desc": "할 일 마감일 리마인더",
  "settings.notifPrefs.agentProposal.label": "에이전트 제안",
  "settings.notifPrefs.agentProposal.desc": "Klorn이 실행 전 승인이 필요할 때",
  "settings.notifPrefs.dailyBriefing.label": "데일리 브리핑",
  "settings.notifPrefs.dailyBriefing.desc": "매일의 결정 브리핑",
  "settings.quietHours.title": "무음 시간",
  "settings.quietHours.desc": "이 시간 동안 푸시 알림을 멈춥니다. 비워두면 제한이 없습니다.",
  "settings.quietHours.startSrLabel": "무음 시간 시작",
  "settings.quietHours.startAriaLabel": "무음 시간 시작",
  "settings.quietHours.endSrLabel": "무음 시간 종료",
  "settings.quietHours.endAriaLabel": "무음 시간 종료",
  "settings.quietHours.to": "부터",
  "settings.phoneEscalation.title": "전화 에스컬레이션",
  "settings.phoneEscalation.desc":
    "긴급 알림을 5분간 확인하지 않으면 한 번 전화합니다. 하루 최대 3통, 무음 시간이 항상 우선합니다. 인증된 전화번호와 서버 측 Twilio 설정이 필요합니다.",
  "settings.toast.settingSaveFailed": "설정을 저장하지 못했습니다.",
  "settings.toast.presetFailed": "프리셋을 적용하지 못했습니다.",
  "settings.toast.briefingEnabled": "데일리 브리핑이 켜졌습니다.",
  "settings.toast.briefingDisabled": "데일리 브리핑이 꺼졌습니다.",
  "settings.toast.briefingSaveFailed": "브리핑 설정을 저장하지 못했습니다.",
  "settings.toast.briefingTimeSaved": "브리핑 시각이 저장되었습니다.",
  "settings.toast.briefingTimeSaveFailed": "브리핑 시각을 저장하지 못했습니다.",
  "settings.toast.phoneEscalationEnabled": "전화 에스컬레이션이 켜졌습니다.",
  "settings.toast.phoneEscalationDisabled": "전화 에스컬레이션이 꺼졌습니다.",
  "settings.section.decisionAgent": "결정 에이전트",
  "settings.executionBoundary.title": "실행 범위",
  "settings.executionBoundary.desc":
    "승인 한도 내에서 Klorn이 백그라운드로 업무, 캘린더, 메일을 지켜보게 합니다.",
  "settings.field.agentMode": "에이전트 모드",
  "settings.agentMode.shadowNote": "Klorn이 조용히 초안과 승인 준비 작업을 만들어 큐에 넣습니다.",
  "settings.agentMode.autoNote":
    "저위험 내부 작업은 자동으로 실행될 수 있습니다. 답장, 일정 변경, 파괴적 작업은 여전히 명시적 승인이 필요합니다.",
  "settings.field.alwaysAllowedTools": "항상 허용된 도구",
  "settings.tool.runWithinPolicy": "정책 내에서 실행",
  "settings.tool.reviewFirst": "먼저 검토",
  "settings.alwaysAllowedTools.note":
    "활성화된 도구도 정책 내에서만 실행됩니다. 메일 답장과 파괴적 작업은 여기서 사전 승인할 수 없습니다.",
  "settings.field.checkInterval": "확인 주기",
  "settings.checkInterval.3min": "3분마다",
  "settings.checkInterval.5min": "5분마다 (기본값)",
  "settings.checkInterval.10min": "10분마다",
  "settings.checkInterval.15min": "15분마다",
  "settings.checkInterval.30min": "30분마다",
  "settings.autoMarkRead.label": "Gmail 자동 읽음 처리",
  "settings.autoMarkRead.desc":
    "자동 모드에서 Klorn이 답장을 보낸 후 원본 Gmail 스레드를 읽음으로 표시할 수 있습니다. 안 읽은 메일을 대체 워크플로로 쓰는 경우를 위해 기본값은 꺼짐입니다.",
  "settings.state.on": "켜짐",
  "settings.state.off": "꺼짐",
  "settings.proactiveAlerts.label": "선제 알림",
  "settings.proactiveAlerts.desc":
    "Klorn이 답장 없는 메일, 기한 지난 할 일, 다가오는 미팅, 후속 조치 기회를 살펴 놓치기 전에 알려줍니다.",
  "settings.toast.proactiveOn":
    "선제 알림이 켜졌습니다 — Klorn이 답장 없는 메일, 기한 지난 할 일, 다가오는 미팅을 알려드립니다.",
  "settings.toast.proactiveOff": "선제 알림이 꺼졌습니다.",
  "settings.runAgentNow": "지금 에이전트 실행",
  "settings.state.running": "실행 중...",
  "settings.runAgentNow.desc": "다음 주기를 기다리지 않고 지금 신호를 확인합니다.",
  "settings.toast.agentRunStarted": "에이전트 실행을 시작했습니다. 결정 큐에서 결과를 확인하세요.",
  "settings.toast.agentRunFailed": "에이전트를 실행하지 못했습니다.",
  "settings.viewRecentActivity": "최근 활동 보기",
  "settings.agentLog.toolPrefix": "도구: {tool}",
  "settings.refreshPatterns": "학습된 패턴 새로고침",
  "settings.whatLearned": "Klorn이 나에 대해 무엇을 학습했나요?",
  "settings.state.analyzing": "분석 중...",
  "settings.patterns.notEnough": "아직 데이터가 부족합니다 — 며칠 사용 후 패턴이 나타납니다.",
  "settings.confidence.high": "높음",
  "settings.confidence.med": "중간",
  "settings.confidence.low": "낮음",
  "settings.toast.agentEnabled": "결정 에이전트가 켜졌습니다.",
  "settings.toast.agentDisabled": "결정 에이전트가 꺼졌습니다.",
  "settings.toast.updateFailed": "업데이트하지 못했습니다.",
  "settings.toast.intervalSaveFailed": "확인 주기를 저장하지 못했습니다.",
  "settings.toast.modeSaveFailed": "모드를 저장하지 못했습니다.",
  "settings.toast.updateFailedWithReason": "업데이트하지 못했습니다: {reason}",
  "settings.error": "오류",
  "settings.confirm.allowTool.title": "이 도구를 자동으로 실행하도록 허용할까요?",
  "settings.confirm.allowTool.message":
    "Auto 모드가 정책 내라고 판단하면 {tool}은 별도 승인 없이 실행됩니다. 메일 답장과 파괴적 작업은 여전히 승인이 필요합니다.",
  "settings.confirm.allowTool.confirmLabel": "도구 허용",
  "settings.confirm.autoMode.title": "Auto 모드로 전환할까요?",
  "settings.confirm.autoMode.message":
    "Klorn이 저위험 내부 작업을 자동으로 실행할 수 있습니다. 외부 답장, 일정 변경, 파괴적 작업, 정책 밖의 작업은 여전히 승인이 필요합니다.",
  "settings.confirm.autoMode.confirmLabel": "Auto 모드 사용",
  "settings.confirm.autoMarkRead.title": "Gmail을 자동으로 읽음 처리할까요?",
  "settings.confirm.autoMarkRead.message":
    "Klorn이 승인된 자동 모드 답장을 보낸 후 원본 Gmail 스레드를 읽음으로 표시할 수 있습니다. 안 읽은 메일을 대체 워크플로로 쓴다면 꺼두세요.",
  "settings.confirm.autoMarkRead.confirmLabel": "켜기",
  "settings.confirm.disconnectGoogle.title": "Google 연결 해제",
  "settings.confirm.disconnectGoogle.message":
    "Gmail과 캘린더 액세스를 제거합니다. 언제든 다시 연결할 수 있습니다.",
  "settings.confirm.disconnectGoogle.confirmLabel": "연결 해제",
  "settings.confirm.deleteWorkspace.title": "워크스페이스 데이터 삭제",
  "settings.confirm.deleteWorkspace.message":
    "모든 결정 스레드, 할 일, 메모리, 연락처, 리마인더를 삭제합니다. 되돌릴 수 없습니다.",
  "settings.confirm.deleteWorkspace.confirmLabel": "워크스페이스 삭제",
  "settings.confirm.deleteAccount.title": "계정 삭제",
  "settings.confirm.deleteAccount.message":
    "Klorn 계정과 이메일, 분류 결과, 할 일, 메모리, 캘린더 일정, 연결된 Google 액세스, 설정을 포함한 모든 데이터가 영구히 삭제됩니다. 되돌릴 수 없습니다.",
  "settings.confirm.deleteAccount.confirmLabel": "내 계정 삭제",
  "settings.section.connections": "연결",
  "settings.integration.google.desc": "Gmail과 캘린더 신호를 읽어 미팅 준비에 연결합니다.",
  "settings.integration.slack.connectedVia": "{method}(으)로 연결됨",
  "settings.integration.slack.viaBotToken": "봇 토큰",
  "settings.integration.slack.viaWebhook": "웹훅",
  "settings.integration.slack.adminOnly":
    "관리자가 SLACK_BOT_TOKEN 또는 SLACK_WEBHOOK_URL을 설정해야 합니다.",
  "settings.integration.notion.desc": "페이지 검색, 문서 초안, 데이터베이스 액세스를 준비합니다.",
  "settings.sendTest": "테스트 발송",
  "settings.state.sending": "보내는 중...",
  "settings.chip.adminSetup": "관리자 설정",
  "settings.chip.comingSoon": "준비 중",
  "settings.toast.slackTestSent": "Slack 테스트 메시지를 보냈습니다.",
  "settings.toast.slackTestFailed": "테스트 메시지를 보내지 못했습니다.",
  "settings.toast.googleDisconnectFailed": "Google 연결을 해제하지 못했습니다.",
  "settings.toast.googleDisconnected": "Google 연결이 해제되었습니다.",
  "settings.toast.requestFailed": "요청이 실패했습니다.",
  "settings.realtimeSync.title": "실시간 메일 동기화",
  "settings.realtimeSync.activeUntil":
    "Gmail 푸시가 {date}까지 활성화되어 있습니다. 만료 전 자동으로 갱신됩니다.",
  "settings.realtimeSync.active": "Gmail 푸시가 활성화되어 있으며 만료 전 자동으로 갱신됩니다.",
  "settings.realtimeSync.subscribe":
    "Gmail 푸시를 구독하면 메일 신호가 즉시 도착합니다. 꺼져 있으면 Klorn이 1분마다 확인합니다.",
  "settings.realtimeSync.notConfigured":
    "서버의 Pub/Sub 토픽이 아직 설정되지 않았습니다. 관리자에게 활성화를 요청하세요.",
  "settings.realtimeSync.unavailable": "사용 불가",
  "settings.toast.gmailPushEnableFailed": "실시간 동기화를 활성화하지 못했습니다.",
  "settings.toast.gmailPushEnabled": "실시간 메일 동기화가 활성화되었습니다.",
  "settings.toast.gmailPushDisableFailed": "실시간 동기화를 비활성화하지 못했습니다.",
  "settings.toast.gmailPushDisabled": "실시간 메일 동기화가 꺼졌습니다. 예약된 확인은 계속됩니다.",
  "settings.section.manualRuns": "수동 실행",
  "settings.manualRuns.dailyBriefing.desc":
    "할 일, 캘린더, 메일 신호로 우선순위 브리핑을 만듭니다.",
  "settings.generateBriefing": "브리핑 생성",
  "settings.toast.briefingGenerated": "브리핑이 생성되었습니다. 브리핑 화면에서 확인하세요.",
  "settings.toast.briefingGenerateFailed": "브리핑을 생성하지 못했습니다.",
  "settings.exportWorkspace.desc":
    "결정 스레드, 신호, 메모리, 실행 기록을 JSON으로 다운로드합니다.",
  "settings.toast.exportFailed": "데이터 내보내기에 실패했습니다.",
  "settings.toast.exported": "데이터를 내보냈습니다.",
  "settings.deleteWorkspace.desc":
    "모든 결정 스레드, 할 일, 메모리, 연락처, 리마인더를 영구히 삭제합니다.",
  "settings.deleteAccount.desc":
    "계정, Google 액세스, 모든 데이터를 영구히 삭제합니다. 되돌릴 수 없습니다.",
  "settings.toast.deleteWorkspaceFailed": "워크스페이스 데이터를 삭제하지 못했습니다.",
  "settings.toast.workspaceDeleted": "워크스페이스 데이터가 삭제되었습니다.",
  "settings.toast.deleteAccountFailed": "계정을 삭제하지 못했습니다.",
  "settings.about.tagline": "Decision OS",
  "settings.about.desc": "흩어진 탭을 줄이고 다음 결정을 더 명확하게 만들기 위해 만들었습니다.",
  "settings.about.version": "v0.2.0 — MVP",
  // Onboarding
  "onboarding.welcome.titleLine1": "Klorn은 행동이 필요한",
  "onboarding.welcome.titleLine2": "결정만 보여줍니다.",
  "onboarding.welcome.desc":
    "Gmail과 Google 캘린더를 연결하세요. Klorn이 결정이 필요한 항목만 골라내고 나머지는 조용히 처리합니다.",
  "onboarding.welcome.connecting": "Google로 이동 중...",
  "onboarding.welcome.connectButton": "Gmail & 캘린더 연결",
  "onboarding.welcome.preferNaver": "네이버 메일을 쓰시나요?",
  "onboarding.welcome.connectViaImap": "설정에서 IMAP으로 연결하기",
  "onboarding.welcome.feature.readMail": "메일 읽기",
  "onboarding.welcome.feature.trackMeetings": "미팅 추적",
  "onboarding.welcome.feature.surfaceDecisions": "결정 표면화",
  "onboarding.welcome.permissions.pre": "Klorn은 Gmail과 캘린더를",
  "onboarding.welcome.permissions.emphasis1": "읽기만",
  "onboarding.welcome.permissions.mid": "합니다. 메일 발송이나 일정 생성은 항상",
  "onboarding.welcome.permissions.emphasis2": "사용자 승인",
  "onboarding.welcome.permissions.suffix": "을 기다립니다.",
  "onboarding.syncing.title": "워크스페이스를 준비하는 중...",
  "onboarding.syncing.titleDone": "동기화 완료.",
  "onboarding.syncing.desc": "최근 이메일과 캘린더를 읽고 있습니다. 약 30초 걸립니다.",
  "onboarding.syncing.descDone": "Klorn이 받은 편지함을 읽고 일정을 파악했습니다.",
  "onboarding.syncing.emailsProcessed": "이메일 {count}개 처리됨",
  "onboarding.syncing.readingEmails": "이메일 읽는 중...",
  "onboarding.syncing.eventsSynced": "일정 {count}개 동기화됨",
  "onboarding.syncing.syncingCalendar": "캘린더 동기화 중...",
  "onboarding.syncing.contactsSaved": "연락처 {count}개 저장됨",
  "onboarding.syncing.loadingContacts": "연락처 불러오는 중...",
  "onboarding.syncing.continueSeeFound": "Klorn이 찾은 내용 보기",
  "onboarding.syncing.continueToInbox": "받은 편지함으로 계속",
  "onboarding.ready.title": "준비가 끝났습니다.",
  "onboarding.ready.desc":
    "Klorn이 실행 중입니다. 받은 편지함을 열기 전에 결정을 찾아내고, 약속을 추적하고, 모닝 브리핑을 준비합니다.",
  "onboarding.ready.stat.emailsRead": "읽은 이메일",
  "onboarding.ready.stat.eventsSynced": "동기화된 일정",
  "onboarding.ready.stat.contacts": "연락처",
  "onboarding.ready.whatNext.title": "다음에 일어나는 일",
  "onboarding.ready.whatNext.item1": "잠에서 깨기 전에 모닝 브리핑이 준비되어 있을 거예요.",
  "onboarding.ready.whatNext.item2": "승인이 필요한 것을 찾으면 결정 카드가 나타납니다.",
  "onboarding.ready.whatNext.item3": "약속은 이메일에서 자동으로 추적됩니다.",
  "onboarding.ready.openQueue": "결정 큐 열기",
  "onboarding.review.title": "이대로 괜찮나요?",
  "onboarding.review.desc":
    "Klorn이 최근 받은 편지함을 티어로 분류했습니다. 맞게 분류된 것은 확인하고, 아닌 것은 고쳐 주세요 — 몇 개만 확인해도 중요한 것을 학습합니다.",
  "onboarding.review.readingInbox": "받은 편지함을 읽는 중…",
  "onboarding.review.loadError":
    "지금은 분류 결과를 불러올 수 없습니다. 받은 편지함에서 언제든 확인할 수 있어요.",
  "onboarding.review.emptyState":
    "아직 검토할 메일이 없습니다 — 새 메일이 도착하면 Klorn이 분류합니다.",
  "onboarding.review.groupAriaLabel": "{tier} 이메일",
  "onboarding.review.continueReviewed": "계속 — {count}개 확인함",
  "onboarding.review.continueDefault": "좋아요 — 계속",
  "onboarding.review.footerNote":
    "확인하거나 고칠 때마다 Klorn이 학습합니다. 어떤 티어든 받은 편지함에서 나중에 조정할 수 있어요.",
  "onboarding.review.card.unknownSender": "발신자 알 수 없음",
  "onboarding.review.card.noSubject": "(제목 없음)",
  "onboarding.review.card.keptIn": "{tier}에 유지됨 ✓",
  "onboarding.review.card.movedTo": "{tier}(으)로 이동됨 ✓",
  "onboarding.review.card.looksRight": "맞아요",
  "onboarding.review.card.orMoveTo": "또는 이동",
  "settings.appearance.dark": "다크",
  // Dashboard
  "dashboard.greeting": "좋은 {timeOfDay}입니다, {name}님",
  "dashboard.morning": "아침",
  "dashboard.afternoon": "오후",
  "dashboard.evening": "저녁",
  // Chat
  "chat.newConversation": "새 결정 스레드",
  "chat.typeMessage": "결정, 맥락 추적, 다음 액션을 물어보세요...",
  "chat.send": "보내기",
  "chat.newChat": "새 대화",
  "chat.suggestion1": "안 읽은 메일 요약해줘",
  "chat.suggestion2": "상사에게 온 마지막 메일 찾아줘",
  "chat.suggestion3": "내일 내 일정 뭐가 있지?",
  "chat.suggestion4": "내일 3시 김대표 미팅 잡아줘",
  "chat.emptyState":
    "메일, 캘린더, 브리핑에 대해 물어보거나 마이크로 말해보세요. Klorn 데이터 안에서만 동작해요.",
  "chat.loadingConversation": "대화를 불러오는 중…",
  "chat.inputPlaceholder": "메일이나 캘린더에 대해 물어보세요…",
  "chat.thinking": "생각 중…",
  "chat.sendFailed": "메시지를 보내지 못했어요 — 입력창에 다시 넣어두었으니 다시 시도해주세요.",
  // Calendar event draft card
  "draft.title": "캘린더 일정 초안",
  "draft.save": "캘린더에 저장",
  "draft.saving": "저장 중…",
  "draft.saved": "캘린더에 저장했어요 ✓",
  "draft.paywall": "일정 저장에는 Pro 플랜이 필요해요.",
  "draft.seePlans": "플랜 보기",
  "draft.error": "일정을 저장하지 못했어요. 다시 시도해주세요.",
  // Mail
  "mail.filterAll": "모든 신호",
  "mail.filterReplyNeeded": "답장 필요",
  "mail.filterUrgent": "긴급",
  "mail.filterUnread": "안 읽음",
  "mail.filterAttachments": "첨부",
  "mail.filterCandidates": "후보",
  "mail.filterThreads": "스레드",
  "mail.filterAutomated": "자동 메일",
  "mail.compose": "메일 쓰기",
  "mail.searchMail": "메일 검색",
  "mail.searchPlaceholder": "메일, 첨부, 항목 검색",
  "mail.emptyReplyTitle": "답장할 메일이 없어요",
  "mail.emptyTitle": "여기엔 메일이 없어요",
  "mail.emptyDemoBody": "설정에서 Gmail을 연결하면 Klorn이 실제 메일을 정리해드려요.",
  "mail.emptyBody": "당신의 손이 필요한 메일을 찾으면 맨 위로 올려드려요.",
  "mail.emptyAll": "아직 메일 신호가 없어요.",
  "mail.emptyReplyNow": "지금은 답장할 메일이 없어요.",
  "mail.emptyFilter": "이 필터에 맞는 신호가 없어요.",
  "mail.emptyReplyHint":
    "긴급, 안 읽음, 전체 메일은 다른 탭에서 볼 수 있어요 — 답해야 할 메일을 감지하면 Klorn이 스레드를 여기로 올려드려요.",
  "mail.emptySyncHint": "동기화하면 조치가 필요한 메일이 맨 위로 올라와요.",
  "mail.showAllSignals": "모든 신호 보기",
  "mail.connectGoogle": "Google 연결",
  // Calendar
  "calendar.newEvent": "새 일정",
  "calendar.needPrep": "준비가 필요한 미팅",
  "calendar.voiceParsing": "일정을 파악하는 중…",
  // Decision queue (inbox)
  "inbox.decisions": "결정",
  "inbox.tracking": "추적 중",
  "inbox.allClear": "모두 정리됨",
  "inbox.nothingNeedsYou": "지금은 처리할 일이 없어요",
  "inbox.nothingToDecide": "결정할 것이 없어요",
  "inbox.nothingToDecideToday": "오늘은 결정할 것이 없어요.",
  "inbox.emptyBody":
    "Klorn이 메일과 캘린더를 지켜보고 있어요. 결정이 필요한 일이 생기면 여기로 올라옵니다.",
  "inbox.emptyBodyMobile": "Klorn이 메일과 캘린더를 지켜보고 있어요. 새 결정은 여기에 표시됩니다.",
  "inbox.openMail": "메일 열기",
  "inbox.tourTitle": "처음이신가요? 30초 투어",
  // Briefing
  "briefing.learningMode":
    "Klorn은 처음 2-3일 동안 메일과 캘린더 패턴을 학습합니다. 쓸수록 핵심 액션이 더 정확해집니다.",
  "briefing.heading": "오늘의 결정 브리핑",
  "briefing.notGenerated": "아직 생성되지 않았어요",
  "briefing.generate": "생성",
  "briefing.generateNow": "지금 생성",
  "briefing.generating": "생성 중...",
  "briefing.regenerate": "다시 생성",
  // Common
  "common.loading": "불러오는 중...",
  "common.syncNow": "지금 동기화",
  "common.syncing": "동기화 중...",
  "common.cancel": "취소",
  "common.confirm": "확인",
  "common.delete": "삭제",
  "common.save": "저장",
  "common.or": "또는",
  // Skills
  "skills.title": "스킬",
  "skills.subtitle": "Klorn이 대신 실행하는 재사용 워크플로",
  "skills.newSkill": "+ 새 스킬",
  "skills.edit": "스킬 편집",
  "skills.name": "스킬 이름",
  "skills.description": "설명 (선택)",
  "skills.prompt": "프롬프트 템플릿",
  "skills.create": "만들기",
  "skills.update": "업데이트",
  "skills.empty": "아직 스킬이 없습니다",
  // Approval UX
  "approval.approve": "승인",
  "approval.reject": "거절",
  "approval.alwaysAllow": "항상 허용",
  "approval.neverSuggest": "다시 제안하지 않기",
  // Notifications
  "notif.title": "알림",
  "notif.push": "푸시 알림",
  "notif.preferences": "어떤 알림을 받을까요?",
  "notif.quietHours": "방해 금지 시간",
  "notif.quietHoursDesc": "이 시간 동안 푸시 알림을 보내지 않습니다",
  "notif.categoryEmailUrgent": "긴급 메일 알림",
  "notif.categoryMeeting": "미팅 리마인더",
  "notif.categoryTaskDue": "임박·기한 초과 할 일",
  "notif.categoryAgentProposal": "에이전트 제안",
  "notif.categoryDailyBriefing": "데일리 브리핑",
  // Billing
  "billing.title": "결제",
  "billing.subtitle": "결정 한도, 모델 사용량, 실행 모드, 팀에 맞는 플랜을 확인하세요.",
  "billing.subscriptionActive": "구독이 활성화되었습니다.",
  "billing.checkoutCanceled": "결제가 취소되었습니다.",
  "billing.currentPlan": "현재 플랜",
  "billing.aboutCostThisMonth": "이번 달 약 {amount}",
  "billing.manageSubscription": "구독 관리",
  "billing.decisions": "결정",
  "billing.tokens": "토큰",
  "billing.viewDetailedUsage": "자세한 사용량 보기",
  "billing.recommended": "추천",
  "billing.includedWithEveryPlan": "모든 플랜에 포함됨",
  "billing.contactSales": "영업팀에 문의",
  "billing.subscriptionComingSoon": "구독 기능 준비 중",
  "billing.startTrial": "7일 무료 체험 시작",
  "billing.planDetailsHeading": "플랜 상세",
  "billing.error.loadStatus": "결제 상태를 불러오지 못했습니다.",
  "billing.error.unsafeRedirect": "안전하지 않은 결제 리디렉션 URL입니다.",
  "billing.error.checkoutFailed": "결제 세션을 생성하지 못했습니다.",
  "billing.error.portalFailed": "결제 포털을 열지 못했습니다.",
  "billing.plan.free.name": "무료",
  "billing.plan.free.limit": "월 50건 결정 · 토큰 50만",
  "billing.plan.free.feature.mailCalendar": "메일과 캘린더 읽기",
  "billing.plan.free.feature.tasksMemory": "할 일과 메모리",
  "billing.plan.free.feature.freeModels": "무료 OpenRouter 모델",
  "billing.plan.pro.name": "Pro",
  "billing.plan.pro.period": "/월",
  "billing.plan.pro.trialNote": "7일 무료 체험 · 종료 전 언제든 취소하면 결제되지 않습니다",
  "billing.plan.pro.limit": "월 2,000건 결정 · 토큰 1,000만",
  "billing.plan.pro.feature.everythingFree": "무료 플랜의 모든 기능",
  "billing.plan.pro.feature.sendMail": "메일 발송과 캘린더 일정 생성",
  "billing.plan.pro.feature.decisionLoop": "결정 루프 모드: 제안 + 정책 실행",
  "billing.plan.pro.feature.briefings": "데일리 브리핑과 메일 트리아지",
  "billing.plan.pro.feature.replyDrafts": "답장 초안과 패턴 학습",
  "billing.plan.pro.feature.integrations": "Slack, Notion 연동 (준비 중)",
  "billing.plan.pro.feature.webResearch": "웹 리서치와 문서 초안",
  "billing.plan.pro.feature.sonnet": "Claude Sonnet 모델 선택",
  "billing.plan.enterprise.name": "엔터프라이즈",
  "billing.plan.enterprise.price": "맞춤 견적",
  "billing.plan.enterprise.limit": "무제한",
  "billing.plan.enterprise.feature.everythingPro": "Pro 플랜의 모든 기능",
  "billing.plan.enterprise.feature.opus": "Claude Opus 모델 선택",
  "billing.plan.enterprise.feature.onPrem": "온프레미스 배포 옵션",
  "billing.plan.enterprise.feature.sla": "SLA 지원",
  "billing.plan.enterprise.feature.customIntegrations": "맞춤 연동",
  "billing.faq.trial.q": "7일 무료 체험은 어떻게 진행되나요?",
  "billing.faq.trial.a":
    'Pro를 시작해도 오늘은 $0이며 Pro의 모든 기능이 바로 열립니다. {price}의 첫 결제는 7일 체험이 끝날 때 이루어집니다. 그전에 "구독 관리"에서 언제든 취소하면 결제되지 않습니다.',
  "billing.faq.freeVsPro.q": "무료와 Pro의 차이는 무엇인가요?",
  "billing.faq.freeVsPro.a":
    "무료는 읽고 정리합니다: Klorn이 메일과 캘린더를 살펴 결정 카드로 만들며, 무료 모델로 월 50건 결정과 토큰 50만 한도 내에서 동작합니다. Pro는 실행합니다: 메일 발송, 캘린더 일정 생성, 답장 초안, 데일리 브리핑, 결정 루프의 제안 + 정책 실행까지 — 월 2,000건 결정, 토큰 1,000만, Claude Sonnet 모델 선택이 포함됩니다.",
  "billing.faq.enterprise.q": "엔터프라이즈는 무엇이 추가되나요?",
  "billing.faq.enterprise.a":
    "고정 한도 대신 맞춤 한도, Claude Opus 모델 선택, 온프레미스 배포 옵션, SLA 기반 지원, 맞춤 연동이 제공됩니다. 가격은 범위에 따라 달라지니 영업팀에 문의하세요.",
  "billing.faq.manage.q": "구독을 취소하거나 관리하려면 어떻게 하나요?",
  "billing.faq.manage.a":
    '이 페이지의 "구독 관리"를 누르면 결제 대행사 Paddle의 결제 포털이 열리며, 여기서 취소, 결제 수단 변경, 인보이스 다운로드가 가능합니다. 취소 후에도 Pro는 이미 결제한 기간이 끝날 때까지 유지됩니다.',
  // Usage
  "usage.title": "사용량",
  "usage.subtitlePre": "어시스턴트가 실제로 사용한 토큰, 메시지, 예상 모델 비용입니다. 플랜 한도는",
  "usage.subtitleLinkLabel": "결제",
  "usage.subtitlePost": " 페이지에서 확인하세요.",
  "usage.period.week": "이번 주",
  "usage.period.month": "이번 달",
  "usage.period.all": "전체 기간",
  "usage.period.ariaLabel": "사용량 기간",
  "usage.error.load": "사용량 데이터를 불러오지 못했습니다. 다시 시도해 주세요.",
  "usage.empty.title": "이 기간에는 모델 사용량이 없습니다",
  "usage.empty.description":
    "어시스턴트가 메일을 분류하거나, 답장 초안을 쓰거나, 챗에 답하면 사용 내역이 여기 표시됩니다.",
  "usage.stat.estimatedCost": "예상 비용",
  "usage.stat.tokens": "토큰",
  "usage.stat.tokensDetail": "프롬프트 {prompt} · 완성 {completion}",
  "usage.stat.messages": "메시지",
  "usage.dailyActivity.title": "일별 활동",
  "usage.dailyActivity.subtitle": "최신순 일별 토큰 사용량입니다.",
  "usage.conversations.title": "상위 대화",
  "usage.conversations.subtitle":
    "가장 많은 토큰을 사용한 어시스턴트 대화 20개, 전체 기간 기준입니다.",
  "usage.conversations.colConversation": "대화",
  "usage.conversations.colMessages": "메시지",
  "usage.conversations.colTokens": "토큰",
  "usage.conversations.colEstCost": "예상 비용",
  "usage.conversations.untitled": "제목 없는 대화",
  // Receipt (What Klorn did today)
  "receipt.error.load": "오늘의 처리 내역을 불러오지 못했습니다.",
  "receipt.error.noReceipt": "표시할 내역이 없습니다.",
  "receipt.loading": "오늘의 처리 내역 불러오는 중",
  "receipt.title": "Klorn이 오늘 한 일",
  "receipt.refresh": "새로고침",
  "receipt.metric.signalsSeen": "확인한 신호",
  "receipt.metric.pushed": "푸시됨",
  "receipt.autoHandled.title": "자동 처리됨",
  "receipt.autoHandled.description": "방해 없이 Klorn이 직접 실행한 저위험 작업",
  "receipt.pushed.title": "알림으로 보냄",
  "receipt.pushed.description": "Klorn이 방해할 만큼 긴급하다고 판단한 신호",
  "receipt.queued.title": "결정 큐에 대기 중",
  "receipt.queued.description": "결정 큐에 넣고 푸시는 보내지 않은 항목",
  "receipt.silenced.title": "조용히 처리됨",
  "receipt.silenced.description": "집중을 지키기 위해 Klorn이 걸러낸 신호",
  "receipt.undo.creating": "되돌리는 중...",
  "receipt.undo.request": "되돌리기 요청",
  "receipt.undo.error": "되돌리기 제안을 만들지 못했습니다. 다시 시도해 주세요.",
  "receipt.empty.title": "아직 오늘 처리된 신호가 없습니다.",
  "receipt.empty.description":
    "나중에 다시 확인해 주세요 — Klorn은 메일과 일정을 계속 살피고 있어요.",
  "receipt.backToQueue": "← 결정 큐로 돌아가기",
  "receipt.status.opened": "열람함",
  "receipt.status.sent": "발송됨",
  "receipt.type.commitmentDue": "약속 마감",
  "receipt.type.commitmentOverdue": "기한 지난 약속",
  "receipt.type.commitmentUnconfirmed": "확인되지 않은 약속",
  "receipt.type.replyNeeded": "답장 필요",
  "receipt.type.deadline": "마감",
  "receipt.type.agentProposal": "에이전트 제안",
  "receipt.type.decision": "자동 조치",
  "receipt.source.pendingAction": "에이전트",
  "receipt.source.task": "할 일",
  "receipt.source.calendarEvent": "캘린더",
  "receipt.source.notification": "알림",
  "receipt.source.commitment": "약속",
  "receipt.source.email": "이메일",
  // Verify email
  "verifyEmail.verifying": "이메일 확인 중…",
  "verifyEmail.eyebrow": "이메일 인증",
  "verifyEmail.title.sent": "인증 이메일을 보냈습니다",
  "verifyEmail.title.pending": "이메일을 인증해 주세요",
  "verifyEmail.title.error": "인증에 실패했습니다",
  "verifyEmail.description.sent": "받은 메일함에서 인증 링크를 열면 Klorn 워크스페이스가 열립니다.",
  "verifyEmail.description.pending":
    "계정 이메일을 인증하면 모든 워크스페이스 기능을 사용할 수 있어요.",
  "verifyEmail.description.error":
    "링크가 만료되었거나 올바르지 않습니다. 다시 로그인한 뒤 인증 이메일을 새로 요청해 주세요.",
  "auth.backToLogin": "로그인으로 돌아가기",
  "verifyEmail.nextStep": "다음 단계",
  "verifyEmail.nextStepBody.sent":
    "Klorn 인증 이메일을 열어 링크를 따라가세요. 인증 후 결정 큐로 돌아올 수 있습니다.",
  "verifyEmail.nextStepBody.pending": "이메일이 보이지 않으면 인증 링크를 새로 보내세요.",
  "verifyEmail.nextStepBody.error":
    "로그인으로 돌아가 계정 상태를 확인한 뒤 인증 이메일을 새로 요청해 주세요.",
  "verifyEmail.resendAgain": "다시 보내기",
  "verifyEmail.resendVerification": "인증 이메일 보내기",
  // Reset password
  "resetPassword.eyebrow": "비밀번호 재설정",
  "resetPassword.checkEmail.title": "이메일을 확인해 주세요",
  "resetPassword.checkEmail.description":
    "해당 이메일 계정이 있다면 비밀번호 재설정 링크를 보냈습니다.",
  "resetPassword.checkEmail.body":
    "링크는 제한된 시간 동안만 유효합니다. 보이지 않으면 스팸함을 확인해 주세요.",
  "resetPassword.openLogin": "로그인 열기",
  "resetPassword.description": "계정 이메일을 입력하면 안전한 재설정 링크를 보내드립니다.",
  "resetPassword.error.sendFailed":
    "재설정 링크를 보내지 못했습니다. 주소를 확인하고 다시 시도해 주세요.",
  "resetPassword.emailPlaceholder": "you@example.com",
  "resetPassword.sending": "보내는 중...",
  "resetPassword.sendLink": "재설정 링크 보내기",
  "resetPassword.newPassword.eyebrow": "새 비밀번호",
  "resetPassword.newPassword.title": "새 비밀번호 설정",
  "resetPassword.newPassword.description": "다음 로그인부터 사용할 비밀번호를 입력하세요.",
  "resetPassword.newPassword.label": "새 비밀번호",
  "resetPassword.confirmPassword.label": "비밀번호 확인",
  "resetPassword.confirmPassword.placeholder": "비밀번호를 다시 입력하세요",
  "resetPassword.confirmPassword.mismatch": "비밀번호가 일치하지 않습니다.",
  "resetPassword.resetting": "재설정 중...",
  "resetPassword.updated.eyebrow": "비밀번호 변경됨",
  "resetPassword.updated.title": "비밀번호 재설정 완료",
  "resetPassword.updated.description":
    "비밀번호가 변경되었습니다. 새 비밀번호로 로그인할 수 있어요.",
  "resetPassword.error.genericFailed": "재설정에 실패했습니다.",
};

const translations: Record<Locale, Record<string, string>> = {
  en: enTranslations,
  ko: koTranslations,
};

/** Verify all locales have the same set of keys. Warns in dev builds. */
function verifyTranslationSymmetry(): void {
  const locales = Object.keys(translations) as Locale[];
  if (locales.length === 0) return;
  const base = locales[0];
  const baseKeys = new Set(Object.keys(translations[base]));

  for (const locale of locales.slice(1)) {
    const localeKeys = new Set(Object.keys(translations[locale]));
    const missing = [...baseKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !baseKeys.has(k));
    if (missing.length > 0) {
      // biome-ignore lint/suspicious/noConsole: dev-time i18n validation
      console.warn(`[i18n] "${locale}" missing keys: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      // biome-ignore lint/suspicious/noConsole: dev-time i18n validation
      console.warn(`[i18n] "${locale}" has unexpected keys: ${extra.join(", ")}`);
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  verifyTranslationSymmetry();
}

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);
const PROFILE_KEY = "klorn-profile";
const LEGACY_KEY_PREFIX = "ev" + "e";
const LEGACY_PROFILE_KEY = `${LEGACY_KEY_PREFIX}-profile`;

function getStoredProfile(): string | null {
  const stored = localStorage.getItem(PROFILE_KEY);
  if (stored) return stored;
  const legacyStored = localStorage.getItem(LEGACY_PROFILE_KEY);
  if (legacyStored) {
    localStorage.setItem(PROFILE_KEY, legacyStored);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
  }
  return legacyStored;
}

function detectLocale(): Locale {
  // English is the default. Korean is opt-in only — a Korean-locale browser
  // still lands in English unless the user explicitly picks 한국어 in
  // Settings → Language. We intentionally do NOT follow navigator.language.
  try {
    const stored = getStoredProfile();
    if (stored) {
      const { language } = JSON.parse(stored);
      if (language === "ko") return "ko";
    }
  } catch {
    // ignore a malformed profile
  }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());

    // Re-detect when profile settings change in another tab/window…
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROFILE_KEY || e.key === LEGACY_PROFILE_KEY) {
        setLocaleState(detectLocale());
      }
    };
    // …and in THIS tab (the storage event never fires in the writing tab, so
    // Settings dispatches this after saving the profile).
    const onProfileUpdated = () => setLocaleState(detectLocale());
    window.addEventListener("storage", onStorage);
    window.addEventListener("klorn-profile-updated", onProfileUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("klorn-profile-updated", onProfileUpdated);
    };
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => {
      let str = translations[locale]?.[key] || translations.en[key] || key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, v);
        }
      }
      return str;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
