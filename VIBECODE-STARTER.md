# Vibecode Project Starter — Solo Founder Edition

> **One person, many agents, shipping real products.**
> This is your launchpad for turning AI-assisted projects into scalable solo ventures. Every tool, pattern, and principle below has been battle-tested by the vibecoding community in 2026.

---

## Part 1: The Foundation — Context Engineering

Context engineering is what separates projects that scale from projects that collapse under their own weight. Your CLAUDE.md, AGENTS.md, and rules files are not documentation — they are the operating system for your AI workforce.

### CLAUDE.md — Your Project's Brain

CLAUDE.md is read at the start of every Claude Code session. It is as important as your .gitignore.

**Rules for writing a good one:**

1. **Keep it under 100 lines.** Every line consumes context window budget. For each line ask: "Would removing this cause Claude to make mistakes?" If not, cut it.
2. **Use hierarchical loading.** `~/.claude/CLAUDE.md` (global) → project root `CLAUDE.md` → subdirectory `CLAUDE.md` files. Feature-specific context lives in subdirectories.
3. **Use `@imports` for depth.** Keep root CLAUDE.md lean and `@path/to/detail.md` for architecture docs, API specs, and patterns.
4. **Treat it like code.** Check it into git. Review it when things go wrong. Prune it regularly.
5. **Use emphasis for critical rules.** "IMPORTANT" and "YOU MUST" actually improve adherence.

**What to include:**

```markdown
# CLAUDE.md

## Build & Test
- `npm run dev` — start dev server
- `npm test` — run full test suite
- `npm run build` — production build

## Code Style
- TypeScript strict mode, ES modules only
- Feature-based folder structure (not file-type-based)
- All config values in `config.ts`, never hardcoded

## Architecture
- @docs/ARCHITECTURE.md for system design
- @docs/DATABASE.md for schema decisions

## Rules
- NEVER skip tests for new features
- ALWAYS run typecheck before claiming done
- Prefer small, focused PRs over large changesets
```

### AGENTS.md — Coding Agent Discipline

AGENTS.md is guidance for AI agents working on your codebase. Where CLAUDE.md is persistent session context, AGENTS.md is behavioral contract.

**Key sections (synthesized from AlphaClaw + Paperclip patterns):**

```markdown
# AGENTS.md

## Read This First
1. README.md — what this project does
2. docs/ARCHITECTURE.md — how it's built
3. docs/SPEC.md — what we're building toward

## Core Engineering Rules
1. Keep changes targeted and production-safe
2. Update tests when behavior changes
3. Run full verification before claiming done:
   pnpm typecheck && pnpm test:run && pnpm build
4. Preserve existing behavior unless the task explicitly requires change
5. Avoid monolithic files — decompose from day one

## Definition of Done
- Behavior matches spec
- Typecheck, tests, and build pass
- Contracts synced across all layers (db/shared/server/ui)
- Docs updated when behavior or commands change
```

---

## Part 2: Workflow Orchestration

These are the cognitive modes that keep you from treating AI as one mushy generic assistant. Based on gstack's approach of explicit gears.

### The Five Gears

| Gear | Mode | When to Use |
|------|------|-------------|
| **Plan (CEO)** | Founder / product | Rethink the problem. Find the 10-star product hiding inside the request. Don't take the ticket literally — ask what the product is actually for. |
| **Plan (Eng)** | Architect / tech lead | Lock in architecture, data flow, state machines, failure modes, edge cases, and test matrices. Force diagrams — they make hand-wavy planning impossible. |
| **Review** | Paranoid staff engineer | Find bugs that pass CI but blow up in production. N+1 queries, race conditions, trust boundaries, missing indexes, broken invariants. Not style nitpicks. |
| **Ship** | Release engineer | Sync main, run tests, push, open PR. For a ready branch, not for deciding what to build. Momentum matters — don't let branches die in the last mile. |
| **QA / Browse** | QA engineer | Give the agent eyes. Navigate the app, fill forms, take screenshots, check console errors. Full QA pass in 60 seconds. |

### The Plan-First Workflow

**Always plan before building.** Enter plan mode for any non-trivial task (3+ steps or architectural decisions).

1. Describe the feature
2. Run CEO-style review → What is the real product here?
3. Run Eng-style review → Architecture, state machines, test matrices
4. Exit plan mode, implement
5. Run paranoid review → What can still break?
6. Ship → Sync, test, push, PR
7. QA → Browse the live app, verify end-to-end

### The Superpowers Development Process

Superpowers enforces a mandatory process that complements gstack's cognitive gears. Where gstack tells the agent **what kind of brain to use**, Superpowers enforces **how to use that brain** — with hard gates that prevent skipping steps.

**The mandatory sequence:**

```
1. BRAINSTORM (hard gate — NO code until design approved)
   → Explore project context
   → Ask clarifying questions one at a time
   → Propose 2-3 approaches with trade-offs
   → Present design in digestible sections
   → Get user approval on each section
   → Save design doc to docs/superpowers/specs/

2. WORKTREE (isolation)
   → Create git worktree on new branch
   → Run project setup, verify clean test baseline
   → Isolated workspace = safe experimentation

3. PLAN (for "an enthusiastic junior engineer with poor taste")
   → Break work into 2-5 minute tasks
   → Every task has: exact file paths, complete code, verification steps
   → Emphasize TDD, YAGNI, DRY
   → Save plan to docs/superpowers/plans/

4. BUILD (subagent-driven development)
   → Fresh subagent per task (never inherits session history)
   → Each subagent gets precisely crafted context
   → Two-stage review after EVERY task:
     Stage 1: Spec compliance (does it match the plan?)
     Stage 2: Code quality (is it well-written?)
   → Critical review issues BLOCK progress

5. TEST (TDD — the red/green/refactor cycle)
   → Write failing test FIRST
   → Watch it fail (if you didn't, you don't know what it tests)
   → Write minimal code to pass
   → Watch it pass
   → Refactor
   → Commit

6. VERIFY (the iron law)
   → "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"
   → Run the actual command. In this message. Not from memory.
   → Evidence before assertions, always.

7. FINISH (structured completion)
   → Verify all tests pass
   → Present options: merge / PR / keep / discard
   → Clean up worktree
```

**The hard gate on brainstorming is critical.** Every project — even a "simple" config change — gets a design pass. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short for truly simple projects, but you must present it and get approval.

### Task Management Pattern

```markdown
1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections
```

---

## Part 3: Self-Improvement Loop

This is the pattern that compounds your effectiveness over time.

1. After ANY correction from the user, update `tasks/lessons.md` with the pattern
2. Write rules that prevent the same mistake
3. Ruthlessly iterate on these lessons until mistake rate drops
4. Review lessons at session start for each relevant project

---

## Part 4: Code Quality — From Vibecoded Slop to Serious Project

These are the seven audits you should run on any vibecoded project before scaling it. Paste each prompt to your AI assistant with your full codebase attached.

### 1. Dead Code Removal
"Scan every file. Identify all unused imports, unreferenced functions, duplicate components, and orphaned files that are never imported anywhere. Output a list of every file and function to delete."

### 2. Folder Restructure
"Propose a new folder structure organized by feature, not by file type. Each feature gets its own folder containing its components, hooks, utils, and types. Show a before/after directory tree."

### 3. Hardcoded Value Extraction
"Find every hardcoded string, color hex, API URL, API key, timeout value, and magic number. Move all of them into a single config.ts file with named exports grouped by category."

### 4. Naming Standardization
"Audit all variable names, function names, and file names. Flag anything that is vague (temp, data, handler, stuff, thing, utils2). Suggest specific descriptive replacements."

### 5. Scalability Risks
"List the top 5 things that will break first when this app reaches 10,000 daily active users. For each risk, explain the failure mode and provide a specific fix with code examples."

### 6. Worst File Rewrite
"Identify the single messiest file in the entire project. Rewrite it completely with clean naming, proper error handling, inline comments explaining every decision, and TypeScript types if applicable."

### 7. Documentation
"Write a README.md that covers: what this app does, how to run it locally, the folder structure, and the environment variables needed."

---

## Part 5: Verification Before Done

Never mark a task complete without proving it works. Superpowers calls this the "Iron Law" — claiming work is complete without verification is dishonesty, not efficiency.

### The Verification Gate

```markdown
BEFORE claiming any status or expressing satisfaction:
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete — not from memory)
3. READ: Read the COMPLETE output
4. CONFIRM: Does the output actually prove the claim?
5. ONLY THEN: Make the claim
```

### The Rules

- **Evidence before assertions, always.** If you haven't run the verification command in this message, you cannot claim it passes.
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"

### Systematic Debugging (When Verification Fails)

When something breaks, do NOT guess at fixes. Follow Superpowers' systematic debugging process:

```markdown
## The Iron Law of Debugging
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.
Symptom fixes are failure.

Phase 1: OBSERVE — What exactly is happening? Reproduce it.
Phase 2: ISOLATE — What is the smallest reproduction case?
Phase 3: DIAGNOSE — What is the actual root cause? (Not the symptom.)
Phase 4: FIX — Now, and only now, fix the root cause.

If you haven't completed Phase 1, you cannot propose fixes.
```

---

## Part 6: Your Toolkit — Projects in This Folder

### AlphaClaw — Production Ops Wrapper
**What:** Wraps OpenClaw with a setup wizard, self-healing watchdog, Git-backed rollback, and browser-based observability. Deploy to Railway/Render in minutes.
**Why it matters:** Self-healing infrastructure. Crash detection, auto-repair, Telegram/Discord notifications. Your agent stays running while you sleep.
**Key patterns to steal:** Watchdog crash recovery, prompt hardening (anti-drift bootstrap prompts), Git sync for auditability.
**Repo:** `alphaclaw-main/`

### Autoresearch (Karpathy) — Autonomous AI Research
**What:** Give an AI agent a small LLM training setup, let it experiment autonomously overnight. It modifies code, trains for 5 minutes, checks results, keeps or discards, repeats.
**Why it matters:** The experiment loop pattern — autonomous iteration with keep/discard logic — applies to any optimization problem, not just ML research.
**Key patterns to steal:** The experiment loop (modify → run → measure → keep/discard → repeat), fixed time budgets for comparability, TSV result logging, "NEVER STOP" autonomous execution.
**Repo:** `autoresearch-master copy/`

### gstack — Claude Code Workflow Skills
**What:** Eight opinionated workflow skills for Claude Code. Plan review, code review, shipping, browser automation, QA testing, and retrospectives as slash commands.
**Why it matters:** Turns one generic assistant into a team of specialists. Explicit cognitive gears instead of one mushy mode.
**Key patterns to steal:** CEO review (find the 10-star product), Eng review (force diagrams), paranoid code review, one-command shipping, browser-based QA with Playwright.
**Repo:** `gstack-main/`

### Paperclip — AI Company Orchestration
**What:** Node.js server + React UI that orchestrates a team of AI agents to run a business. Org charts, budgets, governance, goal alignment, and agent coordination.
**Why it matters:** When you graduate from one agent to many, you need orchestration. Paperclip models companies — with org charts, goals, budgets, and governance.
**Key patterns to steal:** Atomic task checkout, persistent agent state across heartbeats, goal-aware execution (every task carries full "why" ancestry), budget hard-stop auto-pause, company-scoped data isolation.
**Repo:** `paperclip-master/`

### Superpowers — Complete Agent Development Workflow
**What:** A full software development workflow plugin for coding agents. 14 composable skills that trigger automatically — brainstorming, planning, TDD, subagent-driven development, systematic debugging, code review, git worktrees, and verification. Works with Claude Code, Cursor, Codex, OpenCode, and Gemini CLI.
**Why it matters:** This is the missing discipline layer. Where gstack gives you cognitive gears for different modes, Superpowers enforces a mandatory process: you cannot write code until you've brainstormed a design, gotten approval, written a plan, and set up TDD. It uses subagent-driven development — dispatching a fresh agent per task with two-stage review (spec compliance, then code quality). The "Iron Law" of verification means no completion claims without fresh evidence.
**Key patterns to steal:**

- **Mandatory brainstorming gate:** Hard-blocks implementation until design is approved. Even "simple" projects get a design pass — those are where unexamined assumptions cause the most wasted work.
- **Subagent-driven development:** Fresh subagent per task with precisely crafted context (never your session history). Two-stage review after each: spec compliance first, then code quality. Preserves your context for coordination.
- **TDD enforcement:** RED-GREEN-REFACTOR cycle. Write failing test → watch it fail → write minimal code → watch it pass → commit. If you didn't watch the test fail, you don't know if it tests the right thing.
- **Systematic debugging:** 4-phase root cause process. No fixes without root cause investigation first. Symptom fixes are failure.
- **Verification iron law:** "Claiming work is complete without verification is dishonesty, not efficiency." No completion claims without fresh verification evidence in the current message.
- **Git worktrees:** Isolated workspaces per feature branch — parallel development without switching.
- **Writing plans for "enthusiastic junior engineers with poor taste":** Plans must be detailed enough for someone with zero project context to follow. Exact file paths, complete code snippets, verification steps for every task.

**Repo:** `superpowers-main/` | Plugin: `/plugin install superpowers@claude-plugins-official`

### Playwright — Browser Automation Engine
**What:** Microsoft's framework for web testing and automation. Cross-browser (Chromium, Firefox, WebKit), auto-wait, web-first assertions, tracing.
**Why it matters:** The foundation that gstack's `/browse` and `/qa` are built on. Essential for any project that needs automated testing or browser interaction.
**Key patterns to steal:** Auto-wait (no flaky timeouts), browser contexts for full test isolation, codegen for recording tests, trace viewer for debugging failures.
**Repo:** `playwright-main/`

---

## Part 7: Essential Repos & Tools to Add

These are the repos and tools the community has validated for solo founders scaling vibecoded projects. Add them to your toolkit as needed.

### Context Engineering & Planning

| Tool | What It Does | Link |
|------|-------------|------|
| **Superpowers** | Complete dev workflow plugin: mandatory brainstorming, TDD, subagent-driven development, systematic debugging, verification gates. Works with Claude Code, Cursor, Codex, OpenCode, Gemini. Already in your folder. | github.com/obra/superpowers |
| **context-engineering-intro** | PRP (Product Requirements Prompt) framework. Transforms feature requests into validated, step-by-step implementation blueprints. The template that makes context engineering practical. | github.com/coleam00/context-engineering-intro |
| **awesome-claude-code-toolkit** | 135 agents, 35 skills, 42 commands, 150+ plugins, 19 hooks, 15 rules, 7 templates, 8 MCP configs. The most comprehensive Claude Code toolkit. | github.com/rohitg00/awesome-claude-code-toolkit |
| **awesome-claude-code** | Curated list of skills, hooks, slash-commands, agent orchestrators, and plugins. Community-maintained directory. | github.com/hesreallyhim/awesome-claude-code |
| **awesome-vibe-coding** | Master index of vibecoding tools, concepts, and playbooks. From Karpathy's definition to practical prompt engineering. | github.com/filipecalegario/awesome-vibe-coding |
| **claude-code-best-practice** | Battle-tested CLAUDE.md patterns and project rules. | github.com/shanraisshan/claude-code-best-practice |

### Agent Orchestration & Multi-Agent

| Tool | What It Does | Link |
|------|-------------|------|
| **Claude Squad** | Terminal app that manages multiple Claude Code / Codex / Aider agents in separate workspaces simultaneously. | github.com/smtg-ai/claude-squad |
| **Aider** | CLI-based coding agent. Git-aware workflow with automatic commits. The gold standard for multi-file editing in the terminal. | github.com/Aider-AI/aider |
| **Cline** | Autonomous AI coding agent for VS Code. Plans, creates files, runs builds, fixes errors. Uses MCP. | github.com/cline/cline |
| **Roo Code** | AI dev team with multiple modes (Code, Architect, Debug). Cloud agents and Slack/GitHub integration. | github.com/RooVetGit/Roo-Code |

### Production Infrastructure

| Tool | What It Does | Why You Need It |
|------|-------------|-----------------|
| **Supabase** | Postgres + Auth + Realtime + Storage + Edge Functions. The backend-as-a-service that solo founders reach for first. | Auth, database, and storage in one platform. Free tier scales to real usage. |
| **Vercel / Netlify** | Deploy frontend + serverless functions with git push. | Zero-config deployments. Preview URLs per branch. |
| **Railway / Render** | Deploy backend services, databases, cron jobs. | Docker-based deploys. AlphaClaw has one-click templates for both. |
| **Sentry** | Error tracking and performance monitoring. | You need to know when things break before your users tell you. |
| **PostHog** | Product analytics, feature flags, session replay. Open source. | Understand what users actually do. Ship features behind flags. |
| **Upstash** | Serverless Redis + Kafka + QStash (task queues). | Rate limiting, caching, background jobs without managing infrastructure. |
| **Resend** | Email API built for developers. | Transactional email that doesn't require fighting with SMTP. |
| **Stripe** | Payments, subscriptions, billing portal. | The standard for monetization. Extensive documentation. |

### Testing & Quality

| Tool | What It Does | Why You Need It |
|------|-------------|-----------------|
| **Vitest** | Vite-native test runner. Fast, ESM-first. | The testing standard for modern JS/TS projects. Both AlphaClaw and gstack use it. |
| **Playwright** | Cross-browser E2E testing. Already in your folder. | Automated QA. gstack's `/qa` and `/browse` are built on it. |
| **Biome** | Fast linter + formatter (replaces ESLint + Prettier). | One tool instead of two. Instant feedback. |
| **Knip** | Find unused files, dependencies, and exports. | Dead code audit automation (from Part 4, Audit #1). |

### MCP Servers for Solo Developers

MCP (Model Context Protocol) servers give your AI agents access to external tools and data.

| Server | What It Does |
|--------|-------------|
| **filesystem** | Read/write files on disk |
| **github** | PRs, issues, repo management |
| **postgres / sqlite** | Query databases directly |
| **brave-search** | Web search from agent context |
| **memory** | Persistent knowledge graph across sessions |
| **sequential-thinking** | Multi-step reasoning for complex problems |

---

## Part 8: The Scaling Playbook — From MVP to Solo Venture

### Phase 1: Prototype (Week 1)
- Start with CLAUDE.md + one agent
- Install Superpowers plugin — mandatory brainstorming + TDD from day one (Part 2, Part 6)
- Use plan mode for every feature
- Ship to Vercel/Railway for instant deploys
- Add Sentry from day one (you will forget otherwise)
- Set up Docker Compose for local dev (Part 21)
- Create .env.example with all required variables
- Set billing alerts on every cloud provider (Part 17)

### Phase 2: Validate (Weeks 2-4)
- Add PostHog analytics — start the feedback loop from day one (Part 20)
- Add Stripe for payments (even if free tier — the integration is the hard part)
- Add Supabase Auth (email + OAuth) — review auth code with human eyes (Part 19)
- Run the 7 code quality audits (Part 4)
- Write your first E2E tests with Playwright
- Publish privacy policy and terms of service (Part 13)
- Set up database migration workflow — never edit schema directly (Part 11)
- Set up CI/CD pipeline — no more manual deploys (Part 12)

### Phase 3: Harden (Month 2)
- Add rate limiting (Upstash Redis)
- Add background jobs with retry and dead letter queues (Part 14)
- Add feature flags (PostHog) to ship safely
- Set up observability: logs + uptime monitoring + performance budgets (Part 16)
- Run scalability audit: "What breaks at 10K DAU?"
- Add the self-improvement loop (Part 3): start tracking lessons
- Enable database backups and TEST a restore (Part 11)
- Run dependency audit and pin versions (Part 21)
- Enforce module boundary rules — prevent the spaghetti point (Part 15)

### Phase 4: Scale (Month 3+)
- Graduate to multi-agent orchestration (Paperclip or Claude Squad)
- Use Superpowers' subagent-driven development for parallel task execution with two-stage review
- Add AlphaClaw for self-healing production ops
- Automate QA with gstack's `/qa` on every deploy
- Use subagents for parallel workstreams (Part 18)
- Build hooks for automatic linting, testing, and deployment gates
- Set up the experiment loop (Autoresearch pattern) for optimization
- Monthly import graph audit — catch spaghetti before it hardens (Part 15)
- Set up progressive context loading for AI-readability at scale (Part 18)
- First monthly cost review (Part 17)
- GDPR/compliance audit if serving EU users (Part 13)

### Phase 5: Compound (Ongoing)
- Review and prune CLAUDE.md monthly
- Update lessons.md after every correction
- Run retrospectives (gstack `/retro`) weekly
- Track shipping velocity and quality over time
- Build custom skills for your most repeated workflows
- Weekly analytics review — build what users need, kill what they don't (Part 20)
- Quarterly: test backup restore, audit dependencies, review legal compliance
- Quarterly: run the spaghetti point audit on import graph
- Monthly cost review — track burn rate against revenue

---

## Part 9: Security Checklist for Vibecoded Apps

Roughly 25% of AI-generated code has a security flaw. Run this checklist before any public launch.

- [ ] All secrets in environment variables, never in code
- [ ] Input validation on every API endpoint
- [ ] SQL parameterization (no string concatenation in queries)
- [ ] Authentication on all protected routes
- [ ] Rate limiting on auth endpoints and public APIs
- [ ] CORS configured correctly (not `*` in production)
- [ ] HTTPS enforced everywhere
- [ ] Dependencies audited (`npm audit`, `pnpm audit`)
- [ ] No sensitive data in client-side code or localStorage
- [ ] Error messages don't leak internal details
- [ ] File uploads validated (type, size, content)
- [ ] CSP headers set

---

## Part 10: Core Principles

These are the non-negotiable values that keep vibecoded projects on the rails.

1. **Simplicity First.** Make every change as simple as possible. Impact minimal code.
2. **No Laziness.** Find root causes. No temporary fixes. Senior developer standards.
3. **Minimal Impact.** Changes should only touch what's necessary. Avoid introducing bugs.
4. **Demand Elegance (Balanced).** For non-trivial changes: "Is there a more elegant way?" Skip this for simple, obvious fixes — don't over-engineer.
5. **Autonomous Bug Fixing.** When given a bug report, just fix it. Point at logs, errors, failing tests — then resolve them. Zero context switching required from the user.
6. **Verification Before Done.** Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.
7. **Plan by Default.** Enter plan mode for ANY non-trivial task. If something goes sideways, STOP and re-plan immediately.

---

## Part 11: Database Operations & Disaster Recovery

This is the #1 gap that kills vibecoded projects. AI optimizes for "make it work now" — it will create tables on the fly, skip indexes, and never think about what happens when you need to change the schema after real users have real data.

### Schema Migration Workflow

Every database change must go through a migration file, never a direct schema edit.

**Tooling (pick one and commit):**

| Tool | Best For | Why |
|------|----------|-----|
| **Drizzle ORM** | TypeScript-first projects | Type-safe schema, zero-config migrations, lightweight. The vibecoding community default in 2026. |
| **Prisma** | Rapid prototyping | Declarative schema, auto-generated client, visual studio. Heavier but more guardrails. |
| **golang-migrate** | Go projects or raw SQL | Language-agnostic, SQL-based migrations. Maximum control. |
| **Supabase Migrations** | Supabase projects | Built-in, git-tracked, ties directly to your hosted database. |

**Migration rules for CLAUDE.md:**

```markdown
## Database Rules
- NEVER modify schema directly. Always create a migration file.
- EVERY migration must be reversible (include both up and down).
- NEVER delete a column in production without a 2-phase approach:
  1. Deploy code that stops reading/writing the column
  2. Deploy migration that drops the column
- Test migrations against a copy of production data before deploying.
- Name migrations descriptively: `001_add_user_email_verified_column.sql`
```

### Indexing Strategy

Add this audit prompt to your code quality audits (Part 4):

"Analyze every database query in the codebase. For each query, check whether the WHERE, JOIN, and ORDER BY columns have appropriate indexes. Flag any full table scans, missing composite indexes, or unused indexes. Output a SQL file with CREATE INDEX statements for everything that's missing."

### Backup & Restore

```markdown
## Backup Checklist
- [ ] Automated daily backups enabled (Supabase: automatic; Railway: enable manually)
- [ ] Backups stored in a DIFFERENT region than production
- [ ] Point-in-time recovery enabled (at least 7 days)
- [ ] Backup restore TESTED quarterly (schedule it — you will forget)
- [ ] Backup alerts configured: notify if a backup fails
- [ ] Database connection string stored in env vars, never in code
```

**The restore test is non-negotiable.** A backup you've never restored is not a backup — it's a hope. Every quarter: spin up a fresh database, restore from backup, run your test suite against it. If it fails, fix it immediately.

### Disaster Recovery Runbook

```markdown
## If Production Database Goes Down

1. Check provider status page (Supabase/Railway/AWS)
2. If provider outage: enable maintenance mode, wait, communicate to users
3. If data corruption:
   a. STOP all writes immediately (kill the app if needed)
   b. Identify the last known good backup
   c. Restore to a NEW database instance (never overwrite the corrupted one)
   d. Point application to new instance
   e. Verify data integrity with test suite
   f. Investigate root cause before re-enabling writes
4. Post-incident: write a postmortem, add preventive migration rules
```

---

## Part 12: CI/CD Pipeline

Manual shipping works for week one. By week three it's a liability. Every deploy should be automated, tested, and reversible.

### GitHub Actions Starter Template

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint          # Step 1: Lint
      - run: pnpm run typecheck     # Step 2: Type check
      - run: pnpm run test          # Step 3: Unit tests
      - run: pnpm run build         # Step 4: Build

  e2e:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm run test:e2e      # Step 5: E2E tests

  deploy-staging:
    needs: e2e
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      # Deploy to staging environment
      # Run smoke tests against staging
      # If smoke tests pass, promote to production

  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production    # Requires manual approval in GitHub
    steps:
      # Deploy to production
      # Run health check
      # If health check fails, auto-rollback
```

### Pipeline Rules for CLAUDE.md

```markdown
## CI/CD Rules
- NEVER merge to main without passing CI.
- NEVER skip tests with --no-verify or [skip ci].
- Every PR must include: code changes + tests + migration (if schema changed).
- Staging must mirror production (same env vars, same database version).
- Deploy to staging first. ALWAYS. No exceptions.
- If production deploy fails health check, rollback automatically.
```

### Environments

| Environment | Purpose | Database | Deploy Trigger |
|------------|---------|----------|----------------|
| **Local** | Development | SQLite or local Postgres | Manual |
| **Preview** | PR review | Ephemeral (Vercel/Netlify preview) | On PR open |
| **Staging** | Pre-production validation | Staging database (seeded copy of prod schema) | On merge to main |
| **Production** | Live users | Production database | After staging smoke tests pass |

---

## Part 13: Legal & Compliance Strategy

Using AI to write code does not reduce your legal liability. You are the data controller. You are the publisher. You are the one getting sued. This section is not optional — it's existential.

### Privacy & Data Protection

**GDPR applies to you if even ONE EU user signs up.** You don't need to be in Europe. You don't need to have a European entity. If someone in Berlin creates an account, you are subject to GDPR. Fines go up to 4% of global revenue or 20 million euros, whichever is higher.

```markdown
## Legal Checklist — Before Any Public Launch

### Privacy
- [ ] Privacy policy published and linked from signup flow
- [ ] Cookie consent banner implemented (opt-in, not opt-out, for EU)
- [ ] Data processing records documented (what data, why, how long)
- [ ] Data Subject Access Request (DSAR) process defined
  - Users can request: what data you hold, deletion, export
  - You must respond within 30 days
- [ ] Data retention policy: define how long you keep each data type
- [ ] Data deletion: ability to fully delete a user's data on request
- [ ] Sub-processor list: document every third party that touches user data
  (Supabase, Stripe, Sentry, PostHog, Resend, etc.)

### Terms & Liability
- [ ] Terms of Service published
- [ ] Limitation of liability clause included
- [ ] Warranty disclaimer (especially for AI-generated outputs)
- [ ] Acceptable use policy
- [ ] If SaaS: service level agreement (even informal uptime commitment)

### Compliance
- [ ] EU Cyber Resilience Act: understand obligations for software products
  (security-by-design, vulnerability reporting, 5-year update commitment)
- [ ] If handling payments: PCI DSS compliance (Stripe handles most of this)
- [ ] If handling health data: HIPAA considerations
- [ ] If targeting children: COPPA compliance
- [ ] Open source license audit: verify all dependencies are license-compatible
```

### AI-Specific Legal Risks

**IP and licensing:** AI models are trained on open source code. If your AI agent generates code that closely mirrors GPL-licensed code and you ship it in a proprietary product, you may have a license violation. Run license audits on generated code for critical components.

**"Vibe compliance" is not compliance.** Having your AI agent generate a privacy policy or risk assessment document does not constitute actually managing risk. The document must reflect reality. If your privacy policy says you don't share data with third parties but Sentry, PostHog, and Stripe all receive user data, that's a false statement with legal consequences.

**Practical approach for solo founders:** Use established templates as your starting point (Termly, iubenda, or a lawyer-reviewed template). Have a real lawyer review your terms and privacy policy once before launch — this typically costs $500-1500 and is worth every cent.

---

## Part 14: Resilience & Error Handling Patterns

AI-generated code almost always handles the happy path correctly and the sad path not at all. This section covers the patterns that keep your app running when things break — and things will break.

### The Three Laws of Resilient Vibecoded Apps

1. **Every external call will fail.** APIs go down, networks partition, databases timeout. Code for it.
2. **Every failure must be visible.** If something fails silently, you've just created a data integrity bug you won't discover for weeks.
3. **Every failure must be recoverable.** Users should see a degraded experience, not a white screen.

### Patterns to Enforce

**Retry with exponential backoff:**
```typescript
// Add to CLAUDE.md:
// RULE: Every HTTP call to an external service MUST use retry with
// exponential backoff. Never use bare fetch() for external APIs.

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status < 500) throw new Error(`Client error: ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
}
```

**Dead letter queue for background jobs:**
When a background job fails after all retries, it must go somewhere you can inspect it — not disappear. Use Upstash QStash's built-in DLQ, or log failed jobs to a `failed_jobs` database table with the full payload and error.

**Graceful degradation checklist:**

```markdown
## For Every Feature, Answer These Questions
- What happens if the database is slow (>2s response)?
- What happens if an external API is down?
- What happens if the user's network drops mid-request?
- What does the user see during each failure mode?
- Is there a cached/stale version we can show instead?
- Does the error message help the user or just say "Something went wrong"?
```

**Circuit breaker pattern:**
If an external service fails 5 times in 60 seconds, stop calling it for 30 seconds. This prevents cascading failures where a slow third-party service makes your entire app slow.

### Webhook Resilience (Critical for Payments)

```markdown
## Webhook Rules for CLAUDE.md
- EVERY webhook handler must be idempotent (safe to receive the same event twice).
- EVERY webhook must verify the signature before processing.
- EVERY webhook must return 200 immediately, then process async.
- Log every webhook received with timestamp, event type, and processing result.
- If processing fails, the event must be retried (Stripe retries automatically;
  for others, store and retry from your side).
```

---

## Part 15: The Spaghetti Point Defense

Research shows vibecoded projects hit a wall around month 3 where adding new features breaks existing ones and velocity drops to near zero. This is predictable, preventable, and the single biggest reason vibecoded projects fail to become real businesses.

### Why It Happens

AI agents don't maintain a mental model of your entire system. They solve the immediate problem in the most direct way possible. Over three months, this creates a web of implicit dependencies: Feature A quietly depends on the shape of Feature B's database table. Feature C's API response format is assumed by Feature D's frontend. Nobody documented these connections, and the AI certainly doesn't remember them.

### The Module Boundary Rule

Add this to CLAUDE.md for any project past the prototype phase:

```markdown
## Architecture Rules — Anti-Spaghetti
- Every feature lives in its own directory with its own types, API routes,
  and components. Features NEVER import from each other's internals.
- Cross-feature communication goes through explicitly defined interfaces:
  shared types in `shared/types/`, shared utilities in `shared/utils/`.
- If implementing Feature A requires changing Feature B's internals,
  STOP. That is a decomposition failure. Refactor the boundary first,
  then implement the feature.
- Every feature directory has a README.md explaining: what it does,
  what it depends on, and what depends on it.
- Maximum file length: 300 lines. If a file exceeds this, decompose it.
- Maximum function length: 50 lines. If a function exceeds this, extract helpers.
```

### The Interface Contract Pattern

```
src/
  features/
    auth/
      README.md          ← What this feature does and its contracts
      index.ts           ← Public API: only these exports are importable
      types.ts           ← Auth-specific types
      routes.ts          ← API routes
      components/        ← UI components
      utils/             ← Internal helpers (not exported)
    billing/
      README.md
      index.ts           ← Public API
      types.ts
      ...
  shared/
    types/               ← Types shared across features
    utils/               ← Utilities shared across features
    components/          ← UI components shared across features
```

**The rule:** If it's not in `index.ts`, it's private. Other features cannot reach into your internals.

### The Ongoing Audit

Run this monthly (add it to your calendar):

"Review the import graph of this project. Identify any circular dependencies, any feature importing from another feature's internals (not its index.ts), and any shared module that is only used by one feature (it should be moved into that feature). Output a dependency diagram and a list of violations to fix."

---

## Part 16: Observability Stack

Sentry catches errors. But you also need to understand normal system behavior so you can spot problems before they become incidents.

### The Three Pillars

| Pillar | What It Tells You | Tool |
|--------|-------------------|------|
| **Logs** | What happened, in order | Structured JSON logs → Axiom, Logtail, or Betterstack |
| **Metrics** | How much and how fast | PostHog (product) + Vercel Analytics (infra) or Checkly |
| **Traces** | Where time is spent | OpenTelemetry → Axiom or Highlight.io |

### Structured Logging Rules

```markdown
## Logging Rules for CLAUDE.md
- EVERY API endpoint must log: request method, path, status code, duration_ms.
- EVERY error must log: error message, stack trace, user_id (if available),
  request context.
- NEVER log: passwords, tokens, full credit card numbers, or PII beyond user_id.
- Use structured JSON format, not console.log strings:
  logger.info({ event: "order_created", orderId, userId, amount, duration_ms })
- Log levels: error (broken), warn (degraded), info (notable events), debug (dev only).
```

### Performance Budgets

Set these thresholds and alert when they're breached:

```markdown
## Performance Budgets
- API response time: < 200ms p95 (alert at > 500ms)
- Page load (LCP): < 2.5s (alert at > 4s)
- Time to Interactive: < 3.5s
- Database query time: < 50ms p95 (alert at > 200ms — likely missing index)
- Background job duration: < 30s (alert at > 60s)
- Error rate: < 1% of requests (alert at > 2%)
```

### Lightweight Solo Founder Stack

Don't over-engineer observability. Start with:

1. **Sentry** — errors and performance (you already have this)
2. **Axiom or Betterstack** — log aggregation with a generous free tier
3. **Checkly or UptimeRobot** — uptime monitoring with alerts
4. **PostHog** — product analytics (already recommended)

That's four tools. Each has a free tier. Combined, they give you full visibility into errors, performance, uptime, and user behavior.

---

## Part 17: Cost Management

Solo founders bleed money silently. Between AI API tokens, cloud compute, database hosting, and SaaS subscriptions, costs compound fast. The guide recommends Stripe for revenue but nothing was tracking expenditure.

### Monthly Cost Review Template

```markdown
## Monthly Cost Review — [Month]

### AI / API Costs
- Claude API: $___
- OpenAI API: $___
- Other AI services: $___
- Total AI: $___

### Infrastructure
- Hosting (Vercel/Railway/Render): $___
- Database (Supabase/Neon/PlanetScale): $___
- Storage (S3/R2/Supabase Storage): $___
- Total Infra: $___

### SaaS Tools
- Sentry: $___
- PostHog: $___
- Domain/DNS: $___
- Email (Resend): $___
- Other: $___
- Total SaaS: $___

### TOTAL MONTHLY BURN: $___
### Revenue: $___
### Runway remaining: ___
```

### Cost Guardrails

```markdown
## Cost Rules for CLAUDE.md
- Set billing alerts at 50%, 80%, and 100% of budget on EVERY cloud provider.
- AI API calls: use caching aggressively. Never call an LLM for the same
  input twice. Cache responses in Redis (Upstash) with a TTL.
- Use the cheapest model that works. Haiku for classification, Sonnet for
  generation, Opus only for complex reasoning.
- Database: monitor query count per request. If any endpoint makes > 5
  queries, it probably has an N+1 bug.
- Images/media: serve through a CDN (Cloudflare R2 or Vercel Image
  Optimization). Never serve from your application server.
- Review and cancel unused SaaS subscriptions monthly.
```

### The Free Tier Stack

You can run a real product on free tiers longer than you think:

| Service | Free Tier Limit | When You'll Outgrow It |
|---------|----------------|----------------------|
| Vercel | 100GB bandwidth/mo | ~50K monthly visitors |
| Supabase | 500MB database, 50K MAU | ~10K active users |
| Sentry | 5K errors/mo | When error volume means you have bigger problems |
| PostHog | 1M events/mo | ~5K active users with moderate tracking |
| Upstash Redis | 10K commands/day | ~1K active users with caching |
| Resend | 3K emails/mo | ~1K users with weekly emails |
| Checkly | 5 checks, 1-min interval | Sufficient for most solo projects |

---

## Part 18: Context Window Scaling

As your codebase grows past ~5,000 lines, you can't fit it all in context anymore. AI effectiveness degrades exactly when you need it most. This section prevents that.

### The Rules of AI-Readable Code

```markdown
## Context Scaling Rules for CLAUDE.md

- Every feature directory has a README.md explaining:
  what it does, its public API, its dependencies, and its data model.
- Every non-obvious function has a JSDoc comment explaining WHY, not WHAT.
- Architecture Decision Records (ADRs) live in docs/decisions/ and are
  numbered: 001-use-supabase.md, 002-feature-flag-strategy.md, etc.
- The project root has docs/ARCHITECTURE.md that is the 500-foot view:
  system diagram, data flow, key boundaries, and tech stack rationale.
- Any single file must be understandable WITHOUT reading any other file.
  If you need to read 3 files to understand 1 file, that's a decomposition failure.
```

### Progressive Context Loading

Structure your project so the AI can zoom in without loading everything:

```
CLAUDE.md                          ← 50-100 lines, project-wide rules
docs/
  ARCHITECTURE.md                  ← System-level overview + diagram
  DATABASE.md                      ← Schema decisions and migration log
  decisions/                       ← ADRs for major choices
    001-use-supabase.md
    002-auth-strategy.md
src/
  features/
    auth/
      CLAUDE.md                    ← Auth-specific rules and patterns
      README.md                    ← What auth does, its API, its deps
    billing/
      CLAUDE.md                    ← Billing-specific rules
      README.md
  shared/
    CLAUDE.md                      ← Rules for shared code
```

When working on auth, the agent loads: root CLAUDE.md → `src/features/auth/CLAUDE.md` → `src/features/auth/README.md`. It never needs to load billing code to understand auth.

### Subagent Strategy for Large Projects

```markdown
## Subagent Rules
- Use subagents for research tasks that don't need your full codebase context.
- Use subagents for parallel workstreams on different features.
- Each subagent gets: the feature README, the feature CLAUDE.md, and the shared types.
- Subagents NEVER make changes outside their assigned feature directory.
- Parent agent reviews subagent output before committing.
```

---

## Part 19: Human Review Required — The No-Vibecode List

Some code paths should never be AI-generated without expert review. 45% of AI-generated code contains security vulnerabilities. For high-risk code, that's an unacceptable gamble.

### Always Require Human Review

```markdown
## CRITICAL: Human Review Required
These code paths must ALWAYS be reviewed by a human before deployment:

### Authentication & Authorization
- Login/signup flows
- Password hashing and storage
- Session management and token generation
- Role-based access control (RBAC) logic
- OAuth implementation
- Password reset flows

### Financial & Payment
- Payment processing logic
- Subscription management
- Refund handling
- Invoice calculation
- Tax computation
- Any code that moves money

### Data Security
- Encryption/decryption implementations
- PII handling and storage
- Data export/deletion (DSAR compliance)
- API key generation and management
- Rate limiting implementation

### Infrastructure Security
- Environment variable handling
- CORS configuration
- CSP headers
- Database connection management
- File upload validation
- Input sanitization

### Business Logic
- Pricing calculation
- Entitlement/feature gating
- Usage metering and limits
- Any calculation users pay based on
```

### The Review Prompt

Before deploying any code in the above categories, paste it with this prompt:

"You are a senior security engineer. Review this code for: injection vulnerabilities (SQL, XSS, command), authentication bypasses, authorization flaws, data exposure risks, race conditions, cryptographic weaknesses, and any OWASP Top 10 violations. Be paranoid. Assume an attacker will find every flaw."

---

## Part 20: User Feedback & Analytics Loop

Building the wrong thing is the most expensive mistake a solo founder can make. Without a systematic feedback loop, you're guessing — and guessing doesn't scale.

### The Feedback Stack

| Layer | What It Tells You | Tool |
|-------|-------------------|------|
| **Quantitative** | What users DO | PostHog: page views, feature usage, funnels, retention |
| **Qualitative** | What users SAY | In-app feedback widget (Canny, or build a simple one) |
| **Behavioral** | What users STRUGGLE with | PostHog Session Replay: watch real users hit real friction |
| **Churn** | What users LEAVE over | Exit survey on cancellation + cohort analysis |

### Weekly Analytics Review

Run this every Monday before planning the week's work:

```markdown
## Weekly Analytics Review Template

1. Acquisition: How many new signups? What channels? What's the trend?
2. Activation: What % completed onboarding? Where do they drop off?
3. Engagement: Which features are used most? Which are dead?
4. Retention: What's 7-day retention? 30-day? Getting better or worse?
5. Revenue: MRR trend? Churn rate? Average revenue per user?
6. Feedback: Top 3 user complaints this week? Top 3 feature requests?
7. Bugs: Open bug count trend? P1 bugs unresolved > 48 hours?

→ Based on the above, what are the 3 highest-impact things to build this week?
```

### Feature Usage Tracking Pattern

```typescript
// Track every meaningful user action. Not page views — actions.
// "User clicked the export button" > "User viewed the dashboard"

analytics.capture('report_exported', {
  format: 'pdf',
  row_count: data.length,
  time_to_export_ms: duration,
  user_plan: user.plan    // Know if free or paid users use features differently
});
```

### The Kill Criteria

If a feature has been live for 30 days and less than 5% of active users have used it, it's a candidate for removal. Dead features add complexity, increase surface area for bugs, and slow down AI agents who have to understand code nobody uses.

---

## Part 21: Dependency Hygiene & Environment Reproducibility

### Dependency Rules

AI agents love adding npm packages. Every package is a supply chain attack vector, a potential vulnerability, and a future maintenance burden.

```markdown
## Dependency Rules for CLAUDE.md
- Before adding ANY dependency, check:
  1. Can the standard library or an existing dependency handle this?
  2. How many weekly downloads? (< 10K = risky)
  3. When was it last updated? (> 6 months = risky)
  4. How many open issues? How many maintainers?
  5. What license? (GPL in a proprietary project = legal risk)
- NEVER add a dependency for something achievable in < 20 lines of code.
- Run `npm audit` / `pnpm audit` after every install.
- Pin exact versions in package.json (no ^ or ~) for production apps.
- Review the dependency tree quarterly: remove anything unused.
- NEVER install packages from URLs, GitHub refs, or tarballs in production.
```

### Lockfile Discipline

```markdown
- package-lock.json / pnpm-lock.yaml MUST be committed to git.
- CI must use `--frozen-lockfile` (pnpm) or `ci` (npm). NEVER `install`.
- If the lockfile changes unexpectedly, investigate before committing.
```

### Environment Reproducibility with Docker

```dockerfile
# Dockerfile — production
FROM node:20-slim AS base
WORKDIR /app

# Install dependencies in a separate layer for caching
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy source and build
COPY . .
RUN pnpm build

# Run
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml — local development
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    env_file: .env.local
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**The rule:** If someone clones your repo and runs `docker compose up`, the entire app should be running within 60 seconds. If it doesn't, your onboarding is broken — for humans and for AI agents.

### .env Management

```markdown
## Environment Variable Rules
- .env files are NEVER committed to git. .env.example IS committed.
- .env.example contains every variable with placeholder values and comments.
- Every env var has a validation check at app startup: if missing, crash immediately
  with a clear error message naming the missing variable.
- Secrets are stored in the hosting provider's secret manager, not in .env files
  on production machines.
```

---

## Quick Reference: Session Start Checklist

```
1. Read CLAUDE.md (auto-loaded)
2. Read AGENTS.md if it exists
3. Read tasks/lessons.md for accumulated wisdom
4. Check tasks/todo.md for current state
5. Enter plan mode for new features
6. Start building
```

---

*Built from: AlphaClaw, Autoresearch, gstack, Superpowers, Paperclip, Playwright, and the collective wisdom of the vibecoding community. V3 — expanded with Superpowers' mandatory brainstorming, TDD, subagent-driven development, and verification iron law; plus database ops, CI/CD, legal compliance, resilience patterns, spaghetti point defense, observability, cost management, context scaling, human review gates, user feedback loops, and dependency hygiene. Last updated March 2026.*
