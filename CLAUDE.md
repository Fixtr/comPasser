# System Rules for ComPasser Harness

CRITICAL: DATA INTEGRITY
You must strictly adhere to `docs/Schema.md`. The 'Anchor Event' structure (including `isFixed`) and AI generative schema (`top3Recommendations`, `localTip`) must never be arbitrarily modified.

CRITICAL: INFRASTRUCTURE & ARCHITECTURE
- Maintain lightweight Vanilla JS + Vite + Firebase environment.
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
