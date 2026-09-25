# Profile Domain COMMAND GUIDE

## Responsibilities

- `services/profile-service.mjs` owns profile defaults, reads, field merges, deletion preflight, and server submission. It never deletes Firestore/Auth data locally.
- `services/account-deletion-client.mjs` persists a random receipt before submission and reconciles lost responses. `account-deletion-api.js` owns callable/HTTP transport. Receipt lookup remains available without Auth and returns progress only.
- `ui/profile-view.js` owns confirmation, status polling, notifications, and navigation. Only a server `completed` result triggers the `itinerary-deleted` event and logout.
- `ui/account-deletion-status-view.js` is a public, read-only status screen. It uses locally stored receipt tokens after logout; never put receipts in URLs, analytics, or rendered text. Keep a completed receipt so the logged-out screen can confirm completion.
- Saved-itinerary listing, renaming, and individual deletion continue to use the itinerary domain services. Do not duplicate their persistence logic here.

## Data and Account Boundaries

- Profile reads expose only `birthday` and start with fresh defaults rather than values left over from another account. Saves trim and merge only `birthday`; legacy `phoneNumber` and `isVerified` document fields are not shown or rewritten.
- Capture UID and Auth creation time. Ignore stale deletion results, including a re-created identity with the same UID. The server checks both against the verified caller; client-supplied IDs never choose a deletion target.
- Deletion first calls required `requireRecentLogin(userId)`, then checks session/cancellation before submission. Never fall back to direct Firestore/Auth deletion when the server or storage is unavailable.
- `functions/account-deletion.js` owns the durable sequence: private itineraries → profile → Auth → completion. Each Firestore batch/checkpoint is atomic; Auth is not part of that transaction. Failed work retries; it does **not** roll back deleted data. `pending`, `blocked`, and unknown transport outcomes must never be displayed as completion or guaranteed preservation.
- Job/receipt documents are server-owned. Firestore rules block new account-data writes during deletion and fence old tokens after completion. Deleting private originals also revokes linked public snapshots through dependent security rules. Legacy unlinked shares and other users' saved copies remain; disclose the distinction in confirmation.
- Keep modal cleanup in `finally`. A stale login prompts sign-out and `/login?next=%2Fprofile%2Fsecurity`, then the existing login flow returns to account settings. **Never automatically resume deletion after login**; the user must confirm again. Never redirect or log out a newly signed-in different account.
- A pending preflight can be cancelled; ignore its late completion. Once submitted, cancellation is unavailable. Disable new deletion attempts while checking for an existing job, and while its status is pending, unknown, blocked, or completed. A missing receipt response can mean an in-flight request, not rejection. Poll using the persisted receipt, without resubmitting on reload. Clear timers on disconnection and ignore responses after identity changes.
- Catch sign-out failure after completion, retaining the receipt for later confirmation. Never clear an existing accepted receipt just because a duplicate request fails authentication.
- The former PortOne certification UI has been retired. Do not treat legacy `isVerified` as proof of identity. Firestore rules permit only `birthday` profile writes; historical `phoneNumber` and `isVerified` fields are removed only by the separately approved cleanup procedure.

## Verification

- `test/profile-service.test.mjs` covers persistence, defaults, session guards, preflight, and server-only submission.
- `test/profile-view.test.mjs` executes the actual UI handlers with the real service and fake SDK/DOM boundaries to verify display updates, errors, and deletion control cleanup.
- `test/account-deletion-guard.test.mjs` covers actual authentication time, UID races, the real auth adapter with fake SDK boundaries, and local cleanup only after successful auth deletion.
- `test/account-deletion-client.test.mjs` and `test/account-deletion-server.test.mjs` cover durable receipts, checkpoints, concurrent leases, failure recovery, and identity generation protection.
- `test/emulator/*.test.mjs` verifies real Firestore rules, Admin SDK transactions, Auth cleanup, and callable HTTP protocol against a strictly local demo project. See `docs/ACCOUNT_DELETION_SERVER_2026-09-11.md` for the command and deployment prerequisites.
- `test/browser/account-deletion-smoke.js` verifies re-login, explicit confirmation, lost responses, pending status across reload, and completion-driven logout with fake external services.
- Run `npm test` and `npm run build`. Never test account deletion against a real account as part of refactoring verification.
