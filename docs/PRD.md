# Product Requirements Document (PRD)

> 📌 **요약본(English)** · 스코프 크리프 방지용 Non-Goals 기준 문서입니다. 사람이 읽는 상세 기획은 [`../PRD.md`](../PRD.md) 를 보세요.

## Project: ComPasser
**Target User:** Anyone traveling in South Korea (locals and foreigners).
**Core Value Proposition:** Fill empty time slots around fixed schedules ('Anchor Events') with optimal travel routes.

## Scope (MVP)
- **Included:** 
  - Google Auth & Email Auth via Firebase.
  - Anchor-based itinerary generation using Gemini 2.5 Flash Lite.
  - Exact preservation of user-selected departure, destination, day boundary times, and Anchor schedules through deterministic validation.
  - Hybrid Map Strategy (Google Maps as Viewer, Local Deep Linking (Naver/Kakao) for Navigation).
  - Multi-language (i18n) support (ko/en).
  - User Preference Flow (Theme, Budget).
  - PWA & Capacitor support for native mobile apps (iOS/Android).
  - Serverless architecture leveraging Firebase (Firestore/Auth).

## 🚫 Non-Goals (Strictly Excluded to prevent Scope Creep)
- **NO Custom Payment Infrastructure:** Absolutely no PG integrations beyond simple affiliate redirect linking.
- **NO Social Network Features:** No user-to-user following, social feeds, or in-app messaging.
- **NO Heavy Full-Stack Frameworks:** Avoid heavy SSR frameworks (e.g., Next.js). Vanilla Web Components core with a lightweight Ionic React mobile distribution shell.
- **NO Real-time Collaborative Editing:** Itinerary sharing is read-only for guests.
- **NO Server-side Rendering (SSR):** Architecture remains 100% Client-Side Rendered (CSR) + Firebase.
