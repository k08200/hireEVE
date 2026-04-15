# hireEVE

**Connect once. EVE handles the rest.**

EVE is an AI employee that works 24/7 on your server — reading emails, checking calendars, tracking tasks, and telling your team what to focus on next. She doesn't wait for commands. She makes decisions.

## Why EVE?

Every team wastes hours switching between tools. Gmail shows emails. Calendar shows meetings. Todoist shows tasks. But none of them answer the only question that matters:

**"What should I do right now?"**

EVE connects all your tools, cross-references everything, and delivers prioritized decisions — not just information.

| Tool | What it does | What EVE does |
|------|-------------|---------------|
| Gmail | "You have 30 emails" | "1 needs a reply today — investor waiting 48h" |
| Calendar | "3 meetings today" | "2pm meeting is critical, prep doc missing" |
| Todoist | "12 tasks open" | "2 are overdue and blocking others" |
| ChatGPT | Answers when asked | EVE acts before you ask |
| Zapier | Rule-based automation | LLM-powered judgment calls |

## How It Works

1. **Sign up and connect Google** — one click
2. **EVE starts working** — scans your email, calendar, and tasks
3. **Morning briefing arrives** — prioritized, not just summarized
4. **Urgent alerts in real-time** — push notifications when something can't wait
5. **Chat when you need to** — "Draft a reply to that investor" and it's done

### The Morning Briefing (EVE's "Aha Moment")

You wake up. You didn't ask for anything. EVE already prepared:

> **Today's Top 3:**
> 1. Reply to Investor A — received last night, 48h response window
> 2. 2pm client meeting — no prep doc yet, draft ready for review
> 3. Invoice deadline — due today, payment link prepared

This isn't a summary. It's a **judgment call** — only possible because EVE sees your email AND calendar AND tasks together.

### Autonomous Agent

EVE thinks proactively. She analyzes your full context and decides what needs attention:

- **SUGGEST mode**: Smart notifications with reasoning
- **AUTO mode**: Executes low-risk actions, asks approval for the rest
- **Risk levels**: LOW (auto) → MEDIUM (approval) → HIGH (explicit confirmation)
- **Pattern learning**: Gets better from your approvals and rejections

## For Teams

EVE scales from solo founders to enterprise teams. The bigger the team, the more powerful the cross-context decisions:

> "Dev team's release is delayed but marketing scheduled the launch announcement for tomorrow. Should I flag this?"

One person's email + another's calendar + the team's task board = decisions no single tool can make.

| Plan | For | Price |
|------|-----|-------|
| Free | Try it out | $0/mo (50 messages) |
| Pro | Individuals | $29/mo |
| Team | Small teams | $99/mo |
| Enterprise | Organizations | Custom |

## Features

### Core (Autonomous)
- **Morning briefing** — prioritized daily summary with action items
- **Email intelligence** — classification, urgency detection, draft replies
- **Calendar awareness** — conflict detection, meeting prep, schedule optimization
- **Task prioritization** — cross-references deadlines with email and calendar context
- **Real-time alerts** — push notifications for time-sensitive items
- **Pattern learning** — adapts to your preferences over time

### Tools (45+)

| Category | Tools |
|----------|-------|
| Email | List, read, send, classify, auto-reply |
| Calendar | List, create, delete events, conflict check |
| Tasks | Create, update, delete, prioritize |
| Notes | Create, update, delete, search |
| Reminders | Create, dismiss, snooze |
| Contacts | Manage, auto-populate from email |
| Memory | Remember, recall, forget across conversations |
| Knowledge | Web search, news, weather |
| Documents | Write, translate |

### Integrations
- Gmail + Google Calendar (OAuth)
- Slack (send/read messages)
- Notion (search/create pages)
- Web Push notifications (works with tab closed)
- WebSocket real-time updates

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, Tailwind CSS, TypeScript |
| Backend | Fastify, Prisma ORM, PostgreSQL |
| AI | OpenAI (user-configurable model) |
| Auth | JWT + Google OAuth2 |
| Real-time | WebSocket + Server-Sent Events |
| Push | VAPID Web Push |
| Billing | Stripe |
| Monorepo | pnpm workspaces |

## Project Structure

```
packages/
  api/    Fastify server, autonomous agent, 45+ tools
  web/    Next.js frontend
  core/   Shared utilities and types
```

## Setup

### Prerequisites

- Node.js 22+
- PostgreSQL
- pnpm

### Quick Start

```bash
git clone https://github.com/k08200/hireEVE.git
cd hireEVE
pnpm install

# API
cd packages/api
cp .env.example .env    # Edit with your credentials
npx prisma migrate dev
pnpm dev                # API on :8000

# Web (in another terminal)
cd packages/web
pnpm dev                # Web on :8001
```

### Environment Variables

#### Backend (`packages/api/.env`)

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/hireeve
JWT_SECRET=your-secret
OPENROUTER_API_KEY=your-key
TOKEN_ENCRYPTION_KEY=             # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Google OAuth
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
WEB_URL=http://localhost:8001

# Optional
STRIPE_SECRET_KEY=
SLACK_BOT_TOKEN=
NOTION_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CORS_ORIGINS=http://localhost:8001
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
5. Enable Gmail API and Google Calendar API

### Docker

```bash
docker compose up
# API on :3001, Web on :3000, PostgreSQL on :5432
```

## Deployment

**Backend** (Render, Railway, etc.):
```bash
cd packages/core && pnpm build
cd ../api && npx prisma generate && pnpm build
cd packages/api && npx prisma migrate deploy && node dist/index.js
```

**Frontend** (Vercel):
- Set `NEXT_PUBLIC_API_URL` to your backend URL

**Production env vars**:
- `CORS_ORIGINS=https://your-frontend.vercel.app`
- `WEB_URL=https://your-frontend.vercel.app`
- `GOOGLE_REDIRECT_URI=https://your-api.onrender.com/api/auth/google/callback`

## Language Support

EVE works in both Korean and English. She mirrors the language you use.

## License

MIT
