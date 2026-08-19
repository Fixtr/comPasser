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

/**
 * IndexedDB 캐시를 켠 Firestore 인스턴스를 만든다.
 *
 * 여행지에서 데이터가 끊기는 건 흔한 상황이라, 한 번 본 일정은 오프라인에서도
 * 열려야 한다. persistentLocalCache 를 쓰면 읽은 문서가 로컬에 남아 네트워크가
 * 없어도 같은 쿼리가 캐시에서 응답한다. 여러 탭을 동시에 열어도 안전하도록
 * persistentMultipleTabManager 를 함께 쓴다.
 *
 * 사파리 프라이빗 모드처럼 IndexedDB 를 못 쓰는 환경에서는 initializeFirestore
 * 가 실패할 수 있는데, 그때는 캐시 없이 기본 인스턴스로 넘어간다 — 오프라인
 * 지원을 못 할 뿐 앱은 정상 동작해야 한다.
 */
function createDb(firestore) {
  try {
    return firestore.initializeFirestore(app, {
      localCache: firestore.persistentLocalCache({
        tabManager: firestore.persistentMultipleTabManager()
      })
    });
  } catch (error) {
    console.warn('[Firestore] 오프라인 캐시를 켜지 못해 기본 설정으로 실행합니다.', error);
    return firestore.getFirestore(app);
  }
}

export function loadFirestore() {
  if (!pending) {
    pending = import('firebase/firestore').then(firestore => ({
      ...firestore,
      db: createDb(firestore)
    })).catch(error => {
      // 실패한 Promise 를 캐시해두면 이후 호출이 영구히 같은 에러를 받는다.
      pending = null;
      throw error;
    });
  }
  return pending;
}
