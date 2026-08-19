import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../auth/services/firebase-auth.js";
import { getLang } from "../../../utils/i18n.js";
import {
  enforcePlannerConstraints,
  normalizePlannerRequest
} from "./planner-constraints.mjs";
import { buildMockItinerary, isValidGeneratedDays } from "./gemini-fallback.mjs";

const functions = getFunctions(app);

// 서버에서 최대 2개 모델을 순차 시도(각 90초) + 콜드 스타트 여유.
const CALL_TIMEOUT_MS = 200000;

/**
 * `generateItinerary` Cloud Function 에 일정 생성을 요청한다.
 *
 * Gemini 호출과 프롬프트 구성은 전부 서버에서 수행된다. 브라우저 번들에는
 * API 키가 포함되지 않으며, 클라이언트는 구조화된 제약 조건만 전송한다.
 * 결정론적 가드레일(enforcePlannerConstraints)은 사용자 입력을 알고 있는
 * 클라이언트에 그대로 남겨 둔다.
 */
export async function generateOptimizedItinerary(plannerRequest) {
  const normalizedRequest = normalizePlannerRequest(plannerRequest);
  const currentLang = getLang();

  console.log("Requesting itinerary from Cloud Function with constraints:", normalizedRequest);

  const callGenerateItinerary = httpsCallable(functions, "generateItinerary", {
    timeout: CALL_TIMEOUT_MS
  });

  try {
    const response = await callGenerateItinerary({
      request: normalizedRequest,
      lang: currentLang
    });

    const days = response?.data?.days;
    if (!isValidGeneratedDays(days)) {
      throw new Error("Invalid Output: Expected 'days' array to be present and not empty.");
    }

    return {
      request: normalizedRequest,
      days: enforcePlannerConstraints(days, normalizedRequest, currentLang)
    };
  } catch (error) {
    // 인증 문제는 Mock 으로 감추면 원인을 알 수 없으므로 그대로 노출한다.
    if (error?.code === "functions/unauthenticated" || error?.code === "functions/permission-denied") {
      throw new Error(
        currentLang === "ko"
          ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
          : "Your session has expired. Please sign in again."
      );
    }

    console.error("[generateItinerary] Cloud Function call failed. Falling back to Mock Data.", error);

    // 예전에는 alert 한 번 띄우고 Mock 일정을 정상 결과와 똑같이 렌더링했다.
    // alert 을 닫는 순간 화면에는 가짜 일정만 남아, 사용자가 그걸 진짜로 믿고
    // 저장·공유까지 할 수 있었다. 이제는 표식을 함께 넘겨 화면이 상시 경고를
    // 띄우고 저장/공유를 막는다.
    const fallbackReason = error?.code === "functions/resource-exhausted" ? "quota" : "error";
    return buildMockItinerary(normalizedRequest, currentLang, fallbackReason);
  }
}

export const GeminiOptimizer = {
  generateOptimizedItinerary
};
