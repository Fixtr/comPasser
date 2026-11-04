import { buildItineraryTitle } from './itinerary-title.mjs';

/**
 * 일정 저장·공개 공유의 규칙. DOM, 라우팅, 번역, Firebase SDK를 알지 않는다.
 * 데이터 접근은 주입하고, 최신 일정과 선택 날짜는 기존 state 한 곳에서 관리한다.
 */
// 받는 화면은 시각을 다시 계산하지 않으므로 내용이 다르면 새로 동의받는다. 장소 표시 이름은 받는 화면도 직접 찾는다.
const publishedContent = plan => JSON.stringify(plan, (key, value) => (key === 'resolvedName' || key === 'resolvedAddress' ? undefined : value));

export function createItineraryActions({
  state,
  getCurrentUser,
  saveItinerary,
  updateItinerary,
  createSharedItinerary,
  getSharedItineraryUrl,
  readSharedItinerary,
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
      if (!state.current?.plan) return { status: 'unavailable' };

      const entry = state.current;
      const snapshot = state.snapshot();
      const revision = state.revision;
      // 저장한 개인 일정은 같은 문서를 고친다. 초안과 공유본은 새 개인 문서를 만든다.
      let updating = snapshot.source.kind === 'private';
      const create = () => saveItinerary(user.uid, snapshot.plan, buildItineraryTitle(snapshot.plan, language));
      let id;
      try {
        id = updating ? await updateItinerary(snapshot.source.id, snapshot.plan) : await create();
      } catch (error) {
        // The rules deny an update only when the trip is gone or the account is fenced (create is fenced too).
        // Edits to the user's own trip deleted on another device are kept as a new trip.
        if (!updating || !['permission-denied', 'not-found'].includes(error?.code) || snapshot.source.ownerId !== user.uid) throw error;
        updating = false;
        id = await create();
      }
      if (getCurrentUser()?.uid !== user.uid) return { status: 'account-changed' };
      if (revision !== state.revision) {
        // A new trip the screen still shows becomes that trip, so saving again updates it instead of creating a second one.
        const opened = !updating && state.adoptSaved(entry, id, snapshot.plan);
        if (!opened) return { status: 'saved-earlier-version', id };
        onSaved(id);
        return { status: opened.unsaved ? 'saved-earlier-version' : 'saved', id };
      }

      if (updating) state.markSaved();
      // 초안은 그 자리에서 저장본이 된다. 되돌리기가 남고, 남은 초안을 다시 저장할 수 없다.
      else if (snapshot.source.kind !== 'shared') state.adoptSaved(entry, id, snapshot.plan);
      else {
        // 공유 원본은 수정하지 않고, 저장 요청 당시의 사본을 개인 일정으로 연다.
        state.open(snapshot.plan, { kind: 'private', id });
        state.selectDay(snapshot.dayIndex);
      }
      onSaved(id);
      return { status: 'saved', id };
    },

    async getShareLink({ confirmPublicShare, confirmSaveAndShare, saveBeforeShare }) {
      const entry = state.current;
      if (!entry?.plan) return { status: 'unavailable' };
      // 공개 공유본의 재공유에는 로그인, 확인창, 새로운 쓰기가 필요 없다.
      if (entry.source.kind === 'shared') {
        return { status: 'ready', url: getSharedItineraryUrl(entry.source.id) };
      }
      const userId = getCurrentUser()?.uid;
      if (!userId) return { status: 'login-required' };
      // 복사나 카카오 전달이 실패한 링크는 이미 동의받은 같은 내용이므로 공개 문서를 또 만들지 않는다.
      const kept = state.undeliveredLink;
      if (kept && kept.userId === userId && kept.sourceId === entry.source.id && kept.plan === publishedContent(entry.plan)) {
        state.keepUndeliveredLink({ ...kept, reused: true });
        return { status: 'ready', url: kept.url };
      }
      // 공유본은 원본 삭제를 추적하므로 개인 문서가 먼저 있어야 한다. 새 초안은 한 번 확인받고 저장한다.
      const needsSave = entry.source.kind !== 'private' || !entry.source.id;
      const confirmed = await (needsSave ? confirmSaveAndShare : confirmPublicShare)();
      if (!confirmed || entry !== state.current || userId !== getCurrentUser()?.uid) {
        return { status: 'cancelled' };
      }
      if (needsSave) {
        const saved = await saveBeforeShare();
        // 저장 중 편집이나 계정 변경이 있었다면 확인받은 일정이 아니므로 공개하지 않는다.
        if (saved?.status === 'saved-earlier-version') return { status: 'not-shared' };
        if (saved?.status !== 'saved' || state.current?.unsaved || state.current?.source.id !== saved.id || userId !== getCurrentUser()?.uid) {
          return { status: 'cancelled' };
        }
      }
      // 같은 일정의 편집은 확인 이후의 최신 사본을 공유한다.
      const { plan } = state.snapshot();
      const sourceId = state.current.source.id;
      const id = await createSharedItinerary(plan, sourceId);
      const url = getSharedItineraryUrl(id);
      state.keepUndeliveredLink({ userId, sourceId, id, plan: publishedContent(plan), url });
      return { status: 'ready', url };
    },

    /**
     * False when a reused link turned out unreadable because the trip was deleted elsewhere.
     * The check follows delivery: a read before it would expire the tap Safari requires for the clipboard.
     */
    async linkDelivered(url) {
      const kept = state.undeliveredLink;
      if (kept?.url !== url) return true;
      state.keepUndeliveredLink(null);
      if (!kept.reused) return true;
      try {
        return Boolean(await readSharedItinerary(kept.id));
      } catch {
        return true; // Only a successful read proves the link is dead.
      }
    },
  };
}
