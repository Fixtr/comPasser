import { getSafeReturnPath } from '../../../app/route-decision.mjs';

/** 웹 인증 메일에서 원래 일정으로 돌아갈 주소. 네이티브의 로컬 주소는 보내지 않는다. */
export function getEmailVerificationSettings({ returnTo, origin, isNative = false } = {}) {
  const next = getSafeReturnPath(returnTo);
  if (isNative || !next) return null;

  try {
    const base = new URL(origin);
    if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
    return { url: `${base.origin}/login?next=${encodeURIComponent(next)}` };
  } catch {
    return null;
  }
}
