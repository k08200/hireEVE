# Product vocabulary

The words Klorn's UI is allowed to use, and what each one means. Written down
because "inbox" was being read three different ways — a page, an account, and
the tier board — and nothing in the repo said which was correct.

Founder decision (2026-08-04): **"inbox" means a connected mail account.** It
never names a screen.

## The nouns

| Term | Means | Where it appears | Never means |
|---|---|---|---|
| **inbox** | One connected mail account (a Gmail account, a Naver IMAP account). A user can have several. | Settings → "Connected inboxes", the account switcher on Mail | A screen. Not the decision queue, not the firewall board. |
| **Decision queue** | The list of things waiting for the user's approval. The app's home surface. | Sidebar nav, `/inbox` (URL is historical), desktop panel | A mail list. Nothing lands here unless it needs a decision. |
| **Firewall board** | The 4-tier view of how mail was classified: PUSH / QUEUE / SILENT / AUTO. | `/inbox/firewall`, the desktop tier columns | A place to read mail. It shows *judgments*, not threads. |
| **Receipt** | The record of what Klorn did today, after the fact. | `/inbox/receipt` | Something to act on. It is read-only history. |
| **Mail** | The actual message list and reading view. | `/email`, desktop reading pane | The decision queue. |

## The tiers

Exactly four, fixed (POC.md, LOCKED). Never invent a fifth, and never rename
one:

| Tier | Means |
|---|---|
| **PUSH** | Interrupt the user now. |
| **QUEUE** | Worth reading today; no banner. |
| **SILENT** | Filed, not deleted. Still there when they look. |
| **AUTO** | Klorn was confident enough not to ask. **Classification only** — it does not mean "Klorn replied for me." |

`AUTO` is the one users misread most, which is why the desktop ships a tier
guide explaining it. Copy that implies AUTO acts on its own is wrong.

## Two different "language" settings

They are not the same knob, and conflating them produces a Korean reply
announced by an English banner:

- **App language** — the UI chrome of one client. Local to that client (the Mac
  reads macOS's language; the web has its own setting).
- **Notification language** — the language Klorn writes *its own* notifications
  in ("Draft ready"). Server-side (`AutomationConfig.notificationLanguage`),
  because a push is composed on the server where there is no client locale.
- **Reply language** — not a setting at all. A reply always follows the
  language of the mail it answers.

## Two different "auto"

Also distinct, also easy to conflate:

- **AUTO tier** — a classification label (above). Takes no action.
- **Agent mode = AUTO** — how much the agent may do without asking
  (`SHADOW` / `SUGGEST` / `AUTO`). Even here, sending mail is excluded from
  pre-approval on purpose: a bad auto-reply costs more trust than the saved
  click is worth.

## Rule

If a new surface needs a name, take it from this table or add a row here first.
The cost of two words for one thing is a user who can't tell what they're
looking at.
