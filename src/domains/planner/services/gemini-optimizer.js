import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getLang } from "../../../utils/i18n.js";

/**
 * Calls the real Gemini API to generate an optimized itinerary.
 * Uses GEMINI_API_KEY Exposed through Vite Configuration.
 */
export async function generateOptimizedItinerary(plannerRequest) {
  console.log("Calling Gemini AI Optimizer with constraints:", plannerRequest);

  const apiKey = import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please ensure GEMINI_API_KEY is defined in .env.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Define strict JSON schema matching our required data structure
  const itinerarySchema = {
    type: SchemaType.OBJECT,
    properties: {
      days: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            day: { type: SchemaType.INTEGER },
            date: { type: SchemaType.STRING },
            theme: { type: SchemaType.STRING },
            scheduleItems: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  time: { type: SchemaType.STRING },
                  endTime: { type: SchemaType.STRING },
                  type: { type: SchemaType.STRING, description: "Must be one of: 'attraction', 'dining', 'leisure', 'AnchorSchedule'" },
                  title: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING },
                  location: { type: SchemaType.STRING, description: "Specific real world Address or accurate Place Name in Korea" },
                  duration: { type: SchemaType.STRING },
                  officialWebsiteUrl: { type: SchemaType.STRING, description: "Official website URL of the place. Return an empty string if unknown." },
                  googleMapsUrl: { type: SchemaType.STRING, description: "Google Maps search URL for this place. e.g. https://www.google.com/maps/search/?api=1&query=[Place Name]" },
                  practicalInfo: {
                    type: SchemaType.OBJECT,
                    properties: {
                      estimatedCost: { type: SchemaType.STRING, description: "Expected cost per person (e.g. 'Approx. ₩15,000', 'Free entrance')" },
                      operatingHours: { type: SchemaType.STRING, description: "General opening/closing hours and holidays (e.g. '10:00 - 22:00 (Closed on Mons)')" },
                      localTip: { type: SchemaType.STRING, description: "Crucial pro tips for foreigners/locals (e.g. 'English menu available', 'Credit cards accepted', 'Last entry at 21:00')" }
                    },
                    required: ["estimatedCost", "operatingHours", "localTip"]
                  }
                },
                required: ["time", "endTime", "type", "title", "description", "location", "duration", "googleMapsUrl", "practicalInfo"]
              }
            }
          },
          required: ["day", "date", "theme", "scheduleItems"]
        }
      }
    },
    required: ["days"]
  };

  const anchorText = plannerRequest.anchorSchedules && plannerRequest.anchorSchedules.length > 0
    ? plannerRequest.anchorSchedules.map((a, i) => `${i + 1}. "${a.name}" at ${a.time} to ${a.endTime} (Location: "${a.location}")`).join('\\n')
    : "No fixed AnchorSchedules provided. Free to plan the entire day.";

  const anchorRule = plannerRequest.anchorSchedules && plannerRequest.anchorSchedules.length > 0
    ? `1. You MUST include ScheduleItems with type="AnchorSchedule" that exactly match the time and location of the provided AnchorSchedules.`
    : `1. You may omit ScheduleItems of type="AnchorSchedule" since none were provided.`;

  const currentLang = getLang();
  const langRule = currentLang === 'ko'
    ? 'ALL output text (titles, descriptions, themes) MUST be written in Korean language.'
    : 'ALL output text (titles, descriptions, themes) MUST be written in English language.';

  const prompt = `
You are an expert AI Travel Planner.
Plan a 1-day itinerary for the date ${plannerRequest.date}.

PARAMETERS:
- Start Time: ${plannerRequest.startTime}
- End Time: ${plannerRequest.endTime}
- Start Location (e.g. Hotel): "${plannerRequest.startLocation}"
- End Location (e.g. Hotel): "${plannerRequest.endLocation}"

ANCHOR SCHEDULES (Must Attend):
${anchorText}

The primary goal is to ensure the user arrives at any AnchorSchedules seamlessly and exactly on time.
Fill the rest of the day prior to and after the AnchorSchedules with highly-rated attractions, cafes, and restaurants geographically close to the route to minimize travel time. Provide REAL street addresses or recognizable place names in Korea in the location fields so Google Maps can geocode them.
For every single place, you MUST provide a 'practicalInfo' object containing:
  - estimatedCost: Approximate spending per person in KRW or 'Free'.
  - operatingHours: Opening hours and regular holidays.
  - localTip: A crucial pro-tip specially for tourists in Korea (e.g. availability of English menus, tax-free info, or waiting time advice).
The first ScheduleItem of the day MUST start at the Start Location near the Start Time.
The last ScheduleItem of the day MUST end at the End Location near the End Time.

CRITICAL RULES:
${anchorRule}
2. All alternative locations MUST be real places in Korea, close to the route.
3. Obey the JSON schema exactly. You MUST provide a valid 'googleMapsUrl' for every single schedule item. Provide 'officialWebsiteUrl' if available, otherwise an empty string.
4. Output ONLY valid JSON, do NOT include markdown backticks or any conversation.
5. ${langRule}
  `;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const maxRetries = 2; // 최대 2회 재시도 (503 에러 등)
  const delays = [1000, 2000];
  let hasDispatchedRetryEvent = false;

  const getMockItinerary = (constraints) => {
    const currentLang = getLang();
    const isKo = currentLang === 'ko';
    
    return {
      request: constraints,
      days: [
        {
          day: 1,
          date: constraints.date || "Unknown Date",
          theme: isKo ? "임시 생성된 일정" : "Mock Generated Itinerary",
          scheduleItems: [
            {
              time: constraints.startTime || "09:00",
              endTime: "10:00",
              type: "attraction",
              title: isKo ? "출발지" : "Start Location",
              description: isKo ? "일정을 시작합니다." : "Start of the itinerary.",
              location: constraints.startLocation || (isKo ? "알 수 없는 장소" : "Unknown Location"),
              duration: "1h",
              googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(constraints.startLocation || "Seoul")}`,
              practicalInfo: {
                estimatedCost: "Free",
                operatingHours: "24/7",
                localTip: isKo ? "안전한 여행 되세요." : "Have a safe trip."
              }
            },
            ...((constraints.anchorSchedules || []).map((a) => ({
              time: a.time,
              endTime: a.endTime,
              type: "AnchorSchedule",
              title: a.name,
              description: isKo ? "예정된 일정입니다." : "Scheduled event.",
              location: a.location,
              duration: "Varies",
              googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location)}`,
              practicalInfo: {
                estimatedCost: "N/A",
                operatingHours: "N/A",
                localTip: "N/A"
              }
            }))),
            {
              time: "18:00",
              endTime: constraints.endTime || "19:00",
              type: "attraction",
              title: isKo ? "도착지" : "End Location",
              description: isKo ? "일정을 마무리합니다." : "End of the itinerary.",
              location: constraints.endLocation || (isKo ? "알 수 없는 장소" : "Unknown Location"),
              duration: "1h",
              googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(constraints.endLocation || "Seoul")}`,
              practicalInfo: {
                estimatedCost: "Free",
                operatingHours: "24/7",
                localTip: isKo ? "수고하셨습니다." : "Good job."
              }
            }
          ]
        }
      ]
    };
  };

  const tryGenerate = async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: itinerarySchema,
      }
    });

    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err) {
      const is429 = err.status === 429 || (err.message && err.message.includes("429"));
      const is503 = err.status === 503 || (err.message && (err.message.includes("503") || err.message.includes("High demand") || err.message.includes("overloaded")));
      const is404 = err.status === 404 || (err.message && err.message.includes("404"));

      if (is429 || is503 || is404) {
        console.warn(`[Gemini API] ${err.status || 'API'} Error with ${modelName}. Skipping retries.`);
        throw err; // 대기 시간 없이 즉시 다음 Fallback 모델로 넘어가게 처리
      }
      
      throw err;
    }
  };

  const modelsToTry = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
  let result = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini API] Attempting to generate itinerary using ${modelName}...`);
      result = await tryGenerate(modelName);
      if (result) break; // 성공 시 루프 탈출
    } catch (err) {
      console.warn(`[Gemini API] Model ${modelName} failed. Falling back to next model...`, err);
    }
  }

  // 모든 모델이 실패하여 결과가 없을 경우 (Mock 데이터 최후 방어선)
  if (!result) {
    console.error(`[Gemini API] All models failed. Falling back to Mock Data.`);
    
    setTimeout(() => {
      alert("API 일일 할당량이 초과되어 임시 데이터로 일정을 생성했습니다.");
    }, 500);
    
    return getMockItinerary(plannerRequest);
  }

  try {
    let responseText = result.response.text();

    if (responseText.startsWith("\`\`\`json")) {
      responseText = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    }

    const parsedData = JSON.parse(responseText);
    console.log("AI Response:", parsedData);

    return {
      request: plannerRequest,
      days: parsedData.days
    };
  } catch (err) {
    console.error("Gemini API Parsing Error:", err);
    console.error(`[Gemini API] Parsing failed, falling back to Mock Data.`);
    
    setTimeout(() => {
      alert("API 일일 할당량이 초과되어 임시 데이터로 일정을 생성했습니다.");
    }, 500);
    
    return getMockItinerary(plannerRequest);
  }
}
