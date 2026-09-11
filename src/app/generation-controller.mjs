/**
 * 일정 생성의 수명과 화면 전환을 조정한다. DOM과 Firebase는 연결부가 주입한다.
 * 경로/계정 이탈은 로컬 실행만 무효화하며, 서버 요청 자체를 취소하지는 않는다.
 */
export function createGenerationController({
  generate,
  getContext,
  view,
  clearResults,
  applyResult,
  navigate,
  onComplete,
  notifyError,
  logError = error => console.error('Failed to generate itinerary:', error),
}) {
  let active = null;

  const matchesContext = run => {
    const { path, userId } = getContext();
    return path === '/plan' && userId === run.userId;
  };
  const isCurrent = run => active === run && matchesContext(run);

  function syncContext() {
    if (!active || matchesContext(active)) return;
    const previous = active;
    active = null;
    view.showForm();
    if (previous.pending) {
      previous.pending = false;
      onComplete();
    }
  }

  return {
    syncContext,

    enterPlan() {
      syncContext();
      // 같은 경로의 인증 재평가가 로딩·성공·실패 화면을 초기화하지 않는다.
      if (!active) view.showForm();
    },

    retry(message) {
      if (active?.pending && isCurrent(active) && typeof message === 'string') {
        view.showRetry(message);
      }
    },

    async start(request) {
      const { path, userId } = getContext();
      if (!userId || path !== '/plan') return 'ignored';
      const run = { userId, pending: true };
      active = run;

      try {
        clearResults();
        view.showLoading();
        const itinerary = await generate(request);
        if (!isCurrent(run)) return 'stale';
        applyResult(itinerary);
        view.showSuccess(() => {
          if (isCurrent(run)) navigate('/view');
        });
        return 'success';
      } catch (error) {
        if (!isCurrent(run)) return 'stale';
        logError(error);
        view.showError(error, () => {
          if (!isCurrent(run)) return;
          active = null;
          view.showForm();
        });
        if (error?.message?.includes('429')) notifyError('⏳ ' + error.message);
        return 'error';
      } finally {
        // 오래된 요청의 finally가 새 로딩 타이머나 제출 버튼을 풀지 않는다.
        if (active === run && run.pending) {
          run.pending = false;
          view.stop();
          onComplete();
        }
      }
    },
  };
}
