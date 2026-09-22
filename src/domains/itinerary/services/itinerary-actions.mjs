import { buildItineraryTitle } from './itinerary-title.mjs';

/**
 * 일정 저장·공개 공유의 규칙. DOM, 라우팅, 번역, Firebase SDK를 알지 않는다.
 * 데이터 접근은 주입하고, 최신 일정과 선택 날짜는 기존 state 한 곳에서 관리한다.
 */
export function createItineraryActions({
  state,
  getCurrentUser,
  saveItinerary,
  createSharedItinerary,
  getSharedItineraryUrl,
}) {
  return {
    /**
     * 저장 완료 후에도 같은 계정·같은 일정 버전일 때만 저장본을 활성화한다.
     * onSaved는 그 판정 직후 동기로 실행한다. UI가 별도 await 뒤에 화면을
     * 바꾸면 그 사이의 경로/계정 변경을 놓칠 수 있다.
     */
    async save({ language = 'ko', onSaved = () => {} } = {}) {
      const user = getCurrentUser();
      if (!user) return { status: 'login-required' };
      if (!state.current?.plan || state.current.plan.isFallback) return { status: 'unavailable' };

      const snapshot = state.snapshot();
      const revision = state.revision;
      const title = buildItineraryTitle(snapshot.plan, language);
      const id = await saveItinerary(user.uid, snapshot.plan, title);
      if (getCurrentUser()?.uid !== user.uid) return { status: 'account-changed' };
      if (revision !== state.revision) return { status: 'saved-earlier-version', id };

      // 공유 원본은 수정하지 않고, 저장 요청 당시의 사본을 개인 일정으로 연다.
      state.open(snapshot.plan, { kind: 'private', id });
      state.selectDay(snapshot.dayIndex);
      onSaved(id);
      return { status: 'saved', id };
    },

    async getShareLink({ confirmPublicShare }) {
      const entry = state.current;
      if (!entry?.plan || entry.plan.isFallback) return { status: 'unavailable' };
      // 공개 공유본의 재공유에는 로그인, 확인창, 새로운 쓰기가 필요 없다.
      if (entry.source.kind === 'shared') {
        return { status: 'ready', url: getSharedItineraryUrl(entry.source.id) };
      }
      const userId = getCurrentUser()?.uid;
      if (!userId) return { status: 'login-required' };
      if (entry.source.kind !== 'private' || !entry.source.id) return { status: 'save-required' };

      const confirmed = await confirmPublicShare();
      if (!confirmed || entry !== state.current || userId !== getCurrentUser()?.uid) {
        return { status: 'cancelled' };
      }
      // 같은 일정의 편집은 확인 이후의 최신 사본을 공유한다.
      const id = await createSharedItinerary(state.snapshot().plan, entry.source.id);
      return { status: 'ready', url: getSharedItineraryUrl(id) };
    },
  };
}
