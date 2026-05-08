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
                  transitInfo: { type: SchemaType.STRING, description: "Detailed transit route and estimated time from the previous location to this location. MUST include precise transfer stations. (e.g., 'Take Line 3 at Express Bus Terminal -> Transfer to Line 9 at Dongjak -> Alight at Samgakji (approx. 30 mins)')." },
                  practicalInfo: {
                    type: SchemaType.OBJECT,
                    properties: {
                      estimatedCost: { type: SchemaType.STRING, description: "Expected cost per person (e.g. 'Approx. ₩15,000', 'Free entrance')" },
                      operatingHours: { type: SchemaType.STRING, description: "General opening/closing hours and holidays (e.g. '10:00 - 22:00 (Closed on Mons)')" },
                      localTip: { type: SchemaType.STRING, description: "A SINGLE specific, highly actionable pro-tip ONLY (e.g. 'Catchtable app reservation is required', 'Signature menu: Einspanner coffee'). Do NOT include any restaurant/cafe recommendation lists here. NEVER write vague tips like 'Visit on weekdays'." },
                      top3Recommendations: {
                        type: SchemaType.ARRAY,
                        description: "ONLY for 'dining' or 'cafe' type items: List exactly 3 real, highly-rated (4.0+) specific venues near the location. Leave as an empty array [] for non-dining/cafe items.",
                        items: {
                          type: SchemaType.OBJECT,
                          properties: {
                            name: { type: SchemaType.STRING, description: "Name of the venue" },
                            rating: { type: SchemaType.STRING, description: "Rating of the venue, e.g. '4.3'" },
                            reviewUrl: { type: SchemaType.STRING, description: "Google Maps search URL for reviews, e.g. https://www.google.com/maps/search/?api=1&query=[Place+Name]" },
                            directionUrl: { type: SchemaType.STRING, description: "Google Maps directions URL, e.g. https://www.google.com/maps/dir/?api=1&destination=[Place+Name]" }
                          },
                          required: ["name", "rating", "reviewUrl", "directionUrl"]
                        }
                      }
                    },
                    required: ["estimatedCost", "operatingHours", "localTip", "top3Recommendations"]
                  }
                },
                required: ["time", "endTime", "type", "title", "description", "location", "duration", "googleMapsUrl", "transitInfo", "practicalInfo"]
              }
            }
          },
          required: ["day", "date", "theme", "scheduleItems"]
        }
      }
    },
    required: ["days"]
  };

  const allAnchors = [];
  if (plannerRequest.dailyData) {
    plannerRequest.dailyData.forEach(day => {
      if (day.anchors && day.anchors.length > 0) {
        day.anchors.forEach(a => {
          const locName = a.location?.displayName || a.location || "Unknown";
          allAnchors.push({ day: day.day, name: a.name, time: a.time, endTime: a.endTime, location: locName });
        });
      }
    });
  }

  const anchorText = allAnchors.length > 0
    ? allAnchors.map((a, i) => `${i + 1}. [Day ${a.day}] "${a.name}" at ${a.time} to ${a.endTime} (Location: "${a.location}")`).join('\\n')
    : "No fixed AnchorSchedules provided. Free to plan the entire day.";

  const anchorRule = allAnchors.length > 0
    ? `1. You MUST include ScheduleItems with type="AnchorSchedule" that exactly match the time and location of the provided AnchorSchedules.`
    : `1. You may omit ScheduleItems of type="AnchorSchedule" since none were provided.`;

  const currentLang = getLang();
  const langRule = currentLang === 'ko'
    ? 'ALL output text (titles, descriptions, themes) MUST be written in Korean language.'
    : 'ALL output text (titles, descriptions, themes) MUST be written in English language.';

  // ====== 테마 & 예산 스타일 프롬프트 주입 ======
  const themeLabels = {
    food: '맛집 탐방 (Food & Cuisine)',
    activity: '액티비티 (Activities & Adventures)',
    healing: '휴식/힐링 (Relaxation & Healing)',
    photo: '인생샷 (Photo-worthy Spots)'
  };

  const themeInstructions = {
    food: `The travel theme is "Food & Cuisine Tour". You MUST prioritize:
  - Famous local restaurants, hidden gem eateries, traditional markets, dessert shops, and trendy cafes.
  - Allocate generous time for meals (at least 1-1.5 hours per dining stop).
  - Include at least 2-3 food-related stops per day.
  - Recommend dishes that are signature to the region.`,
    activity: `The travel theme is "Activities & Adventures". You MUST prioritize:
  - Experience-based activities: surfing, hiking, cultural workshops, theme parks, water sports, cycling.
  - Include physically engaging stops and hands-on experiences.
  - Balance active stops with short rest/refreshment breaks.
  - Recommend activities suitable for the season and weather.`,
    healing: `The travel theme is "Relaxation & Healing". You MUST prioritize:
  - Serene natural landscapes, hot springs, quiet parks, botanical gardens, temple stays, peaceful cafes.
  - Minimize travel distance between stops to reduce fatigue.
  - Include longer stay durations at each spot (1.5-2 hours).
  - Avoid crowded tourist traps; prefer hidden, tranquil spots.`,
    photo: `The travel theme is "Instagram-worthy Photo Spots". You MUST prioritize:
  - Popular photo spots, scenic viewpoints, aesthetic cafes, murals, rooftop bars, iconic landmarks.
  - Consider lighting conditions (golden hour spots in morning/evening).
  - Include unique and visually stunning locations.
  - Recommend specific spots within venues for best photo opportunities.`
  };

  const budgetLabels = {
    flex: '플렉스 / 고급형 (Premium & Luxury)',
    standard: '스탠다드 / 표준형 (Standard & Balanced)',
    budget: '짠내투어 / 절약형 (Budget-friendly)'
  };

  const budgetInstructions = {
    flex: `The budget style is "Premium / Luxury (Flex)". You MUST:
  - Assume the traveler uses rental car or taxi for ALL transportation (no public transit).
  - Recommend fine dining restaurants, premium buffets, high-end cafes, and Michelin-starred venues.
  - Suggest luxury experiences: private tours, premium tickets, VIP access.
  - Estimated costs should reflect premium pricing (₩50,000+ per meal, ₩30,000+ per attraction).
  - Prioritize comfort and exclusivity over cost savings.`,
    standard: `The budget style is "Standard / Balanced". You MUST:
  - Mix public transport (subway, bus) with occasional taxi for convenience.
  - Recommend mid-range restaurants (₩10,000-₩25,000 per meal) with good value.
  - Balance paid attractions with free/low-cost options.
  - Suggest a mix of popular spots and local favorites.`,
    budget: `The budget style is "Budget-friendly (짠내투어)". You MUST:
  - Use ONLY public transportation (subway, bus, walking). NO taxis or rental cars.
  - Recommend street food, local markets, budget-friendly eateries (under ₩10,000 per meal).
  - Prioritize FREE attractions: parks, temples, street art, public viewpoints, free museums.
  - Suggest money-saving tips in localTip fields (e.g., discount passes, free entry days).
  - Minimize overall estimated spending per person.`
  };

  const userTheme = plannerRequest.theme || null;
  const userBudget = plannerRequest.budget || null;

  let stylePromptBlock = '';
  if (userTheme || userBudget) {
    stylePromptBlock = `\n\nTRAVEL STYLE PARAMETERS (STRICTLY FOLLOW THESE):`;
    if (userTheme && themeInstructions[userTheme]) {
      stylePromptBlock += `\n\n[THEME: ${themeLabels[userTheme] || userTheme}]\n${themeInstructions[userTheme]}`;
    }
    if (userBudget && budgetInstructions[userBudget]) {
      stylePromptBlock += `\n\n[BUDGET: ${budgetLabels[userBudget] || userBudget}]\n${budgetInstructions[userBudget]}`;
    }
    stylePromptBlock += `\n\nYou MUST strictly adhere to BOTH the theme and budget constraints above when selecting places, restaurants, activities, and transportation methods.`;
  }

  let datesContext = '';
  let dateText = plannerRequest.date; // fallback if string
  let numDays = 1;

  if (Array.isArray(plannerRequest.date)) {
    numDays = plannerRequest.date.length;
    if (numDays > 1) {
      dateText = `${plannerRequest.date[0]} to ${plannerRequest.date[numDays - 1]}`;
      datesContext = `You MUST plan a ${numDays}-day itinerary for the dates: ${plannerRequest.date.join(', ')}.`;
    } else {
      dateText = plannerRequest.date[0];
      datesContext = `Plan a 1-day itinerary for the date ${dateText}.`;
    }
  } else {
    datesContext = `Plan a 1-day itinerary for the date ${dateText}.`;
  }

  let timeAndLocationParams = '';
  if (plannerRequest.dailyData && plannerRequest.dailyData.length > 0) {
    timeAndLocationParams = plannerRequest.dailyData.map(day => {
      const startLoc = day.startLocation?.formattedAddress 
          ? `${day.startLocation.displayName} (${day.startLocation.formattedAddress})` 
          : (day.startLocation?.displayName || "Unknown");
      const endLoc = day.endLocation?.formattedAddress 
          ? `${day.endLocation.displayName} (${day.endLocation.formattedAddress})` 
          : (day.endLocation?.displayName || "Unknown");
      return `- [Day ${day.day}] Time: ${day.startTime} to ${day.endTime} | Start Location: "${startLoc}", End Location: "${endLoc}"`;
    }).join('\\n');
  }

  const prompt = `
You are an expert AI Travel Planner.
${datesContext}

PARAMETERS (Daily Constraints):
${timeAndLocationParams}

ANCHOR SCHEDULES (Must Attend):
${anchorText}
${stylePromptBlock}

The primary goal is to ensure the user arrives at any AnchorSchedules seamlessly and exactly on time.
Fill the rest of the day prior to and after the AnchorSchedules with highly-rated attractions, cafes, and restaurants geographically close to the route to minimize travel time. Provide REAL street addresses or recognizable place names in Korea in the location fields so Google Maps can geocode them.
For every single place, you MUST provide a 'practicalInfo' object containing:
  - estimatedCost: Approximate spending per person in KRW or 'Free'.
  - operatingHours: Opening hours and regular holidays.
  - localTip: A crucial pro-tip specially for tourists in Korea (e.g. availability of English menus, tax-free info, or waiting time advice).
The first ScheduleItem of each day MUST start at the Start Location near that day's Start Time.
The last ScheduleItem of each day MUST end at the End Location near that day's End Time.

CRITICAL RULES:
${anchorRule}
2. All alternative locations MUST be real places in Korea, close to the route.
3. Obey the JSON schema exactly. You MUST provide a valid 'googleMapsUrl' for every single schedule item. Provide 'officialWebsiteUrl' if available, otherwise an empty string.
4. Output ONLY valid JSON, do NOT include markdown backticks or any conversation.
5. ${langRule}
6. Transit realism: The 'description' and 'transitInfo' MUST match 100% in terms of transport mode and travel time. NEVER hallucinate physically impossible routes (e.g., taking a local village bus for 74km). Calculate logical transport modes and travel times based on actual geography in Korea.
7. Detailed Transit Route: If taking public transit, 'transitInfo' MUST specify exact departure, transfer, and arrival points (e.g. "[Board at A Station -> Transfer at B Station -> Alight at C Station]").
8. Explicit Transit Exception (Rule 1): If an activity occurs entirely within one single venue (e.g., Palace Viewing, Museum Exhibition, Theme Park), DO NOT generate fake physical movement texts like "Walking inside the palace" in 'transitInfo'. You MUST write explicitly "[Place Name] Viewing" or "[Place Name] Experience" instead.
9. Dining & Cafe Data Split (Rule 2 & 3): For ANY 'dining' or 'cafe' type schedule item, you MUST split the recommendation data into TWO separate fields:
   - 'localTip': Write ONE single, specific, highly actionable tip ONLY (e.g., 'Remote queuing via the Catchtable app is essential', 'Signature menu: Einspanner coffee'). You are STRICTLY FORBIDDEN from writing vague tips like 'Visit on weekdays' or 'Arrive early'. Do NOT put any restaurant/cafe list in this field.
   - 'top3Recommendations': Generate an array of EXACTLY 3 objects for real, highly-rated (4.0+) venues near the location. Each object MUST contain:
     * 'name': the venue's name (string)
     * 'rating': the venue's rating as a string (e.g., "4.3")
     * 'reviewUrl': a Google Maps search URL for the venue's reviews (e.g., "https://www.google.com/maps/search/?api=1&query=[Venue+Name+encoded]")
     * 'directionUrl': a Google Maps directions URL to the venue (e.g., "https://www.google.com/maps/dir/?api=1&destination=[Venue+Name+encoded]")
   For non-dining/non-cafe items, set 'top3Recommendations' to an empty array [].
10. Time Logic Rule (Rule 4): The total 'duration' value for any schedule item MUST be greater than or equal to the transit time stated in 'transitInfo'. You MUST NOT create a time paradox where the transit travel time EXCEEDS the total allocated duration for the item. (e.g., if transit is 40 minutes, duration must be at least 40 minutes).
11. Strict Cost Rule: 'estimatedCost' MUST have a concrete value or range (e.g., "₩10,000 - ₩15,000" or "Free"). Do NOT use "0 KRW" or leave it empty, and do NOT specify exact base fares for public transit (use "Public transit fare" instead).
12. [CRITICAL] Token Limit Prevention: 각 장소의 설명(description)은 1~2문장으로 압축하여 JSON 전체 용량을 최적화하라. DO NOT write long paragraphs for descriptions.
  `;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const maxRetries = 2; // 최대 2회 재시도 (503 에러 등)
  const delays = [1000, 2000];
  let hasDispatchedRetryEvent = false;

  const getMockItinerary = (constraints) => {
    const currentLang = getLang();
    const isKo = currentLang === 'ko';
    
    // Determine days
    let dates = ["Unknown Date"];
    if (Array.isArray(constraints.date) && constraints.date.length > 0) {
      dates = constraints.date;
    } else if (typeof constraints.date === 'string') {
      dates = [constraints.date];
    }

    const mockDays = dates.map((d, index) => {
      return {
        day: index + 1,
        date: d,
        theme: isKo ? "임시 생성된 일정" : "Mock Generated Itinerary",
        scheduleItems: [
          {
            time: constraints.dailyData ? constraints.dailyData[index]?.startTime : "09:00",
            endTime: "10:00",
            type: "attraction",
            title: isKo ? "출발지" : "Start Location",
            description: isKo ? "일정을 시작합니다." : "Start of the itinerary.",
            location: constraints.dailyData ? (constraints.dailyData[index]?.startLocation?.displayName || "Unknown Location") : "Unknown Location",
            duration: "1h",
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(constraints.startLocation || "Seoul")}`,
            practicalInfo: {
              estimatedCost: "Free",
              operatingHours: "24/7",
              localTip: isKo ? "안전한 여행 되세요." : "Have a safe trip.",
              top3Recommendations: []
            }
          },
          ...((constraints.dailyData ? constraints.dailyData[index]?.anchors || [] : []).map((a) => ({
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
              localTip: "N/A",
              top3Recommendations: []
            }
          }))),
          {
            time: "18:00",
            endTime: constraints.dailyData ? constraints.dailyData[index]?.endTime : "19:00",
            type: "attraction",
            title: isKo ? "도착지" : "End Location",
            description: isKo ? "일정을 마무리합니다." : "End of the itinerary.",
            location: constraints.dailyData ? (constraints.dailyData[index]?.endLocation?.displayName || "Unknown Location") : "Unknown Location",
            duration: "1h",
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(constraints.endLocation || "Seoul")}`,
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
      days: mockDays
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
    const generatedText = result.response.text();
    let parsedJson = JSON.parse(generatedText);
    
    // JSON Schema Validation (Safety check)
    if (!parsedJson.days || !Array.isArray(parsedJson.days) || parsedJson.days.length === 0) {
      throw new Error("Invalid Output: Expected 'days' array to be present and not empty.");
    }
    
    // Ensure all days have scheduleItems
    parsedJson.days = parsedJson.days.filter(d => Array.isArray(d.scheduleItems) && d.scheduleItems.length > 0);
    if (parsedJson.days.length === 0) {
        throw new Error("Invalid Output: 'days' array contains no valid scheduleItems.");
    }

    const safePlan = {
      request: plannerRequest,
      days: parsedJson.days
    };
    return safePlan;
  } catch (err) {
    console.error("Gemini API Parsing Error:", err);
    console.error(`[Gemini API] Parsing failed, falling back to Mock Data.`);
    
    setTimeout(() => {
      alert("API 일일 할당량이 초과되어 임시 데이터로 일정을 생성했습니다.");
    }, 500);
    
    return getMockItinerary(plannerRequest);
  }
}

export const GeminiOptimizer = {
  generateOptimizedItinerary
};
