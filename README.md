# hireEVE

Your first AI employee. EVE handles emails, scheduling, research, and more — so you can focus on building.

## What is EVE?

EVE is an autonomous AI assistant built for solo founders and indie hackers. Instead of switching between tools, just tell EVE what you need in plain language. She'll handle it.

**Currently supports:**
- Chat with real-time streaming responses
- Gmail — read inbox, send emails, all through conversation
- Works great in Korean and English

## Stack

- **Frontend:** Next.js 15 + Tailwind CSS
- **Backend:** Fastify + Prisma + PostgreSQL
- **LLM:** OpenRouter (free tier, nvidia/nemotron-3-super-120b)
- **Gmail:** Google OAuth2 + function calling
- **Monorepo:** pnpm workspaces

## Setup

```bash
pnpm install

cd packages/api
cp .env.example .env
npx prisma migrate dev
pnpm dev          # API on :8000

cd ../web
pnpm dev          # Web on :8001
```

You'll need these in `packages/api/.env`:

```
DATABASE_URL=postgresql://...
OPENROUTER_API_KEY=your-key
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
```

Get a free OpenRouter key at [openrouter.ai](https://openrouter.ai). Set up Google OAuth in the [Cloud Console](https://console.cloud.google.com) with redirect URI `http://localhost:8000/api/auth/google/callback`.

## How it works

1. Open `localhost:8001/chat` and start a conversation
2. EVE responds in real-time via SSE streaming
3. Connect Gmail through the OAuth flow — EVE can then read and send emails on your behalf
4. All conversations are persisted in PostgreSQL

## Project layout

```
packages/
  api/        Fastify server, LLM integration, Gmail tools
  web/        Next.js chat interface
```

## Roadmap

- [x] Chat with streaming
- [x] Gmail (read + send)
- [ ] Google Calendar
- [ ] Slack
- [ ] Task management
- [ ] Autonomous background tasks

## License

MIT
