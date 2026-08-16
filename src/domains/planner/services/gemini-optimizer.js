import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../../auth/services/firebase-auth.js";
import { getLang } from "../../../utils/i18n.js";
import {
  enforcePlannerConstraints,
  getLocationName,
  normalizePlannerRequest
} from "./planner-constraints.mjs";

const functions = getFunctions(app);

// 서버에서 최대 2개 모델을 순차 시도(각 90초) + 콜드 스타트 여유.
const CALL_TIMEOUT_MS = 200000;

/**
 * 모든 모델이 실패했을 때 사용하는 최후 방어선.
 * 출발지 → 앵커 일정 → 도착지만 남긴 최소 일정을 만들어 화면이 비지 않게 한다.
 */
function buildMockItinerary(constraints, lang) {
  const isKo = lang === "ko";

  let dates = ["Unknown Date"];
  if (Array.isArray(constraints.date) && constraints.date.length > 0) {
    dates = constraints.date;
  } else if (typeof constraints.date === "string") {
    dates = [constraints.date];
  }

  const mapsUrl = (name) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;

  const mockDays = dates.map((date, index) => {
    const day = constraints.dailyData ? constraints.dailyData[index] : null;
    const startName = getLocationName(day?.startLocation) || "Seoul, South Korea";
    const endName = getLocationName(day?.endLocation) || "Seoul, South Korea";

    return {
      day: index + 1,
      date,
      theme: isKo ? "임시 생성된 일정" : "Mock Generated Itinerary",
      scheduleItems: [
        {
          time: day?.startTime || "09:00",
          endTime: "",
          type: "departure",
          title: isKo ? "출발지" : "Start Location",
          description: isKo ? "일정을 시작합니다." : "Start of the itinerary.",
          location: startName,
          duration: isKo ? "출발" : "Departure",
          googleMapsUrl: mapsUrl(startName),
          transitInfo: "",
          practicalInfo: {
            estimatedCost: "Free",
            operatingHours: "24/7",
            localTip: isKo ? "안전한 여행 되세요." : "Have a safe trip.",
            top3Recommendations: []
          }
        },
        ...((day?.anchors || []).map((anchor) => {
          const anchorName = getLocationName(anchor.location);
          return {
            time: anchor.time,
            endTime: anchor.endTime,
            type: "AnchorSchedule",
            title: anchor.name,
            description: isKo ? "예정된 일정입니다." : "Scheduled event.",
            location: anchorName,
            duration: "Varies",
            googleMapsUrl: mapsUrl(anchorName),
            transitInfo: "",
            practicalInfo: {
              estimatedCost: "N/A",
              operatingHours: "N/A",
              localTip: "N/A",
              top3Recommendations: []
            }
          };
        })),
        {
          time: day?.endTime || "19:00",
          endTime: "",
          type: "arrival",
          title: isKo ? "도착지" : "End Location",
          description: isKo ? "일정을 마무리합니다." : "End of the itinerary.",
          location: endName,
          duration: isKo ? "도착" : "Arrival",
          googleMapsUrl: mapsUrl(endName),
          transitInfo: "",
          practicalInfo: {
            estimatedCost: "Free",
            operatingHours: "24/7",
            localTip: isKo ? "수고하셨습니다." : "Good job.",
            top3Recommendations: []
          }
        }
      ]
    };
  });

  return {
    request: constraints,
    days: enforcePlannerConstraints(mockDays, constraints, lang)
  };
}

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
    if (!Array.isArray(days) || days.length === 0) {
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

    setTimeout(() => {
      alert(
        error?.code === "functions/resource-exhausted"
          ? "API 일일 할당량이 초과되어 임시 데이터로 일정을 생성했습니다."
          : "일정 생성에 실패하여 임시 데이터로 일정을 생성했습니다."
      );
    }, 500);

    return buildMockItinerary(normalizedRequest, currentLang);
  }
}

export const GeminiOptimizer = {
  generateOptimizedItinerary
};
