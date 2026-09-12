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

## Save and Link Sharing

- `services/itinerary-actions.mjs` owns save/share eligibility, snapshots, private-copy activation, public confirmation sequencing, and existing-share reuse. It uses the same state instance; no second cache or current-plan copy is kept.
- Inject persistence/auth/URL dependencies at the view's composition boundary. Keep DOM, translated confirmations/toasts, and navigation out of the service.
- Saving checks the current account and state revision after the write. Only an unchanged context activates the saved copy and invokes the synchronous `onSaved` UI callback; older snapshots may be saved but must not overwrite the current screen.
- Public sharing requires confirmation before creating a shared copy. After confirmation, verify that the same account and plan are still active, then snapshot the latest edits. Re-sharing an existing shared copy requires neither confirmation nor a new write.
- `ui/itinerary-share-delivery.js` only delivers a prepared URL to the clipboard or Kakao. Keep SDK loading lazy and propagate errors so the view can restore its buttons and show an error.

## Image Export

- `ui/itinerary-image-export.js` owns the temporary ticket DOM, light-theme capture, native share/download fallback, and cleanup. It takes a state snapshot's plan and selected day plus language/labels; it does not read the active view or mutate itinerary state.
- `itinerary-view.js` only supplies the snapshot and handles button state and result/error messages. Cancellation is a separate result: it must not start a download or announce a successful share.
- Export labels and messages must exist in both translation dictionaries; `t(key)` returns the key when missing, so `t(key) || fallback` does not protect the UI. Snapshot ticket language/labels at export start. Keep the button's `data-i18n` synchronized with its busy/idle state, and translate completion messages in the currently selected language.
- Keep the capture engine lazy-loaded. Apply the light palette only to the capture engine's cloned document via `onclone`; never modify or restore the live page's theme attributes/classes. Navigation and user theme changes must remain authoritative throughout capture, encoding, and sharing.
- Remove the temporary ticket immediately after capture, before encoding or waiting for the share sheet. Always release download object URLs, including failures. Concurrent exports must own only their own temporary DOM and URLs.
