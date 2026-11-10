import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../auth/services/firebase-auth.js";
import { getLang, t } from "../../../utils/i18n.js";
import {
  enforcePlannerConstraints,
  normalizePlannerRequest
} from "./planner-constraints.mjs";
import { isValidGeneratedDays } from "./generated-days.mjs";
import { findPlannerInputIssue, plannerValidationMessage } from './planner-validation.js';
import { prepareGeneratedPlaces } from '../../map/services/recommendation-place.mjs';
import { verifyGeneratedItinerary } from './generated-day-quality.js';
import { addSelectedWaypoint } from './selected-waypoint.mjs';

/**
 * Functions 핸들은 **쓸 때 만든다.**
 *
 * 예전에는 모듈 최상단에서 `getFunctions(app)` 을 불렀다. 그런데 설정이 빠진
 * 빌드에서는 `app` 이 null 이라 그 줄이 그대로 터지고, 이 모듈을 들여오는
 * 화면 전체가 죽는다 — "설정이 없다"고 화면에 적어 주려던 노력이 여기서
 * 다시 무산된다. 늦게 만들면 그런 빌드에서도 화면은 뜬다.
 */
let _functions = null;
function fns() {
  if (!_functions) _functions = getFunctions(app);
  return _functions;
}

// 서버에서 최대 2개 모델을 순차 시도(각 90초) + 콜드 스타트 여유.
const CALL_TIMEOUT_MS = 200000;

export async function getGenerationCredits() {
  const response = await httpsCallable(fns(), 'getGenerationCredits')();
  if (response?.data?.unlimited === true) return 'unlimited';
  // A running generation holds a credit it refunds on failure, so the balance is not a known zero yet.
  if (response?.data?.generating === true) return null;
  const balance = response?.data?.balance;
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid generation credit balance.');
  return balance;
}

/**
 * `generateItinerary` Cloud Function 에 일정 생성을 요청한다.
 *
 * Gemini 호출과 프롬프트 구성은 전부 서버에서 수행된다. 브라우저 번들에는
 * API 키가 포함되지 않으며, 클라이언트는 구조화된 제약 조건만 전송한다.
 * 결정론적 가드레일(enforcePlannerConstraints)은 사용자 입력을 알고 있는
 * 클라이언트에 그대로 남겨 둔다.
 */
export async function generateOptimizedItinerary(plannerRequest, { onStage, requestId, lang: currentLang = getLang() } = {}) {
  const issue = findPlannerInputIssue(plannerRequest);
  if (issue) throw new Error(plannerValidationMessage(issue));
  const normalizedRequest = normalizePlannerRequest(plannerRequest);

  const callGenerateItinerary = httpsCallable(fns(), "generateItinerary", {
    timeout: CALL_TIMEOUT_MS
  });

  try {
    const response = await callGenerateItinerary({
      // An older server rejects the new field rather than spending credits on an untracked retry.
      ...(requestId ? { recoverableRequest: normalizedRequest, requestId } : { request: normalizedRequest }),
      lang: currentLang
    });

    const days = response?.data?.days;
    if (!isValidGeneratedDays(days)) {
      throw new Error("Invalid Output: Expected 'days' array to be present and not empty.");
    }

    return await verifyGeneratedItinerary({
      request: normalizedRequest,
      days: addSelectedWaypoint(enforcePlannerConstraints(prepareGeneratedPlaces(days, normalizedRequest.budget), normalizedRequest, currentLang), normalizedRequest)
    }, { onStage });
  } catch (error) {
    if (error?.details?.reason === 'generation-request-expired' || error?.details?.reason === 'generation-request-mismatch') {
      throw Object.assign(new Error(t('generationRecoveryExpired')), { recoveryExpired: true });
    }
    if (error?.details?.reason === 'email-not-verified') {
      throw new Error(t('loginEmailNotVerified'));
    }
    // Bad input needs editing, never a generated-looking fallback result.
    if (error?.code === 'functions/invalid-argument') {
      throw new Error(plannerValidationMessage(error.details));
    }
    // 인증 문제는 Mock 으로 감추면 원인을 알 수 없으므로 그대로 노출한다.
    if (error?.code === "functions/unauthenticated" || error?.code === "functions/permission-denied") {
      throw new Error(
        currentLang === "ko"
          ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
          : "Your session has expired. Please sign in again."
      );
    }
    if (error?.details?.reason === 'credits-empty') {
      throw new Error(currentLang === 'ko'
        ? '남은 생성권이 없어 일정을 만들 수 없습니다. 한국 시간 자정이 지나면 1장이 다시 채워집니다.'
        : 'No generation credits remain, so this itinerary cannot be created. One credit comes back after midnight Korea time.');
    }
    if (error?.details?.reason === 'generation-in-progress') {
      throw new Error(currentLang === 'ko'
        ? '이미 일정을 생성 중입니다. 잠시 후 다시 시도해 주세요.'
        : 'An itinerary is already being generated. Please try again shortly.');
    }

    console.error("[generateItinerary] generation failed.", error);
    const unknown = error?.details?.reason === 'generation-request-pending'
      || error?.code === 'functions/deadline-exceeded'
      || (Boolean(requestId) && error?.code === 'functions/unavailable')
      || (error?.code === 'functions/internal' && error.message === 'internal');
    throw Object.assign(new Error(t(unknown ? 'generationOutcomeUnknown' : 'generationAiFailed')),
      { retryable: unknown ? Boolean(requestId) : String(error?.code).startsWith('functions/'), outcomeUnknown: unknown });
  }
}
