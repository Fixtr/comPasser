import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
    initializeAuth,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    browserPopupRedirectResolver,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithCredential,
    signInWithCustomToken,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    deleteUser,
    getIdTokenResult,
    applyActionCode
} from "firebase/auth";

import { signInWithNativeGoogle } from "./native-google-signin.mjs";
import { getEmailVerificationSettings } from "./email-verification-continuation.mjs";
import { createAccountDeletionGuard } from "./account-deletion-guard.mjs";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/**
 * 빌드할 때 채워졌어야 할 값들. 이름을 그대로 들고 있는 이유는, 빠졌을 때
 * 화면에 **배포 설정에서 찾을 수 있는 이름 그대로** 적어 주기 위해서다.
 */
const REQUIRED_CONFIG = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    appId: 'VITE_FIREBASE_APP_ID',
};

/** 비어 있는 설정의 **환경 변수 이름** 목록(없으면 빈 배열). */
export const missingFirebaseConfig = Object.entries(REQUIRED_CONFIG)
    .filter(([key]) => !firebaseConfig[key])
    .map(([, envName]) => envName);

/**
 * 설정이 비었으면 **시작하지 않는다.**
 *
 * 예전에는 그냥 불렀다. 그러면 `initializeApp` 이 모듈을 읽는 도중
 * `auth/invalid-api-key` 로 터지고, 이 모듈을 들여오는 `main.js` 가 통째로
 * 죽는다 — 라우터도 안 돌고 커스텀 요소도 하나도 정의되지 않는다. 화면에는
 * index.html 의 정적 마크업이 멀쩡히 떠 있으니 **멀쩡한 화면에 죽은 버튼**만
 * 남고, 원인을 짐작할 단서가 하나도 없다. 실제로 Cloudflare 미리보기 배포가
 * 그 상태였다(미리보기 환경에는 환경 변수가 따로 들어간다).
 */
export const app = missingFirebaseConfig.length === 0 ? initializeApp(firebaseConfig) : null;

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
const auth = app === null ? null : initializeAuth(app, {
    persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
    ],
});
const googleProvider = new GoogleAuthProvider();

/** 설정 없이 인증을 부르면 조용히 실패하는 대신 이유를 들고 터진다. */
function requireAuth() {
    if (!auth) {
        throw new Error(`Firebase 설정이 없습니다: ${missingFirebaseConfig.join(', ')}`);
    }
    return auth;
}

/**
 * 네이티브에서 OS 계정 선택창을 띄우고, 받은 idToken 으로 **JS SDK** 세션을
 * 만든다. 순서와 실패 처리는 `native-google-signin.mjs` 가 갖는다(브라우저
 * 없이 검사하려고 떼어 뒀다). 여기서는 진짜 도구만 끼워 준다.
 *
 * 플러그인은 **동적 import** 다. 최상단에서 들여오면 웹 사용자도 이 코드를
 * 받는데, 웹에서는 한 줄도 실행되지 않는다 — 캡처 엔진을 정적으로 묶었다가
 * 첫 로드 preload 가 254KB 로 불었던 것과 같은 실수가 된다.
 *
 * `skipNativeAuth: true` 를 빠뜨리면 플러그인이 네이티브 층에만 로그인시킨다.
 * 화면은 전부 JS SDK 의 `onAuthStateChanged` 를 보고 있으므로, 로그인은
 * 성공했는데 앱은 로그인 화면에 그대로 머문다 — 버튼이 죽은 것으로 보인다.
 */
async function loginWithGoogleOnDevice() {
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    return signInWithNativeGoogle({
        requestGoogleIdToken: () => FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true }),
        buildCredential: (idToken) => GoogleAuthProvider.credential(idToken),
        signInWithCredential: (credential) => signInWithCredential(requireAuth(), credential),
    });
}

export async function loginWithGoogle() {
    try {
        // 안드로이드 WebView 에는 팝업 창이 없다 — `native-google-signin.mjs`
        // 의 주석에 근거를 적어 뒀다. 웹에서만 팝업으로 간다.
        if (Capacitor.isNativePlatform()) {
            return await loginWithGoogleOnDevice();
        }
        // 해석기는 여기서 넘긴다. 이 줄이 실행될 때 비로소 gapi 를 받는다.
        const result = await signInWithPopup(requireAuth(), googleProvider, browserPopupRedirectResolver);
        return result.user;
    } catch (error) {
        console.error("Login failed", error);
        throw error;
    }
}

export async function logout() {
    try {
        try {
        localStorage.removeItem('compasser.offline.v1');
        localStorage.removeItem('compasser.planner.v1');
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        sessionStorage.removeItem('userPreference');
        sessionStorage.removeItem('compasser.itineraries.v1');
        } catch (error) { console.warn('Local travel cleanup failed', error); }
        await signOut(requireAuth());

        // 네이티브에서는 OS 쪽 구글 계정 선택도 함께 푼다. 안 풀면 다음
        // 로그인에서 계정 선택창이 뜨지 않고 방금 나간 계정으로 바로 들어간다
        // — 기기를 나눠 쓰는 상황에서 남의 일정이 보인다. 여기서 실패해도
        // JS 세션은 이미 끊겼으므로 로그아웃 자체를 되돌리지는 않는다.
        if (Capacitor.isNativePlatform()) {
            try {
                const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
                await FirebaseAuthentication.signOut();
            } catch (nativeError) {
                console.warn("Native sign-out skipped", nativeError);
            }
        }
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
    const result = await signInWithCustomToken(requireAuth(), token);
    return result.user;
}

export function subscribeToAuthChanges(callback) {
    return onAuthStateChanged(requireAuth(), callback);
}

export function getCurrentUser() {
    return auth?.currentUser;
}

export async function signUpWithEmail(email, password, returnTo = null) {
    const verificationSettings = getEmailVerificationSettings({
        returnTo,
        origin: window.location.origin,
        isNative: Capacitor.isNativePlatform(),
    });
    try {
        const userCredential = await createUserWithEmailAndPassword(requireAuth(), email, password);
        const user = userCredential.user;
        if (verificationSettings) await sendEmailVerification(user, verificationSettings);
        else await sendEmailVerification(user);
        await signOut(requireAuth());
        return user;
    } catch (error) {
        console.error("Sign up failed", error);
        throw error;
    }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(requireAuth(), email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
            await signOut(requireAuth());
            throw new Error("EMAIL_NOT_VERIFIED");
        }
        
        return user;
    } catch (error) {
        console.error("Email login failed", error);
        throw error;
    }
}

export const requireRecentLoginForDeletion = createAccountDeletionGuard({
    getCurrentUser,
    getTokenResult: user => getIdTokenResult(user, true),
});

export async function deleteCurrentUser(expectedUserId) {
    const user = auth?.currentUser;
    if (expectedUserId && user?.uid !== expectedUserId) {
        throw Object.assign(new Error('로그인 계정이 변경되었습니다.'), { code: 'profile/account-changed' });
    }
    if (user) {
        await deleteUser(user);
        // 인증 삭제 실패 때는 로컬 데이터까지 먼저 지우지 않는다.
        try {
        localStorage.removeItem('hasSeenTutorial');
        localStorage.removeItem('compasser.offline.v1');
        localStorage.removeItem('compasser.planner.v1');
        sessionStorage.removeItem('currentFormData');
        sessionStorage.removeItem('savedItineraryData');
        sessionStorage.removeItem('userPreference');
        sessionStorage.removeItem('compasser.itineraries.v1');
        } catch (error) { console.warn('Local travel cleanup failed', error); }
    }
}


export async function verifyEmailCode(actionCode) {
    try {
        await applyActionCode(requireAuth(), actionCode);
        return true;
    } catch(err) {
        throw err;
    }
}
