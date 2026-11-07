import { normalizeData } from './itinerary-normalize.mjs';
import { isFixedPlace, recommendationFields } from '../../map/services/recommendation-place.mjs';

export const ITINERARY_SESSION_KEY = 'compasser.itineraries.v1';
const LEGACY_DRAFT_KEY = 'savedItineraryData';
const UNDELIVERED_LINK_KEY = 'compasser.undeliveredShare.v1';
const validPlan = plan => {
  // Placeholder plans built before 2026-10-28 carry isFallback and can come back through browser session restore.
  if (plan?.isFallback) return false;
  const days = normalizeData(plan)?.days;
  return Array.isArray(days) && days.length > 0 && days.every(day => Array.isArray(day?.scheduleItems));
};

/**
 * 일정의 최신 데이터와 선택 날짜의 소유자. UI/인증/Firestore를 알지 않는다.
 * 메모리가 원본이고 sessionStorage는 새로고침 복원용 사본이다.
 * 같은 계정의 개인 일정·초안만 임시 저장하며, 공유 원본에는 쓰지 않는다.
 */
export function createItineraryState({ getStorage = () => null, onStorageError = () => {} } = {}) {
  const entries = new Map();
  let userId;
  let activeKey = null;
  let revision = 0;
  let storageWarning = false;

  const keyOf = source => source.kind === 'shared'
    ? `shared:${source.id}`
    : `${source.ownerId || 'guest'}:${source.kind}:${source.id || ''}`;
  const storage = operation => {
    try {
      const target = getStorage();
      if (!target) return false;
      operation(target);
      storageWarning = false;
      return true;
    } catch {
      if (!storageWarning) onStorageError();
      storageWarning = true;
      return false;
    }
  };
  const persist = () => {
    if (!userId) return;
    storage(target => {
      const personal = [...entries.values()].filter(entry => entry.source.kind !== 'shared' && entry.source.ownerId === userId);
      target.setItem(ITINERARY_SESSION_KEY, JSON.stringify({ version: 1, userId, entries: personal }));
      // 이전 형식은 새 형식의 기록이 성공한 뒤에만 걷어낸다.
      target.removeItem(LEGACY_DRAFT_KEY);
    });
  };
  const current = () => entries.get(activeKey) || null;
  const changed = () => { revision++; persist(); };
  const activate = key => {
    if (!entries.has(key)) return null;
    if (activeKey !== key) { activeKey = key; revision++; }
    return current();
  };

  return {
    get current() { return current(); },
    get revision() { return revision; },
    get userId() { return userId; },

    setUser(nextUserId) {
      const next = nextUserId || null;
      if (userId === next) return false;
      const initial = userId === undefined;
      userId = next;
      for (const [key, entry] of entries) {
        if (entry.source.kind !== 'shared') entries.delete(key);
      }
      if (!entries.has(activeKey)) activeKey = null;
      revision++;
      storage(target => {
        let saved = null;
        try { saved = JSON.parse(target.getItem(ITINERARY_SESSION_KEY)); } catch { /* 파손된 사본은 복원하지 않는다. */ }
        if (initial && userId && saved?.version === 1 && saved.userId === userId) {
          for (const entry of Array.isArray(saved.entries) ? saved.entries : []) {
            const source = entry?.source;
            if (!source || source.ownerId !== userId || !['draft', 'private'].includes(source.kind) || !validPlan(entry.plan)) continue;
            if (source.kind === 'private' && (typeof source.id !== 'string' || !source.id)) continue;
            const days = normalizeData(entry.plan).days;
            entry.dayIndex = Number.isInteger(entry.dayIndex) && days[entry.dayIndex] ? entry.dayIndex : 0;
            // Copies kept before the unsaved flag existed count as edited when they carry edit marks.
            if (source.kind === 'private' && entry.unsaved === undefined) entry.unsaved = Boolean(entry.dirtyDays?.length || Object.keys(entry.undoByDay || {}).length);
            entries.set(keyOf(source), entry);
          }
        } else if (initial && userId && !saved) {
          // 기존 앱의 로그인된 탭에서 생성했던 초안을 한 번만 이전한다.
          let plan;
          try { plan = JSON.parse(target.getItem(LEGACY_DRAFT_KEY)); } catch { /* 잘못된 JSON은 무시한다. */ }
          if (validPlan(plan)) {
            const source = { kind: 'draft', ownerId: userId };
            entries.set(keyOf(source), { source, plan, dayIndex: 0 });
          }
        } else {
          target.removeItem(ITINERARY_SESSION_KEY);
          target.removeItem(LEGACY_DRAFT_KEY);
          target.removeItem(UNDELIVERED_LINK_KEY);
        }
      });
      if (userId) persist();
      return true;
    },

    open(plan, { kind = 'draft', id = null, savedFromDraft = false } = {}) {
      if (!validPlan(plan)) return null;
      if (!['draft', 'private', 'shared'].includes(kind)) return null;
      if (kind !== 'draft' && !id) return null;
      if (kind === 'private' && !userId) return null;
      const source = kind === 'shared' ? { kind, id } : { kind, id, ownerId: userId || null };
      const entry = { source, plan, dayIndex: 0, dirtyDays: [], undoByDay: {}, ...(savedFromDraft ? { savedFromDraft } : {}) };
      activeKey = keyOf(source);
      entries.set(activeKey, entry);
      changed();
      return entry;
    },

    activateDraft() {
      const key = keyOf({ kind: 'draft', ownerId: userId || null });
      return activate(key);
    },

    activateDocument(id, { sharedOnly = false, userId: requester = null } = {}) {
      // 로그인 후의 기존 /view는 개인 데이터를 우선한다. 공유 캐시로 대체하지 않는다.
      const source = sharedOnly || !requester
        ? { kind: 'shared', id }
        : { kind: 'private', id, ownerId: requester };
      if (source.kind === 'private' && requester !== userId) return null;
      const key = keyOf(source);
      return activate(key);
    },

    deactivate() { activeKey = null; revision++; },

    /** The trip the last draft became, for a /view whose draft is already saved. */
    get savedDraftId() {
      return [...entries.values()].reverse().find(entry => entry.savedFromDraft && entry.source.kind === 'private')?.source.id || null;
    },

    forgetDocument(id) {
      let removed = false;
      for (const [key, entry] of entries) {
        if (entry.source.kind !== 'private' || entry.source.ownerId !== userId) continue;
        if (id !== null && entry.source.id !== id) continue;
        entries.delete(key);
        if (activeKey === key) activeKey = null;
        removed = true;
      }
      if (removed) changed();
    },

    selectDay(index) {
      const entry = current();
      if (!Number.isInteger(index) || !normalizeData(entry?.plan)?.days?.[index]) return false;
      if (entry.dayIndex !== index) { entry.dayIndex = index; changed(); }
      return true;
    },

    replaceDayItems(index, items) {
      const entry = current();
      const day = normalizeData(entry?.plan)?.days?.[index];
      if (!day || !Array.isArray(items)) return false;
      day.scheduleItems = items;
      // 저장한 일정이 저장본과 달라졌다는 표시. dirtyDays(시간 재계산 필요)와는 별개다.
      entry.unsaved = true;
      changed();
      return true;
    },

    editDayItems(index, items, { undo = false } = {}) {
      const entry=current();
      const day=normalizeData(entry?.plan)?.days?.[index];
      if (!day || entry.source.kind==='shared' || !Array.isArray(items)) return false;
      entry.undoByDay ||= {};
      if (undo) entry.undoByDay[index]=structuredClone(day.scheduleItems); else delete entry.undoByDay[index];
      entry.dirtyDays ||= [];
      if (!entry.dirtyDays.includes(index)) entry.dirtyDays.push(index);
      day.scheduleItems=items;entry.unsaved=true;changed();return true;
    },
    undoDeletion(index) {
      const entry=current(),items=entry?.undoByDay?.[index];
      if(!items || entry.source.kind==='shared') return false;
      delete entry.undoByDay[index];
      if(!entry.dirtyDays.includes(index))entry.dirtyDays.push(index);
      return this.replaceDayItems(index,items);
    },
    /** The entry still on screen becomes the trip saved from it; edits made during the save stay unsaved. */
    adoptSaved(entry, id, savedPlan) {
      if (!entry || current() !== entry || !userId) return null;
      const source = { kind: 'private', id, ownerId: userId };
      const moved = { ...entry, source, unsaved: JSON.stringify(entry.plan) !== JSON.stringify(savedPlan), ...(entry.source.kind === 'draft' ? { savedFromDraft: true } : {}) };
      // The shared original stays cached; a saved draft or a deleted trip's key would offer Save again.
      if (entry.source.kind !== 'shared') entries.delete(activeKey);
      activeKey = keyOf(source);
      entries.set(activeKey, moved);
      changed();
      return moved;
    },
    markSaved() {
      const entry=current();
      if (entry?.unsaved) { entry.unsaved=false; changed(); }
    },
    markDayRecalculated(index) {
      const entry=current();if(!entry)return;
      entry.dirtyDays=(entry.dirtyDays || []).filter(day=>day!==index);changed();
    },
    resolvePlaces(index, places) {
      const items = normalizeData(current()?.plan)?.days?.[index]?.scheduleItems;
      if (!items || !Array.isArray(places) || !places.length) return;
      let updated = false;
      for (const result of places) {
        if (!result) continue; // map-view event payloads are untrusted
        const { index: itemIndex, name, address } = result;
        const item = items[itemIndex];
        if (item && !isFixedPlace(item) && Object.hasOwn(item, 'placeIntent') && Object.hasOwn(result, 'verifiedPlace')) {
          const fields = recommendationFields(item, result.verifiedPlace);
          fields.unresolvedReason = fields.placeStatus === 'unresolved' ? result.unresolvedReason || null : null;
          if (Object.entries(fields).some(([key, value]) => JSON.stringify(item[key]) !== JSON.stringify(value))) {
            Object.assign(item, fields);
            updated = true;
          }
          continue;
        }
        if (!item || (item.resolvedName === name && item.resolvedAddress === address)) continue;
        item.resolvedName = name;
        item.resolvedAddress = address;
        updated = true;
      }
      if (updated) changed();
    },

    /** A key of its own: each mounted view rewrites the entries key with only the trips it knows. */
    get undeliveredLink() {
      let link = null;
      storage(target => {
        try { link = JSON.parse(target.getItem(UNDELIVERED_LINK_KEY)); } catch { /* 파손된 사본은 쓰지 않는다. */ }
      });
      return link;
    },
    keepUndeliveredLink(link) {
      storage(target => {
        if (link) target.setItem(UNDELIVERED_LINK_KEY, JSON.stringify(link));
        else target.removeItem(UNDELIVERED_LINK_KEY);
      });
    },

    snapshot() {
      const entry = current();
      return entry ? structuredClone(entry) : null;
    },
  };
}
