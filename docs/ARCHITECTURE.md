# System Architecture

## Overview
ComPasser is built as a serverless web and mobile application utilizing Vanilla JS and Capacitor. It fully adopts Domain-Driven Design (DDD).

## Domain Structure
1. `auth/`: Firebase Google/Email Auth, Profile management.
2. `planner/`: Normalizes form constraints, uses Gemini 2.5 Flash Lite to generate itineraries, and deterministically enforces route boundaries and anchors.
3. `itinerary/`: Renders timeline UI and AI generated `top3Recommendations`.
4. `profile/`: Account settings, saved trips, and identity verification.
5. `map/`: Google Maps JS API for viewing, deep linking for Navigation.

## Flow & Integration Layer
`User -> Vite App (Web/PWA/Capacitor) -> Firebase Auth -> Firestore Database`
`Planner UI -> plannerRequest normalization -> dailyData -> Gemini 2.5 -> deterministic constraint enforcement -> Itinerary UI -> Map View`

### Planner constraint boundary

- `travel-form.js` owns input collection and emits the flat, save-compatible `plannerRequest`.
- `planner-constraints.mjs` converts flat and legacy request shapes into canonical per-day `dailyData`.
- `gemini-optimizer.js` builds the prompt only from canonical constraints.
- Gemini output is untrusted for hard constraints: departure, destination, times, and anchors are reconciled before rendering or persistence.
