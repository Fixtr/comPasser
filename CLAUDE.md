# System Rules for ComPasser Harness

CRITICAL: DATA INTEGRITY
You must strictly adhere to `docs/Schema.md`. The 'Anchor Event' structure (including `isFixed`) and AI generative schema (`top3Recommendations`, `localTip`) must never be arbitrarily modified.

CRITICAL: INFRASTRUCTURE & ARCHITECTURE
- Maintain lightweight Vanilla JS + Vite + Firebase environment.
- Any mobile-specific adjustments must ensure Capacitor (iOS/Android) compatibility.
- Ensure DDD separation (`auth`, `planner`, `itinerary`, `profile`, `map`).
- Always adhere to the global `GEMINI.md` guidelines (Web Components, Baseline CSS, ES Modules) when creating new UI assets.

CRITICAL: BLUEPRINT WORKFLOW & TDD
- Always reference and update `blueprint.md` in the root directory before and after executing tasks.
- Test-Driven Development is MANDATORY. Ensure tests run successfully prior to completing increments.

CRITICAL: VERSION CONTROL & CIRCUIT BREAKER
Commit to Git after every successful task increment. 
If repeating an error 3 times, PAUSE and output: "[현재까지의 로그, 에러 원인 분석, 해결을 위한 선택지 2가지]" to the terminal to request Human-In-The-Loop.
