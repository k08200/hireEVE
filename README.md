# hireEVE

Your first AI employee. EVE autonomously handles emails, scheduling, tasks, and more — so you can focus on building.

## What is EVE?

EVE is an autonomous AI assistant built for solo founders and small teams. Instead of switching between tools, tell EVE what you need in plain language — or let her figure it out on her own.

She reads your emails, manages your calendar, tracks tasks, takes notes, and proactively suggests actions based on what's happening in your day. EVE learns your preferences over time and gets better the more you use her.

## Key Features

### Autonomous Agent
EVE doesn't just respond to commands — she thinks proactively. Every few minutes, she analyzes your full context (tasks, calendar, emails, notes, reminders, contacts) and decides what needs attention.

- **SUGGEST mode**: Sends smart notifications with reasoning
- **AUTO mode**: Executes low-risk actions automatically, asks approval for the rest
- **Risk classification**: LOW (auto-execute) → MEDIUM (approval needed) → HIGH (explicit confirmation)
- **Pattern learning**: Learns your preferences from approvals, rejections, and usage patterns

### Gmail Integration
- Read, search, and send emails through conversation
- AI-powered email summarization, categorization, and sentiment analysis
- Auto-reply rules with smart template generation
- Thread grouping and action item extraction
- Background sync with local DB for fast access

### Google Calendar
- View, create, and delete events
- Two-way sync with Google Calendar
- Conflict detection before scheduling
- Meeting link support and all-day events
- 5-minute pre-meeting notifications

### Task Management
- Create tasks with priority (LOW → URGENT) and due dates
- Status tracking: TODO → IN_PROGRESS → DONE
- Agent-aware: EVE can suggest and create tasks based on emails or calendar

### Notes
- Create and organize notes by category
- Full-text search across all notes
- EVE can draft documents, reports, and proposals

### Reminders
- Schedule reminders with snooze functionality
- Automatic delivery at the right time via push notification
- Deduplication to prevent notification spam

### Contacts
- Full contact management with company, role, and tags
- Auto-populated from email senders
- Searchable directory

### Memory System
Inspired by Claude Code's memory architecture. EVE remembers facts, preferences, and feedback across conversations:

- **Types**: Preference, Fact, Decision, Context, Feedback
- **Confidence scoring**: Tracks certainty of learned information
- **Auto-learning**: Updates from agent interactions and user corrections
- **Pattern detection**: Temporal patterns, tool preferences, workflow analysis

### Real-Time Notifications
- WebSocket-based live updates
- Web Push notifications (works even when tab is closed)
- Notification types: reminder, calendar, email, task, meeting, briefing, agent

### Daily Briefing
- Auto-generated morning summary of your day
- Configurable delivery time
- Covers: today's meetings, pending tasks, important emails, upcoming deadlines

### Automations
- Email auto-classification
- Calendar auto-sync (every 15 minutes)
- Meeting auto-summarization
- Download folder organization (macOS)
- Configurable per-user settings

### Workspace & Billing
- Multi-user workspace with roles (Owner, Admin, Member)
- Stripe-powered billing: Free, Pro, Team, Enterprise plans
- Token usage tracking with cost estimation
- GDPR-compliant data export and deletion

## EVE's Tools (45+)

| Category | Tools |
|----------|-------|
| **Email** | list, read, send, classify emails |
| **Calendar** | list, create, delete events; check conflicts |
| **Tasks** | list, create, update, delete tasks |
| **Notes** | list, create, update, delete notes |
| **Reminders** | list, create, dismiss, delete reminders |
| **Contacts** | list, create, update, delete contacts |
| **Memory** | remember, recall, forget |
| **Communication** | iMessage, Slack (send/read) |
| **Knowledge** | Notion search/create, web search, news, weather |
| **Documents** | write documents, translate text |
| **Files (macOS)** | search files, read/summarize, organize downloads |
| **System (macOS)** | clipboard, screenshots, running apps, system info |
| **Utilities** | calculate, convert currency, shorten URL, generate password |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, Tailwind CSS, TypeScript |
| **Backend** | Fastify, Prisma ORM, PostgreSQL |
| **LLM** | OpenRouter (configurable model) |
| **Auth** | JWT + Google OAuth2 |
| **Real-time** | WebSocket + Server-Sent Events |
| **Push** | VAPID Web Push (service worker) |
| **Billing** | Stripe |
| **Integrations** | Gmail API, Google Calendar API, Slack, Notion |
| **Monorepo** | pnpm workspaces |

## Project Structure

```
packages/
  api/          Fastify server, LLM integration, autonomous agent, tools
  web/          Next.js frontend (23 pages)
  core/         Shared utilities and types
```

### API Architecture

```
src/
  routes/         18 route handlers (auth, chat, email, calendar, tasks, ...)
  autonomous-agent.ts    Proactive LLM reasoning loop
  automation-scheduler.ts  Scheduled automations (briefing, sync, classify)
  background.ts          Real-time event monitoring (meetings, reminders)
  pattern-learner.ts     User behavior analysis and learning
  tool-executor.ts       45+ tool implementations
  memory.ts              Persistent memory system
  gmail.ts               Gmail API client with token refresh
  calendar.ts            Google Calendar API client
  email-sync.ts          Gmail ↔ DB sync pipeline
  context-compressor.ts  LLM history compaction
```

### Frontend Pages

```
/chat             Conversation list
/chat/[id]        Chat interface with real-time streaming
/dashboard        Activity overview
/email            Gmail inbox with AI categorization
/calendar         Calendar (month/week/list views)
/tasks            Task board
/notes            Note management
/reminders        Reminder list with snooze
/contacts         Contact directory
/notifications    Notification center
/automations      Automation settings
/settings         Account settings + Google integration
/settings/memory  View learned memories
/settings/usage   Token usage and costs
/workspace        Team management
/billing          Subscription management
```

## Setup

### Prerequisites

- Node.js 22+
- PostgreSQL
- pnpm

### Quick Start

```bash
# Clone and install
git clone https://github.com/k08200/hireEVE.git
cd hireEVE
pnpm install

# Set up the API
cd packages/api
cp .env.example .env    # Edit with your credentials
npx prisma migrate dev
pnpm dev                # API on :8000

# In another terminal — set up the frontend
cd packages/web
pnpm dev                # Web on :8001
```

### Environment Variables

#### Backend (`packages/api/.env`)

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/hireeve
JWT_SECRET=your-secret
OPENROUTER_API_KEY=your-key        # Get free at openrouter.ai

# Google OAuth (for Gmail + Calendar)
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# Frontend URL (for OAuth redirects)
WEB_URL=http://localhost:8001

# Optional
STRIPE_SECRET_KEY=                  # Billing
SLACK_BOT_TOKEN=                    # Slack integration
NOTION_API_KEY=                     # Notion integration
VAPID_PUBLIC_KEY=                   # Web Push
VAPID_PRIVATE_KEY=                  # Web Push
CORS_ORIGINS=http://localhost:8001  # Allowed frontend origins
```

#### Frontend (`packages/web/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
4. Copy Client ID and Secret to your `.env`
5. Enable Gmail API and Google Calendar API in the console

### Docker (Alternative)

```bash
docker compose up
# API on :3001, Web on :3000, PostgreSQL on :5432
```

## How It Works

### Chat Flow
1. User sends a message → streamed to LLM with conversation history
2. LLM decides whether to respond directly or call tools (function calling)
3. Tool results feed back to LLM for final response
4. Long conversations are auto-compacted to stay within context limits

### Autonomous Agent Flow
1. Every N minutes, gather full user context (tasks, calendar, emails, etc.)
2. Send context + available tools to LLM
3. LLM reasons about what needs attention
4. In SUGGEST mode: create notification with reasoning
5. In AUTO mode: execute low-risk actions, propose medium/high-risk ones
6. Log all decisions to AgentLog for transparency

### Pattern Learning Flow
1. Track user approvals and rejections of agent proposals
2. Analyze temporal patterns (when does the user work?)
3. Detect tool preferences (which actions get approved most?)
4. Save high-confidence patterns as memories
5. Inject learned patterns into agent context for better suggestions

## Database

24 core models including:

- **User & Auth**: User, UserToken, Workspace, WorkspaceMember
- **Productivity**: Task, Note, Reminder, Contact, CalendarEvent
- **Communication**: Conversation, Message, EmailMessage, EmailRule
- **AI & Automation**: AutomationConfig, PendingAction, Memory, AgentLog
- **Tracking**: TokenUsage, Notification, PushSubscription, ConversationSummary

## Deployment

### Production Setup

**Backend** (Render, Railway, etc.):
```bash
# Build
cd packages/core && pnpm build
cd ../api && npx prisma generate && pnpm build

# Start
cd packages/api && npx prisma migrate deploy && node dist/index.js
```

**Frontend** (Vercel):
- Framework: Next.js
- Set `NEXT_PUBLIC_API_URL` to your backend URL

**Required production env vars**:
- `CORS_ORIGINS=https://your-frontend.vercel.app`
- `WEB_URL=https://your-frontend.vercel.app`
- `GOOGLE_REDIRECT_URI=https://your-api.onrender.com/api/auth/google/callback`
- Add the production redirect URI to Google Cloud Console

## Language Support

EVE works in both Korean and English. She mirrors the language you use — write in Korean, get responses in Korean. Write in English, get responses in English.

## License

MIT
