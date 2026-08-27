import { initializeApp } from "firebase/app";
import {
    initializeAuth,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    browserPopupRedirectResolver,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCustomToken,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    deleteUser,
    applyActionCode
} from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);

/**
 * `getAuth(app)` 을 쓰지 않는 이유.
 *
 * 그 함수는 **팝업 해석기까지 끼워서** 인증을 시작하고, 해석기는 구글 로그인용
 * iframe 을 미리 띄우려고 `apis.google.com/js/api.js` 를 받는다. 그래서 로그인
 * 버튼이 없는 랜딩에서도 gapi 를 받고 있었다 — 팝업으로 로그인하는 그 순간에만
 * 필요한 것을 모든 화면에서 받아 온 셈이다.
 *
 * 해석기 없이 시작하고, `signInWithPopup` 을 부르는 자리에서 넘긴다.
 * 대신 **지속성은 직접 준다** — `getAuth()` 가 대신 정해 주던 값이라 빠뜨리면
 * 메모리 저장으로 떨어져 새로고침 한 번에 로그아웃된다. 브라우저 기본값과
 * 같은 세 가지를 같은 순서로 적는다(firebase/auth 의 getAuth 구현에서 그대로
 * 옮겼다 — 눈대중으로 둘만 적었다가 실제 구현이 셋인 것을 보고 맞췄다).
 */
const auth = initializeAuth(app, {
    persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
    ],
});
const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
    try {
        // 해석기는 여기서 넘긴다. 이 줄이 실행될 때 비로소 gapi 를 받는다.
        const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
        return result.user;
    } catch (error) {
        console.error("Login failed", error);
        throw error;
    }
}

export async function logout() {
    try {
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed", error);
        throw error;
    }
}

/**
 * 서버가 발급한 커스텀 토큰으로 로그인한다(카카오·네이버).
 *
 * 예전에는 `login-view.js` 가 `firebase/auth` 를 직접 들여와 모듈 최상단에서
 * `getAuth(app)` 를 부르고 있었다. 그러면 **인증을 어떻게 시작하는지가 모듈
 * 로딩 순서에 달리게 된다** — 위의 `initializeAuth` 가 먼저 돌지 못하면
 * 팝업 해석기가 다시 끼워진다. COMMAND_GUIDE.md 가 "UI 는 firebase/auth 를
 * 직접 들여오지 않는다"고 정해 둔 이유가 이것이다.
 */
export async function loginWithCustomToken(token) {
    const result = await signInWithCustomToken(auth, token);
    return result.user;
}

export function subscribeToAuthChanges(callback) {
    return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
    return auth.currentUser;
}

export async function signUpWithEmail(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await sendEmailVerification(user);
        await signOut(auth);
        return user;
    } catch (error) {
        console.error("Sign up failed", error);
        throw error;
    }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
            await signOut(auth);
            throw new Error("EMAIL_NOT_VERIFIED");
        }
        
        return user;
    } catch (error) {
        console.error("Email login failed", error);
        throw error;
    }
}

export async function deleteCurrentUser() {
    const user = auth.currentUser;
    if (user) {
        localStorage.removeItem('hasSeenTutorial');
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        await deleteUser(user);
    }
}


export async function verifyEmailCode(actionCode) {
    try {
        await applyActionCode(auth, actionCode);
        return true;
    } catch(err) {
        throw err;
    }
}
