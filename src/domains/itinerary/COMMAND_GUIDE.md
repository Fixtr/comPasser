# Itinerary Domain COMMAND GUIDE

## Naming Conventions
- **ScheduleItem**: Represents an individual event or activity in the itinerary (replaces 'event').
- **AnchorSchedule**: A fixed, mandatory schedule item that acts as a pivot for the rest of the plan.
- **TransitRoute**: Represents the route and transportation details between two `ScheduleItem`s.
- **ItineraryPlan**: The complete travel plan containing multiple days and `ScheduleItem`s.

## UI Rendering Principles
- All itinerary-specific UI logic (like timeline rendering) must be encapsulated within `src/domains/itinerary/ui/`.
- The `itinerary-view.js` component is responsible for orchestrating the timeline.
- CSS classes should use the ubiquitous language (e.g., `schedule-card` instead of `event-card`).
- The component receives an `ItineraryPlan` and renders the list of `ScheduleItem`s, intertwining them with `TransitRoute` events.
- All map requests go through `requestMapRoute()` with an itinerary version, day index, and request ID. Only results matching the active request may update the timeline or saved itinerary data. Showing a new itinerary, changing days, or editing stops starts a new request; leaving the screen invalidates it.

## Local State and Persistence

- `services/itinerary-state.mjs` owns the latest plan, source (draft/private/shared), and selected day. Change schedule items and resolved places through its methods rather than assigning into `currentItinerary` from UI code.
- The in-memory state is authoritative. `sessionStorage` is a per-tab recovery copy, tagged with the authenticated owner. It is not a Firestore save, and is cleared for personal data on logout/account changes.
- Restore an existing entry without rerunning planner constraints: doing so would undo edits and measured transit times. Apply constraints only when opening newly generated or remotely fetched data.
- Shared copies stay read-only and are not written to local personal recovery storage. Saving creates a private snapshot; it never updates the shared source.
- The router calls `restoreDraft()` or `loadItineraryById()` and does not parse itinerary JSON or maintain a separate loaded-document cache. Duplicate pending loads are coalesced by the itinerary view.
- Successful profile deletion emits `itinerary-deleted` with `{ id, userId }` (`id: null` for all private documents), removing the same owner's local recovery copy too.
