# Product Requirements Document (PRD)

## Project: ComPasser
**Target User:** Anyone traveling in South Korea (locals and foreigners).
**Core Value Proposition:** Fill empty time slots around fixed schedules ('Anchor Events') with optimal travel routes.

## Scope (MVP)
- **Included:** 
  - Google Auth & Email Auth via Firebase.
  - Anchor-based itinerary generation using Gemini 2.5 Flash Lite.
  - Hybrid Map Strategy (Google Maps as Viewer, Local Deep Linking (Naver/Kakao) for Navigation).
  - Multi-language (i18n) support (ko/en).
  - User Preference Flow (Theme, Budget).
  - PWA & Capacitor support for native mobile apps (iOS/Android).
  - Serverless architecture leveraging Firebase (Firestore/Auth).

## 🚫 Non-Goals (Strictly Excluded to prevent Scope Creep)
- **NO Custom Payment Infrastructure:** Absolutely no PG integrations beyond simple affiliate redirect linking.
- **NO Social Network Features:** No user-to-user following, social feeds, or in-app messaging.
- **NO Custom UI Frameworks:** Avoid heavy frameworks. Standard Web Components and Vanilla CSS only.
- **NO Real-time Collaborative Editing:** Itinerary sharing is read-only for guests.
- **NO Server-side Rendering (SSR):** Architecture remains 100% Client-Side Rendered (CSR) + Firebase.
