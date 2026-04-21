# System Architecture

## Overview
Compasser is built as a serverless web and mobile application utilizing Vanilla JS and Capacitor. It fully adopts Domain-Driven Design (DDD).

## Domain Structure
1. `auth/`: Firebase Google/Email Auth, Profile management.
2. `planner/`: Uses Preference Flow + Gemini 2.5 Flash Lite API to generate itineraries.
3. `itinerary/`: Renders timeline UI and AI generated `top3Recommendations`.
4. `profile/`: Account settings, saved trips, and identity verification.
5. `map/`: Google Maps JS API for viewing, deep linking for Navigation.

## Flow & Integration Layer
`User -> Vite App (Web/PWA/Capacitor) -> Firebase Auth -> Firestore Database`
`Planner UI -> Gemini 2.5 -> JSON Output (Anchor/Transit/Generated) -> Itinerary UI -> Map View`
