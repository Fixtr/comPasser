# Architecture Decision Record (ADR)

## Context
We need to select an AI Model, an Authentication Provider, a Frontend Framework Strategy, and a Mobile Packaging solution for ComPasser.

## Decision 1: AI Model - Gemini 2.5 Flash Lite
**Status:** Accepted
**Trade-offs (Given up / Gained):**
- **Given Up:** Complex long-chain reasoning capabilities, advanced logic structuring typically found in Pro/Ultra models.
- **Gained:** Blazing fast latency (crucial for interactive apps), ultra-low API cost, and sufficient instruction-following suitable for stable JSON outputs (`top3Recommendations`), matching our serverless and MVP philosophy perfectly.

## Decision 2: Authentication - Google Auth & Email via Firebase
**Status:** Accepted
**Trade-offs:**
- **Given Up:** Total ownership of the authentication database scheme and complex custom auth pipelines.
- **Gained:** Single Sign-On (SSO) drastically lowering user entry barriers and eliminating custom backend server maintenance.

## Decision 3: Framework Strategy - Vanilla JS + Vite
**Status:** Superseded in part (2026-10-07, `78d140b`): the app shell is now Ionic React for dev, web and Capacitor. Domain UIs remain framework-free Web Components, so this decision still holds inside `src/domains/`.
**Trade-offs:**
- **Given Up:** React/Vue's built-in state management algorithms and vast ecosystem of drop-in components.
- **Gained:** Zero framework runtime overhead (max performance) and direct DOM manipulation stability, directly benefiting the "Hybrid Map Strategy."

## Decision 4: Mobile Packaging - Capacitor
**Status:** Accepted
**Trade-offs:**
- **Given Up:** True native UX fluidity in highly complex animations compared to Swift/Kotlin native.
- **Gained:** A single codebase for Web, iOS, and Android without writing cross-platform framework codes like Flutter/React Native.

## Decision 5: Deterministic Enforcement for AI Hard Constraints
**Status:** Accepted (2026-06-28)
**Context:** Prompt instructions alone did not guarantee that Gemini preserved the selected departure, destination, boundary times, or anchor schedules. The form and optimizer also used incompatible flat/per-day request shapes.
**Decision:** Normalize all planner requests into canonical `dailyData` before prompt creation, then reconcile Gemini output with the original user constraints before rendering, mapping, or persistence.
**Trade-offs:**
- **Given Up:** Treating the model response as an immediately renderable source of truth.
- **Gained:** Stable route endpoints, exact anchor preservation, backward-compatible request handling, and testable behavior independent of model variance.
