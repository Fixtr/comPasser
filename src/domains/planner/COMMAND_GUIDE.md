# Planner Domain COMMAND GUIDE

## Naming Conventions & Rules
- **plannerRequest**: The object containing user-input requirements, matching the ubiquitous language (e.g., date, startTime, anchorSchedules).
- **dailyData**: The canonical per-day constraint array derived from `plannerRequest`; each item contains day/date, start/end time, start/end location, and anchors.
- **normalizePlannerRequest**: Converts current flat form data and legacy per-day data into the canonical `dailyData` contract.
- **enforcePlannerConstraints**: Reconciles probabilistic AI output with authoritative user constraints before rendering or saving.
- **generateOptimizedItinerary**: The core function that communicates with the Gemini AI. 

## Architectural Principles
- **AI Prompts**: Prompt/schema construction lives in `functions/itinerary-prompt.js` after the server migration; never ship it or the AI key to the browser. `gemini-optimizer.js` sends constraints and removes model-asserted place identities before constraint enforcement.
- **Hard Constraints**: Departure, destination, day boundary times, and anchors MUST NOT rely solely on prompt compliance. Keep deterministic normalization/enforcement in `planner-constraints.mjs`.
- **Generation contract**: The model emits optional visits only (`attraction`, `dining`, `leisure`), including an empty item array when no visit fits. Keep every requested day/date. The app inserts fixed stops; existing saved payloads are unchanged. Per-day allowed search-center names come from the sanitized user locations, and budget never changes the app's public-transit routing.
- New multi-day results add at most one provisional attraction to a day with a gap of at least three hours. Places verification and measured routing may still remove it; saved/shared snapshots are unchanged.
- **Form UI**: The `travel-form.js` component ONLY collects data, handles debounce/loading states, and dispatches the customized data via an Event Bus or custom events.
- **Error Handling**: 429 Too Many Requests or other AI API errors are caught and thrown in `gemini-optimizer.js` and properly surfaced to the user in the main app lifecycle.
- **Tests**: Any planner contract change MUST update `test/planner-constraints.test.mjs` and pass `npm test` plus `npm run build`.

## Input Draft

- `services/planner-draft.mjs` owns the editable flat input shared by preference selection, form restoration, and editing a saved itinerary. `currentFormData` is its per-tab recovery copy; `userPreference` is only a compatibility projection for route guards.
- Editing a saved itinerary replaces the whole input draft before navigation. Displayed dates, preference badges, anchor day options, daily-time inputs, and submitted data must use that same draft. `travel-form-data.js` receives it explicitly and must not reread session storage.
- Preference controls update the draft only on explicit user changes, not while reconstructing controls. Re-entering the preference page restores the current draft; skipping clears theme and budget, including explicit null values.
- Keep only editable fields in the draft. Saved derived `dailyData` must be rebuilt by `normalizePlannerRequest` after editing, so it cannot resurrect old dates, times, or deleted anchors.
- Form reset clears detailed inputs while preserving the selected dates/theme/budget. The cleared draft must also survive reload.
- Multi-day drafts use the first departure, final destination and explicit `overnightLocations`. Never infer lodging from legacy daily endpoints; restore the last day's destination and ask for missing stays when editing. `sameOvernightLocation` repeats the first selected stay for every night. Duration changes resize this array, and a day trip clears it. Saved/shared snapshots are unchanged until explicit regeneration.

## Input Validation Boundary

- `functions/planner-request-validation.mjs` is the dependency-free canonical `dailyData` validator shared by the form, optimizer and server. It lives under `functions/` so Firebase packaging includes it; the browser imports only this pure module, never server SDKs or prompts. The server's configured Node 24 runtime can require this synchronous ES module from CommonJS.
- `generateItinerary` checks authentication, then validates the raw canonical request **before** sanitization, account reads, secret access or Gemini calls. Invalid input returns `invalid-argument` with safe reason/field indexes, not input text. The sanitizer only projects/clamps validated fields; it must not be used to prove validity or invent a day for empty input.
- Require 1–4 ordered calendar dates, matching date/day representations, valid same-day `HH:mm` ranges and non-empty departure/arrival locations. Anchors are optional, but submitted anchors need a name and valid times within their own day's range, including custom daily times; do not silently truncate more than 10 anchors per day.
- Untimed required visits stay in the editable draft with `flexible: true`. Before canonical validation and submission, the form assigns times around fixed reservations using measured Maps legs and known opening hours. Reject visits that cannot fit or are known closed; if no candidate can be measured, explain the route lookup failure instead of inventing a travel time. The server continues to receive only timed anchors.
- Keep the existing optional-anchor-location policy and ignore untouched empty UI rows. Preserve explicit empty custom times through normalization so global defaults cannot mask them. The form owns row-specific feedback/focus and the existing local-calendar past-date check; no server timezone/past-date policy is introduced here.
- `planner-validation.js` translates safe reason codes. `functions/invalid-argument` must surface as a correctable error, never mock itinerary success. Existing auth failure and marked quota/network fallback behavior stays unchanged.
- Validation changes must pass the planner request, server callback, optimizer error, and planner constraints tests, plus the browser validation/draft/generation scenarios.

## Generation Lifecycle

- `app/generation-controller.mjs` owns the active generation attempt, success/failure transitions, and result/navigation guards. `app/main.js` wires the form event, auth/route context, result application, and completion notification into it.
- Call `syncContext()` on route/auth reevaluation. Leaving `/plan` or changing accounts invalidates the local attempt immediately; returning to `/plan` does not revive it. This does not cancel the server request.
- Only the current attempt may apply its result, change the progress screen, or release the form's submit button via `itinerary-generation-complete`. A superseded request's completion must not stop a newer request's timers.
- `enterPlan()` restores the form when idle but preserves the current loading/success/failure screen on same-account, same-route reevaluation. Successful generation still waits for the user to choose the result button before navigating.
- `ui/generation-progress.js` owns loading/result/error markup updates and advertisement/message animation resources. Every stop clears intervals, delayed transitions, and animation frames; version checks also ignore callbacks already queued before cancellation.
- Keep generation request/response constraints and fallback behavior in the existing planner services. Lifecycle and presentation changes are covered by `generation-controller.test.mjs` and `generation-progress.test.mjs`.

- Optional `dailyLocations` holds explicit per-day departure/arrival overrides. Blank fields inherit trip endpoints or nightly stays; never infer overrides from legacy `dailyData`. Normalize before flexible-visit placement, validation, generation and boundary enforcement. Turning off clears overrides; a day trip clears them, and duration changes trim removed days. The form shows default places and warns when consecutive day boundaries need a separate transfer (not included in daily route calculations).
