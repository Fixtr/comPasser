# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# System Rules for ComPasser Harness

CRITICAL: DATA INTEGRITY
You must strictly adhere to `docs/Schema.md`. The 'Anchor Event' structure (including `isFixed`) and AI generative schema (`top3Recommendations`, `localTip`) must never be arbitrarily modified.

CRITICAL: INFRASTRUCTURE & ARCHITECTURE
- Maintain the lightweight Vite + Firebase environment: the app shell is Ionic React (`src/prototype/`), and domain UI stays framework-free Web Components. Do not add another UI framework.
- Any mobile-specific adjustments must ensure Capacitor (iOS/Android) compatibility.
- Ensure DDD separation (`auth`, `planner`, `itinerary`, `profile`, `map`).
- Maintain modern web standards (Web Components, ES Modules) when creating new UI assets.

CRITICAL: BLUEPRINT WORKFLOW & TDD
- Always reference and update `blueprint.md` in the root directory before and after executing tasks.
- Test-Driven Development is MANDATORY. Ensure tests run successfully prior to completing increments.

CRITICAL: CIRCUIT BREAKER
If repeating an error 3 times, PAUSE and output: "[현재까지의 로그, 에러 원인 분석, 해결을 위한 선택지 2가지]" to the terminal to request Human-In-The-Loop.

CRITICAL: PONYTAIL SKILL
Before writing, editing, refactoring, reviewing, or designing any code, load the `ponytail` skill (`.claude/skills/ponytail/SKILL.md`) and follow it for the rest of the session. Default level is `full` unless the user sets another.

CRITICAL: RESPONSE STYLE (ATTENTION-KIND)
At the start of every session, read `.claude/skills/attention-kind/SKILL.md` and use that style for every reply. It changes how you write replies, not how you write code.

CRITICAL: ANTI-SLOP LINT
After changing JavaScript in `src/`, `functions/`, `scripts/`, or `test/`, run `npm run lint` and fix every error it reports in the files you changed, including `anti-slop/*` rules. Do not disable rules, add ignores, or edit `.oxlintrc.json` to get a clean run without asking the user.

# Commands

Node.js 24; Java JDK 21+ is needed for emulator tests. Install with `npm ci && npm ci --prefix functions`.

- `npm run dev` / `npm run build`: Vite dev server / production bundle in `dist/` (both use the Ionic shell).
- `npm run lint`: Oxlint + vendored anti-slop rules (`tools/oxlint/anti-slop/`).
- `npm test`: Node built-in runner over `test/*.test.mjs`. Single file: `node --test test/anchor-validation.test.mjs`; single case: add `--test-name-pattern "<name>"`.
- `npm run test:browser`: Playwright smoke scenarios on the Ionic shell (`test/browser/smoke.spec.mjs`, port 4183; `SMOKE_PORT=<port>` runs another copy alongside). Filter with `-- --grep "planner"`. First run needs `npm run test:browser:install`.
- `npm run test:ionic` / `npm run test:ionic:pwa`: real Ionic screens (port 4184) / PWA offline (port 4185). The PWA run overwrites `dist/` with a test build, so rebuild before deploying.
- `npm run test:emulator`: Firebase Auth/Firestore emulator tests and security rules (`test/emulator/`, project `demo-hackerton-deletion`).
- `npm run check`: lint, unit tests, build, all three browser suites, and emulator tests in sequence. Run before requesting review.

Test servers ignore `.env` and stub every external boundary (auth, AI, DB, maps); see `docs/TESTING.md`. New browser callbacks must be registered in `test/browser/smoke.spec.mjs`.

# Architecture

- **Shell**: `ionic-shell.html` + `src/prototype/ionic-shell.jsx` is the single entry for dev, web (Cloudflare Pages) and Capacitor. It is an Ionic React shell that mounts the domain Web Components. `vite.config.js` renames the built shell to `index.html` and bundles `src/server/public-routes-worker.mjs` (SSR for `/en/routes`, sitemap, robots).
- **Domains**: `src/domains/{auth,planner,itinerary,map,profile}/` each split into `services/` (logic, mostly `.mjs` so Node tests can import them) and `ui/` (custom elements). Read the domain's `COMMAND_GUIDE.md` before changing its behavior.
- **Generation pipeline**: the planner form emits a flat `plannerRequest` → `planner/services/planner-constraints.mjs` normalizes it into per-day `dailyData` → the `generateItinerary` callable in `functions/index.js` sanitizes input and builds the prompt (`functions/itinerary-prompt.js`) → Gemini → the client treats output as untrusted and deterministically reconciles start/end points, times and fixed anchors before rendering or saving.
- **Secrets**: the Gemini key exists only in Firebase Secret Manager. Vite `envPrefix` is `VITE_`; the client sends structured constraints, never a prompt.
- **Data**: personal trips live in `itineraries` (owner-only rules); share links create a separate copy in `shared_itineraries` read via `/share/:id`. Rules are in `firestore.rules`.
- **Styling**: flat `--cp-*` hex tokens in `src/styles/tokens.css`. `oklch`, `color-mix`, `box-shadow` and gradients are banned by contract tests because they break `html2canvas` image export.
- **Transitions**: all Ionic routes animate through `src/prototype/screen-transition.js` (`IonRouterOutlet animated={false}`); in-page steps use `useStageTransition` (same file) or `animateScreen` from `src/ui/screen-motion.js`. Never add per-page route animations. Full policy in `AGENTS.md`.
- **i18n**: ko/en strings go through `src/utils/i18n.js`.

# Conventions

- Commits use `feat:` / `fix:` / `refactor:` / `docs:` prefixes with an imperative summary.
- `main` pushes deploy to Cloudflare Pages via `.github/workflows/checks.yml` only after all checks pass. Functions deploy separately with `npm run deploy:functions`.
