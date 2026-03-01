# Auth Domain COMMAND GUIDE

## Architectural Principles
- **Firebase Auth Centralization**: Any interaction with Firebase Authentication (e.g. `signInWithPopup`, `signOut`, `onAuthStateChanged`) must go through `src/domains/auth/services/firebase-auth.js`. Do not import `firebase/auth` directly in UI components.
- **Login View Limitation**: The `login-view.js` component acts solely as the landing page UI for unauthenticated users.
- **Routing**: Routing based on authentication state is handled at the application entry point (`src/app/main.js`), which listens to `subscribeToAuthChanges` and toggles the visibility of the `login-view` and the main `app-content`.
- **Environment Variables**: Make sure to populate the `.env` file with the relevant `VITE_FIREBASE_*` keys for authentication to work correctly.
