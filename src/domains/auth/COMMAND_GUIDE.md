# Auth Domain COMMAND GUIDE

## Architectural Principles
- **Firebase Auth Centralization**: Any interaction with Firebase Authentication (e.g. `signInWithPopup`, `signOut`, `onAuthStateChanged`) must go through `src/domains/auth/services/firebase-auth.js`. Do not import `firebase/auth` directly in UI components.
- **Login View Limitation**: The `login-view.js` component acts solely as the landing page UI for unauthenticated users.
- **Routing**: Routing based on authentication state is handled at the application entry point (`src/app/main.js`), which listens to `subscribeToAuthChanges` and toggles the visibility of the `login-view` and the main `app-content`.
- **Environment Variables**: Make sure to populate the `.env` file with the relevant `VITE_FIREBASE_*` keys for authentication to work correctly.

## Account Deletion Preflight

- `firebase-auth.js` composes `account-deletion-guard.mjs` with `getIdTokenResult(user, true)`. A refreshed token is not a fresh sign-in: check `authTime`, never `issuedAtTime` or a local "logged in" flag. The guard does not itself reauthenticate a user.
- The app requires sign-in within **60 seconds** before starting deletion. This is a conservative app policy, not a statement about Firebase's internal recent-login threshold. Missing/invalid/future authentication times and token-fetch failures stop before deletion.
- Older sessions go through the existing sign-out/login flows. This works with the existing email, Google web/native, and custom-token login paths without introducing another provider-specific credential flow. The only new allowed return path is exactly `/profile/security`; it does not grant deletion permission or execute deletion.
- Keep the initiating UID and Auth creation time fixed. Profile deletion calls the server job endpoint, never the local `deleteCurrentUser` adapter. Clear local deletion-related state only after the server confirms completion.
- The server independently enforces recent `request.auth.token.auth_time`, matching identity, and explicit confirmation. Durable cleanup/retry is implemented in `functions/account-deletion.js`; it provides resumable deletion, **not all-or-nothing rollback**.
- Kakao/Naver custom-token issuance checks the deletion job before creating a user and before issuing a token. Do not recreate a deterministic social UID while deletion is pending/blocked.
- Sources: [Firebase user management](https://firebase.google.com/docs/auth/web/manage-users#re-authenticate_a_user), [IdTokenResult.authTime](https://firebase.google.com/docs/reference/js/auth.idtokenresult#idtokenresultauthtime).
