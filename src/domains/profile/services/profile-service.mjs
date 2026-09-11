export function createEmptyProfile() {
    return { phoneNumber: '', birthday: '', isVerified: false };
}

/**
 * 프로필 문서 접근과 탈퇴 순서. 화면·알림·라우팅을 알지 않으며 SDK 경계는 주입한다.
 * 저장된 일정의 조회/이름 변경/개별 삭제는 기존 itinerary 서비스를 사용한다.
 */
export function createProfileService({
    getCurrentUser,
    requireRecentLogin,
    loadFirestore,
    requestAccountDeletion,
}) {
    let deleting = false;
    const isCurrentUser = userId => getCurrentUser()?.uid === userId;
    const requireSameUser = (userId, identityCreatedAt) => {
        if (isCurrentUser(userId) && getCurrentUser()?.metadata?.creationTime === identityCreatedAt) return;
        const error = new Error('탈퇴 처리 중 로그인 계정이 변경되었습니다.');
        error.code = 'profile/account-changed';
        throw error;
    };

    return {
        async loadProfile() {
            const userId = getCurrentUser()?.uid;
            if (!userId) return null;
            const { db, doc, getDoc } = await loadFirestore();
            if (!isCurrentUser(userId)) return null;
            const snapshot = await getDoc(doc(db, 'users', userId));
            if (!isCurrentUser(userId)) return null;
            return {
                userId,
                profile: { ...createEmptyProfile(), ...(snapshot.exists() ? snapshot.data() : {}) },
            };
        },

        async saveField(field, value, { isVerifiedUpdate = false } = {}) {
            const userId = getCurrentUser()?.uid;
            if (!userId) return null;
            if (!['phoneNumber', 'birthday'].includes(field)) {
                throw new Error('지원하지 않는 프로필 항목입니다.');
            }
            const changes = { [field]: String(value ?? '').trim() };
            // 본인인증 판정 방식은 기존대로 둔다. 여기서는 문서 저장만 담당한다.
            if (isVerifiedUpdate) changes.isVerified = true;
            const { db, doc, setDoc } = await loadFirestore();
            if (!isCurrentUser(userId)) return null;
            await setDoc(doc(db, 'users', userId), changes, { merge: true });
            if (!isCurrentUser(userId)) return null;
            return { userId, changes };
        },

        async deleteAccount({ isCancelled = () => false, onDeletionStarted = () => {} } = {}) {
            const userId = getCurrentUser()?.uid;
            const identityCreatedAt = getCurrentUser()?.metadata?.creationTime;
            if (!userId || deleting) return null;
            deleting = true;

            try {
                // 재로그인 필요·토큰 조회 실패·계정 변경은 첫 삭제 전에 멈춘다.
                // 필수 의존성이다. 연결을 빠뜨려도 삭제를 건너뛰지 않고 실패한다.
                await requireRecentLogin(userId);
                requireSameUser(userId, identityCreatedAt);
                if (isCancelled()) return null;
                // A server-owned durable job is the only deletion path. Never
                // fall back to local deletes if the endpoint is unavailable.
                onDeletionStarted();
                const result = await requestAccountDeletion(userId);
                requireSameUser(userId, identityCreatedAt);
                return { ...result, userId, identityCreatedAt };
            } finally {
                deleting = false;
            }
        },
    };
}
