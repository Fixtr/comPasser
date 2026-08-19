import { app } from '../domains/auth/services/firebase-auth.js';

/**
 * Firestore SDK 를 실제로 필요할 때 받아온다.
 *
 * Firestore 는 번들에서 가장 큰 조각인데(gzip 약 52 kB), 홈/로그인 화면에서는
 * 전혀 쓰이지 않는다. 정적으로 import 하면 첫 방문자도 무조건 내려받아야 해서
 * 동적 import 로 미룬다. 한 번 받으면 같은 Promise 를 재사용하므로 SDK 초기화와
 * 네트워크 요청은 최대 한 번만 일어난다.
 *
 * @returns {Promise<object>} firebase/firestore 모듈 + 초기화된 db 인스턴스
 */
let pending = null;

export function loadFirestore() {
  if (!pending) {
    pending = import('firebase/firestore').then(firestore => ({
      ...firestore,
      db: firestore.getFirestore(app)
    })).catch(error => {
      // 실패한 Promise 를 캐시해두면 이후 호출이 영구히 같은 에러를 받는다.
      pending = null;
      throw error;
    });
  }
  return pending;
}
