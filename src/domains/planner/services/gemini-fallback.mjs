import { enforcePlannerConstraints, getLocationName } from "./planner-constraints.mjs";

/**
 * 모든 모델이 실패했을 때 사용하는 최후 방어선.
 * 출발지 → 앵커 일정 → 도착지만 남긴 최소 일정을 만들어 화면이 비지 않게 한다.
 *
 * firebase 의존성이 없는 순수 함수로 분리되어 있어 `gemini-optimizer.js`
 * (Firebase 앱 초기화 부작용 때문에 plain Node 환경에서 직접 import 할 수 없음)
 * 없이도 단독으로 테스트할 수 있다.
 */
export function buildMockItinerary(constraints, lang) {
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
 * Cloud Function 응답의 `days` 배열이 렌더링 가능한 최소 형태인지 검증한다.
 * 비어있거나 배열이 아니면 호출부는 Mock 폴백으로 전환해야 한다.
 */
export function isValidGeneratedDays(days) {
  return Array.isArray(days) && days.length > 0;
}
