import { useLayoutEffect, useRef, useState } from 'react';
import { loadSavedDiscoveryIds, setDiscoveryPlaceSaved } from '../domains/planner/services/discovery-saves.js';

export function useDiscoveryBookmarks(userId) {
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const scope = useRef(null);
  useLayoutEffect(() => {
    if (!userId) return undefined;
    const request = { saving: false };
    scope.current = request;
    setState({ userId, ids: null });
    void loadSavedDiscoveryIds(userId).then(ids => {
      if (scope.current === request) setState({ userId, ids });
    }, () => {
      if (scope.current === request) setState({ userId, ids: null, loadError: true });
    });
    return () => { scope.current = null; };
  }, [userId, attempt]);
  const current = userId && state?.userId === userId ? state : null;
  const toggle = async placeId => {
    const request = scope.current;
    if (!request || !current?.ids || request.saving) return;
    request.saving = true;
    setState({ ...current, savingId: placeId, saveError: false });
    try {
      const { saved } = await setDiscoveryPlaceSaved(placeId, !current.ids.includes(placeId), userId);
      if (scope.current !== request) return undefined;
      if (typeof saved !== 'boolean') throw new Error('Invalid saved state');
      setState({ userId, ids: saved ? [...current.ids, placeId]
        : current.ids.filter(id => id !== placeId) });
      return saved;
    } catch {
      if (scope.current === request) setState({ ...current, saveError: true });
    } finally { request.saving = false; }
  };
  return { ...current, toggle, retry: () => setAttempt(previous => previous + 1) };
}
