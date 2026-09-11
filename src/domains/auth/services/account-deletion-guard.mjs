// 앱의 보수적인 사전 확인 기준이다. Firebase 서버의 내부 만료 기준을 뜻하지 않는다.
export const ACCOUNT_DELETION_LOGIN_MAX_AGE_MS = 60_000;

/**
 * 오래된 로그인으로 데이터부터 삭제하지 않도록 확인한다.
 * 토큰 갱신 시각(issuedAtTime)이 아니라 실제 로그인/재인증 시각(authTime)을 쓴다.
 * 재로그인 자체는 기존 로그인 화면에서 수행하며, 성공 후에도 탈퇴를 다시 확인한다.
 */
export function createAccountDeletionGuard({ getCurrentUser, getTokenResult, now = Date.now }) {
  return async function requireRecentLogin(userId) {
    const user = getCurrentUser();
    const requireSameUser = () => {
      if (!userId || user?.uid !== userId || getCurrentUser()?.uid !== userId) {
        throw Object.assign(new Error('로그인 계정이 변경되었습니다.'), { code: 'profile/account-changed' });
      }
    };
    requireSameUser();
    // 이 호출은 인증을 새로 하는 것이 아니다. 서버에서 토큰을 갱신해 기존 authTime을 읽는다.
    const token = await getTokenResult(user);
    requireSameUser();
    const age = now() - Date.parse(token?.authTime);
    if (!Number.isFinite(age) || age < 0 || age > ACCOUNT_DELETION_LOGIN_MAX_AGE_MS) {
      throw Object.assign(new Error('계정을 삭제하기 전에 다시 로그인해 주세요.'), { code: 'auth/requires-recent-login' });
    }
    return { userId };
  };
}
