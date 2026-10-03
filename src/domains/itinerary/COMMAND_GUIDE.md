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
- `place-replacement.js` reuses the planner's Google selection binding. Replacement requires a complete selected-place JSON identity; free text is not accepted. Async selection cannot commit into a detached form or a changed plan/day/item. Shared plans and fixed boundaries/anchors cannot use this replacement control.
- `replaceSchedulePlace()` preserves the visit slot and clears old venue-specific claims. Store the selected ID, canonical name/address and coordinates, then refresh routes. This is not an opening-hours or cost verification.

## Local State and Persistence

- Automatic fitting of an editable generated draft may remove a generated optional visit when Places returns no usable candidate or measured travel cannot meet a fixed/arrival deadline with minimum stay. It preserves user-added stops and fixed appointments. Every removal triggers a fresh map request; at most four automatic rechecks are allowed. Service errors/timeouts leave the visit unresolved and warn instead of deleting it. Impossible fixed-to-fixed travel remains a warning.

- Visit-time editing is limited to ordinary private/draft stops and same-day intervals inside surrounding fixed boundaries. Preserve venue identities; store `visitNotBefore` as the earliest permitted visit start. Recalculation must respect this lower bound, even when fitting shorter stays before an anchor. The entered end describes the requested stay, not a new fixed appointment. Unknown or impossible routes still warn; never silently advance the visit before `visitNotBefore`. Editor submission rejects changed plans/days/requests/items. Saved/shared loads retain the field without automatic rescheduling.

- `itinerary-route-order.mjs` suggests bounded 2-opt reorderings only between fixed departure/anchor/arrival boundaries, using complete selected identities or the active map request's resolved coordinates. Missing/invalid locations or times skip the whole block. Preview straight-line distance only (not transit savings), require confirmation and recheck plan/day/request/content before applying. Never delete stops or cross anchors. The initial proposal preserves each visit's duration and the block's time envelope; the explicit map recalculation may fit ordinary stays under existing rules. Shared plans cannot apply proposals. No automatic application on load or save.

- Opening-hours warnings use a Place ID and live Google current periods for trips within seven Korean calendar days, then regular periods, never AI `practicalInfo.operatingHours`. Check the complete visit including breaks, overnight periods and week boundaries. Korean local dates require a +540 minute place offset; missing/invalid data stays unknown. Regular hours are not confirmation of holidays or last orders. Lookups are coalesced in memory for five minutes with an eight-second timeout; no hours or warnings are persisted and times are never changed. Reject detached/outdated view responses. Legacy entries without a complete identity need a place selection before hours can be checked.

- `services/itinerary-state.mjs` owns the latest plan, source (draft/private/shared), and selected day. Change schedule items and resolved places through its methods rather than assigning into `currentItinerary` from UI code.
- The in-memory state is authoritative. `sessionStorage` is a per-tab recovery copy, tagged with the authenticated owner. It is not a Firestore save, and is cleared for personal data on logout/account changes.
- Restore or remotely load an existing private/shared entry without rerunning planner constraints: doing so would undo edits and measured transit times. Apply constraints only to newly generated drafts.
- Loading a saved/shared snapshot refreshes routes, cost and projected conflict warnings without changing stored times. Private snapshots may be rescheduled only by an explicit schedule edit or the recalculate-times button; shared snapshots never expose that button.
- Explicit recalculation uses the active day's user-requested start time for the departure boundary. If absent or invalid, legacy preparation ranges use their end time, then fall back to the existing departure point time. Never borrow preparation time to make a fixed appointment appear feasible. Loading snapshots alone still leaves their times untouched.
- Eligible map responses adjust the current day directly, without rerunning planner normalization. `itinerary-end-fit.mjs` may shorten ordinary visits (restaurant meals minimum 60 minutes; cafes/other visits minimum 20; never delete) when every adjacent travel duration within that block is known. Share `minimumStayMinutes` with explicit manual trimming. Fit each interval between departure, fixed anchors and the requested day end independently; anchors never move. Unknown or infeasible blocks retain honest times and warnings without preventing other blocks from fitting. Departure/arrival boundaries are point events, not visits with inherited AI stay durations.
- Automatically fitted private/draft days request fresh transport for the changed departure times, at most twice per explicit map request. Shared plans are not auto-trimmed. Stop processing the old response after requesting a new one. User edits/day switches reset this budget; automatic rechecks do not.
- Shared copies stay read-only and are not written to local personal recovery storage. Saving creates a private snapshot; it never updates the shared source.
- The router calls `restoreDraft()` or `loadItineraryById()` and does not parse itinerary JSON or maintain a separate loaded-document cache. Duplicate pending loads are coalesced by the itinerary view.
- Successful profile deletion emits `itinerary-deleted` with `{ id, userId }` (`id: null` for all private documents), removing the same owner's local recovery copy too.

## Save and Link Sharing

- `services/itinerary-actions.mjs` owns save/share eligibility, snapshots, private-copy activation, public confirmation sequencing, and existing-share reuse. It uses the same state instance; no second cache or current-plan copy is kept.
- Inject persistence/auth/URL dependencies at the view's composition boundary. Keep DOM, translated confirmations/toasts, and navigation out of the service.
- Saving checks the current account and state revision after the write. Only an unchanged context activates the saved copy and invokes the synchronous `onSaved` UI callback; older snapshots may be saved but must not overwrite the current screen.
- Public sharing requires confirmation before creating a shared copy. After confirmation, verify that the same account and plan are still active, then snapshot the latest edits. Re-sharing an existing shared copy requires neither confirmation nor a new write.
- New sharing requires a saved private source. Atomically create an immutable `shared_itineraries` snapshot with `sourceId`/`ownerId` and a content-free `shared_itinerary_status` receipt. Security rules deny snapshot reads when that source no longer exists with the same owner; only then may clients read the receipt. Never label network/permission errors as deletion without the server receipt.
- Shared loads always read the server, not persistent or in-memory cached content. While open, recheck server access every 15 seconds (8-second request deadline), without overlapping requests; focus/offline events also recheck. Do not rely on shared-document listeners to detect private-source deletion. Clear dates, places, map and actions before displaying a deletion/error state. Cancel checks and ignore late responses when leaving. Independent recipient copies remain private and unaffected. Legacy unlinked snapshots cannot be safely mapped to their source and remain compatible.
- `ui/itinerary-share-delivery.js` only delivers a prepared URL to the clipboard or Kakao. Keep SDK loading lazy and propagate errors so the view can restore its buttons and show an error.

## Image Export

- `ui/itinerary-image-export.js` owns the temporary ticket DOM, light-theme capture, native share/download fallback, and cleanup. It takes a state snapshot's plan and selected day plus language/labels; it does not read the active view or mutate itinerary state.
- `itinerary-view.js` only supplies the snapshot and handles button state and result/error messages. Cancellation is a separate result: it must not start a download or announce a successful share.
- Export labels and messages must exist in both translation dictionaries; `t(key)` returns the key when missing, so `t(key) || fallback` does not protect the UI. Snapshot ticket language/labels at export start. Keep the button's `data-i18n` synchronized with its busy/idle state, and translate completion messages in the currently selected language.
- Keep the capture engine lazy-loaded. Apply the light palette only to the capture engine's cloned document via `onclone`; never modify or restore the live page's theme attributes/classes. Navigation and user theme changes must remain authoritative throughout capture, encoding, and sharing.
- Remove the temporary ticket immediately after capture, before encoding or waiting for the share sheet. Always release download object URLs, including failures. Concurrent exports must own only their own temporary DOM and URLs.
