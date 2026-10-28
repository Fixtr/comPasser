import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { plannerDraftStore } from '../domains/planner/services/planner-draft.mjs';
import { showConfirm } from '../utils/confirm-dialog.js';
import { t } from '../utils/i18n.js';

export function usePlanExitGuard(location, user) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const current = useRef(null);
  const dialog = useRef(null);
  current.current = { path: location.pathname, returnTo: location.state?.returnTo, owner: user?.uid, index: window.history.state?.idx };
  useEffect(() => { dialog.current?.abort(); }, [location.pathname, user?.uid]);
  // Install before BrowserRouter subscribes to history in its parent layout effect.
  useLayoutEffect(() => {
    let pending = false;
    let restoring = false;
    let afterRestore;
    const editingDates = () => current.current.path === '/preference/1' && current.current.returnTo === '/plan';
    const shouldBlock = () => (current.current.path === '/plan' || editingDates()) && current.current.owner && !!plannerDraftStore.read().step;
    const discard = () => {
      plannerDraftStore.clear();
      window.dispatchEvent(new CustomEvent('planner-draft-discarded'));
    };
    const ask = async proceed => {
      if (pending) return;
      // A running generation asks to stop it instead, which keeps the inputs.
      if (!window.dispatchEvent(new CustomEvent('plan-exit-requested', { cancelable: true }))) return;
      pending = true;
      const controller = new AbortController();
      dialog.current = controller;
      try {
        const accepted = await showConfirm({ title: t('planLeaveTitle'), message: t('planLeaveMessage'), confirmText: t('planLeaveYes'), cancelText: t('planLeaveNo'), signal: controller.signal });
        if (accepted && shouldBlock()) { discard(); proceed(); }
      } finally { pending = false; dialog.current = null; }
    };
    const originals = {};
    for (const method of ['push', 'replace']) {
      originals[method] = navigator[method];
      navigator[method] = (...args) => {
        const target = typeof args[0] === 'string' ? new URL(args[0], window.location.href).pathname : args[0].pathname;
        const proceed = () => originals[method].apply(navigator, args);
        const editNavigation = args[1]?.returnTo === '/plan' && (current.current.path === '/plan'
          ? ['/destination', '/preference/1', '/preference/2'].includes(target) : editingDates() && target === '/plan');
        if (!shouldBlock() || target === current.current.path || editNavigation) {
          if (target !== current.current.path) dialog.current?.abort();
          return proceed();
        }
        void ask(proceed);
      };
    }
    const onPop = event => {
      const index = window.history.state?.idx;
      if (restoring) {
        event.stopImmediatePropagation();
        if (index !== current.current.index) { window.history.go(current.current.index - index); return; }
        restoring = false;
        const proceed = afterRestore;
        afterRestore = null;
        if (proceed) void ask(proceed);
        return;
      }
      if (!shouldBlock() || window.location.pathname === current.current.path) return;
      if (!Number.isInteger(index) || !Number.isInteger(current.current.index)) return;
      // Restore the indexed entry before showing the dialog, so cancellation keeps URL and form intact.
      event.stopImmediatePropagation();
      const delta = current.current.index - index;
      restoring = true;
      afterRestore = pending ? null : () => window.history.go(-delta);
      window.history.go(delta);
    };
    const beforeUnload = event => {
      if (!shouldBlock()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const pageHide = () => { if (shouldBlock()) discard(); };
    window.addEventListener('popstate', onPop, true);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    return () => {
      dialog.current?.abort();
      for (const method of ['push', 'replace']) navigator[method] = originals[method];
      window.removeEventListener('popstate', onPop, true);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
    };
  }, [navigator]);
}
