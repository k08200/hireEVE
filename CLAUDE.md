# EVE (hireEVE) — Project Guide for Claude Code

> 1인 창업자의 첫 번째 AI 직원. Fastify + Next.js + Prisma + OpenAI 자율 에이전트.
> 리포: `k08200/hireEVE` (private). 메모리: `~/.claude/projects/-Users-yongrean-Downloads-probeai/memory/`.

## 스택
- **API**: Fastify + TypeScript ([packages/api/src/](packages/api/src/))
- **Web**: Next.js App Router ([packages/web/src/app/](packages/web/src/app/))
- **Desktop**: Tauri v2 ([apps/desktop/](apps/desktop/))
- **DB**: PostgreSQL + Prisma
- **AI**: OpenAI gpt-4o-mini (유저별 모델 선택)
- **결제**: Stripe (FREE/PRO/TEAM)
- **인증**: JWT + Google OAuth + bcrypt
- **이메일/캘린더**: Gmail API + Google Calendar (OAuth + push)
- **실시간**: WebSocket + Web Push (VAPID)
- **패키지 매니저**: pnpm
- **린터**: biome
- **배포**: Vercel (web), Render (api), Docker

## 핵심 파일
- [packages/api/src/autonomous-agent.ts](packages/api/src/autonomous-agent.ts) — 자율 에이전트 (1,691줄), TOOL_RISK_LEVELS
- [packages/api/src/auth.ts](packages/api/src/auth.ts) — JWT, getUserId(), requireAuth, 디바이스 세션
- [packages/api/src/tool-executor.ts](packages/api/src/tool-executor.ts) — 36+ 도구 실행기
- [packages/api/src/memory.ts](packages/api/src/memory.ts) — 에이전트 메모리 (preference/fact/decision/context/feedback)
- [packages/api/src/email-sync.ts](packages/api/src/email-sync.ts) — Gmail 동기화 (외부 텍스트 → LLM 컨텍스트)
- [packages/api/src/routes/chat.ts](packages/api/src/routes/chat.ts) — SSE 스트리밍 채팅
- [packages/api/src/webhook.ts](packages/api/src/webhook.ts) — Stripe 웹훅 (dedup 적용됨)

## TOOL_RISK_LEVELS (autonomous-agent.ts:61)
- **LOW** (AUTO 모드 자동 실행): create_reminder, dismiss_reminder, update_task, classify_emails, create_task, update_note, mark_read
- **MEDIUM** (승인 필요): send_email, create_event, create_note, update_contact, create_contact
- **HIGH** (명시적 확인): delete_task, delete_note, delete_contact

---

## 완료된 작업

### 보안 부채 (전부 해결됨)
1. ~~OAuth 토큰 평문 저장~~ → `crypto-tokens.ts` (AES-256-GCM 암호화)
2. ~~requireAuth 누락~~ → 전 라우트 `app.addHook("preHandler", requireAuth)` 적용 확인됨
3. ~~테스트 0개~~ → **165+ 테스트**, 19 파일 (auth, tasks, notes, contacts, reminders, calendar, devices, memory, agents, workspace, admin, notifications, automations, context-compressor, with-retry, crypto-tokens, untrusted, tool-result-budget)
4. ~~Gmail prompt injection~~ → `wrapUntrusted()` + 시스템 프롬프트 방어 (`untrusted.ts`, `autonomous-agent.ts:780`)

### 구현된 기능
1. ~~컨텍스트 압축~~ → `context-compressor.ts` (compactHistory, forceCompact, isTokenLimitError)
2. ~~세션 메모리~~ → `memory.ts` (remember/recall/forget 도구 + loadMemoriesForPrompt + 자동 학습)
3. ~~에러 분류 + 자동 복구~~ → `with-retry.ts` (withRetry, 지수 백오프) + `context-compressor.ts` (토큰 초과 시 forceCompact)
4. ~~도구 결과 예산~~ → tool-executor.ts (100K chars 제한)
5. ~~WebSocket 재연결~~ → `use-websocket.ts` (지수 백오프 1s→30s cap + jitter)
6. ~~도구별 승인 UI~~ → `chat/[id]/page.tsx` (send_email, create_event, create_task, create_note, create_contact, delete 미리보기)
7. ~~스킬 시스템~~ → `skill-executor.ts` (execute_skill/list_skills 도구 + `/skills` 관리 페이지 + 채팅 `/` 피커)
8. ~~이벤트 트리거~~ → `gmail-push.ts` (Pub/Sub 웹훅 + registerGmailWatch + 자동 갱신 + 설정 UI)
9. ~~도구 배치 처리~~ → `semaphore.ts` + `batch-tools.ts` (chat.ts Promise.all + 세마포어 동시 5개 제한)

### 다음 기능 후보
- 대화 검색 — full-text search

---

## 작업 흐름별 추천 스킬

### 보안 감사 / 런칭 전 점검
- `/cso` (gstack) — OWASP+STRIDE 감사. OAuth 평문 토큰 + requireAuth 누락 잡기
- `/review` (gstack) — PR 단위 인증 누락 패턴 검출
- `security-reviewer` agent (ECC) — 코드 단위 정밀 리뷰
- `/eval` (ECC) — 자율 에이전트 동작 검증 하니스

### 자율 에이전트 / 메모리 / 컨텍스트
- `agent-harness-construction` (ECC) — autonomous-agent.ts 아키텍처 강화 시
- `agentic-engineering` (ECC) — 에이전트 설계 일반 패턴
- `autonomous-loops` / `continuous-agent-loop` (ECC) — 백그라운드 루프 개선
- `continuous-learning` / `continuous-learning-v2` (ECC) — memory.ts 자동 학습 강화
- `token-budget-advisor` (ECC) — 컨텍스트 압축 설계
- `prompt-optimizer` (ECC) — 시스템 프롬프트 슬리밍
- `cost-aware-llm-pipeline` (ECC) — gpt-4o-mini 토큰 예산
- `eval-harness` (ECC) — 에이전트 평가 루프

### EVE 도메인 (이메일/캘린더/외부 통합)
- `email-ops` (ECC) — Gmail 작업 패턴
- `google-workspace-ops` (ECC) — Google API 통합

### 코드 작성
- `backend-patterns` / `api-design` (ECC) — Fastify 라우트 설계
- `frontend-patterns` / `frontend-design` (ECC) — Next.js App Router
- `database-migrations` (ECC) — Prisma 스키마 변경 시
- `typescript-reviewer` agent (ECC) — TS 코드 리뷰
- `~/.claude/rules/typescript/` — TS 코딩 표준

### 테스트 (165+ 테스트, CI 자동 실행)
- `/tdd` (ECC) — TDD 방식 작성
- `/e2e` (ECC) + `e2e-runner` agent — 브라우저 E2E
- `/qa` (gstack) — 실제 브라우저로 회귀 검증
- `npx vitest run` — 전체 테스트 실행

### 계획 / 결정
- `/office-hours` (gstack) — 큰 결정 상의
- `/plan-eng-review` (gstack) — 아키텍처 변경 전 게이트
- `/plan-ceo-review` (gstack) — 제품 방향 검토
- `planner` / `architect` agent (ECC) — 구현 플랜

### PR / 출시
- `/ship` (gstack) — PR 생성·머지
- `/canary` (gstack) — 점진적 출시
- `/retro` (gstack) — 주간 회고

---

## EVE 작업 시 주의사항 (프로젝트 메모리 + 이번 세션 합의)

### 커밋/PR 규칙 (양도 불가)
- **No Co-Authored-By** — 커밋 메시지에 `Co-Authored-By: Claude ...` 절대 금지
- **Never force push** — `--force`, `--force-with-lease` 금지
- **PR/commit in English** — title/summary/body/commit message 영어 필수
- **PR body 금지**: "Generated with Claude Code" 문구, Test plan 섹션 절대 금지
- **유저가 직접 PR 만들거나 명시적으로 push 요청** — 임의 push 금지

### 코드 분석 시
- **버그 주장 전 실제 코드 검증 필수** — "버그일 것 같다" ≠ "버그다"
- 프레임워크/SDK 기본 동작 먼저 확인 (타임아웃, 에러 핸들링 등)
- "프로덕션에서 유저가 실제로 겪을 심각한 버그는 현재 없다" — 대부분 개선사항

### 환경
- `gh` CLI 설치됨 (`/opt/homebrew/bin/gh`, auth as `k08200`)
- 언어: 한국어 선호 (대화)
- bun: `~/.bun/bin/bun` (gstack용 — 글로벌 PATH 필요 시 `~/.zshrc` 적용됨)

---

## 외부 참조 / 설치 위치
- **gstack**: `~/.claude/skills/gstack/` (글로벌, 모든 프로젝트 공통)
- **ECC**: `~/Downloads/everything-claude-code/` (소스), `~/.claude/{agents,skills,rules,commands,scripts}/` (배포)
- **gstack 업데이트**: `/gstack-upgrade`
- **ECC 재설치**: `cd ~/Downloads/everything-claude-code && ./install.sh --profile full`
- **백업**: `~/.claude/settings.json.bak.*`
