import { showToast } from './toast.js';

/**
 * Detects if the current user agent is an in-app browser (KakaoTalk, Instagram, Line, etc.)
 * @returns {boolean}
 */
export function isInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const inAppRegex = /KAKAOTALK|KAKAOSTORY|Line|Instagram|FBAN|FBAV|Twitter|Snapchat/i;
    return inAppRegex.test(ua);
}

/**
 * Detects if the current platform is Android
 * @returns {boolean}
 */
export function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

/**
 * Detects if the current platform is iOS (iPhone, iPad, iPod)
 * @returns {boolean}
 */
export function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Handles the escape from in-app browser by redirecting (Android) 
 * or showing instructions (iOS).
 * @param {Function} translate - Translation function (t)
 */
export function handleInAppBrowserEscape(translate) {
    if (!isInAppBrowser()) return;

    if (isAndroid()) {
        const currentUrl = window.location.href.replace(/^https?:\/\//, '');
        // Use Chrome Intent to escape on Android
        location.href = `intent://${currentUrl}#Intent;scheme=https;package=com.android.chrome;end`;
    } else if (isIOS()) {
        const msg = translate('inAppBrowserIOSAlert') || 
            "카카오톡 내장 브라우저에서는 구글 로그인이 보안상 제한됩니다. 우측 하단의 [ ⠇ ] 버튼을 눌러 '다른 브라우저로 열기'를 선택해 주세요.";
        // 인앱 브라우저 탈출 안내는 읽고 따라 해야 하므로 조금 더 오래 보여준다.
        showToast(msg, { tone: 'warning', duration: 8000 });
    }
}
