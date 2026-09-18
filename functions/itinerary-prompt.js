/**
 * Server-side itinerary prompt & schema construction.
 *
 * Moved out of the browser bundle so the Gemini API key never ships to the
 * client. The client sends a *structured* planner request (never a raw
 * prompt), so this endpoint cannot be abused as a generic LLM relay.
 */
"use strict";

const { MAX_DAYS, MAX_ANCHORS_PER_DAY } = require('./planner-request-validation.mjs');
const MAX_TEXT = 200;
const MAX_SHORT = 40;

const THEME_LABELS = {
  food: "맛집 탐방 (Food & Cuisine)",
  activity: "액티비티 (Activities & Adventures)",
  healing: "휴식/힐링 (Relaxation & Healing)",
  photo: "인생샷 (Photo-worthy Spots)"
};

const THEME_INSTRUCTIONS = {
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

const BUDGET_LABELS = {
  flex: "플렉스 / 고급형 (Premium & Luxury)",
  standard: "스탠다드 / 표준형 (Standard & Balanced)",
  budget: "짠내투어 / 절약형 (Budget-friendly)"
};

const BUDGET_INSTRUCTIONS = {
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

/**
 * Gemini `responseSchema` (OpenAPI subset, REST casing).
 * Mirrors docs/Schema.md — do not rename fields without updating that doc.
 */
const ITINERARY_SCHEMA = {
  type: "OBJECT",
  properties: {
    days: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "INTEGER" },
          date: { type: "STRING" },
          theme: { type: "STRING" },
          scheduleItems: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                time: { type: "STRING" },
                endTime: { type: "STRING" },
                type: { type: "STRING", description: "Must be one of: 'attraction', 'dining', 'leisure', 'AnchorSchedule'" },
                title: { type: "STRING" },
                description: { type: "STRING" },
                location: { type: "STRING", description: "Copy user location for anchors/boundaries; copy placeIntent.nearLocation for recommendations. Never invent an address." },
                placeIntent: {
                  type: "OBJECT",
                  description: "Ordinary recommendations describe a purpose, not a business. Fixed user locations use empty purpose.",
                  properties: {
                    purpose: { type: "STRING", description: "Activity goal without venue facts, e.g. Lunch near the museum." },
                    category: { type: "STRING", enum: ["restaurant", "cafe", "park", "museum", "tourist_attraction", "shopping_mall"] },
                    nearLocation: { type: "STRING", description: "Exact name of a user-provided departure, destination or anchor location." }
                  },
                  required: ["purpose", "category", "nearLocation"]
                },
                duration: { type: "STRING" },
                officialWebsiteUrl: { type: "STRING", description: "Empty string; the app verifies place data." },
                googleMapsUrl: { type: "STRING", description: "Empty string; the app builds a Place ID link after lookup." },
                transitInfo: { type: "STRING", description: "Empty string; actual routes are calculated after place resolution." },
                practicalInfo: {
                  type: "OBJECT",
                  properties: {
                    estimatedCost: { type: "STRING", description: "Expected cost per person (e.g. 'Approx. ₩15,000', 'Free entrance')" },
                    operatingHours: { type: "STRING", description: "Empty string; do not invent hours." },
                    localTip: { type: "STRING", description: "Empty string; no actual venue has been selected." },
                    top3Recommendations: {
                      type: "ARRAY",
                      description: "Always empty []; never invent venue names or ratings.",
                      items: {
                        type: "OBJECT",
                        properties: {
                          name: { type: "STRING", description: "Name of the venue" },
                          rating: { type: "STRING", description: "Rating of the venue, e.g. '4.3'" },
                          reviewUrl: { type: "STRING", description: "Google Maps search URL for reviews, e.g. https://www.google.com/maps/search/?api=1&query=[Place+Name]" },
                          directionUrl: { type: "STRING", description: "Google Maps directions URL, e.g. https://www.google.com/maps/dir/?api=1&destination=[Place+Name]" }
                        },
                        required: ["name", "rating", "reviewUrl", "directionUrl"]
                      }
                    }
                  },
                  required: ["estimatedCost", "operatingHours", "localTip", "top3Recommendations"]
                }
              },
              required: ["time", "endTime", "type", "title", "description", "location", "placeIntent", "duration", "googleMapsUrl", "transitInfo", "practicalInfo"]
            }
          }
        },
        required: ["day", "date", "theme", "scheduleItems"]
      }
    }
  },
  required: ["days"]
};

/** Strips control chars and caps length so injected text cannot balloon the prompt. */
function clampText(value, limit) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, limit || MAX_TEXT);
}

function getLocationName(location) {
  if (typeof location === "string") return clampText(location);
  if (!location || typeof location !== "object") return "";
  return clampText(location.displayName)
    || clampText(location.formattedAddress)
    || clampText(location.address);
}

function formatLocationForPrompt(location) {
  if (typeof location === "string") return clampText(location);
  if (!location || typeof location !== "object") return "";
  const name = clampText(location.displayName);
  const address = clampText(location.formattedAddress) || clampText(location.address);
  if (name && address && name !== address) return `${name} (${address})`;
  return name || address;
}

/**
 * Rebuilds the planner request from scratch, keeping only known fields.
 * Anything outside this shape is dropped before it can reach the prompt.
 */
function sanitizePlannerRequest(raw) {
  const input = raw && typeof raw === "object" ? raw : {};

  const dates = (Array.isArray(input.date) ? input.date : [input.date])
    .map(date => clampText(date, MAX_SHORT))
    .filter(Boolean)
    .slice(0, MAX_DAYS);

  const rawDaily = Array.isArray(input.dailyData) ? input.dailyData : [];
  const dayCount = Math.min(Math.max(dates.length, rawDaily.length), MAX_DAYS);

  const dailyData = Array.from({ length: dayCount }, (_, index) => {
    const day = rawDaily[index] && typeof rawDaily[index] === "object" ? rawDaily[index] : {};
    const anchors = (Array.isArray(day.anchors) ? day.anchors : [])
      .slice(0, MAX_ANCHORS_PER_DAY)
      .map(anchor => ({
        name: clampText(anchor && anchor.name),
        time: clampText(anchor && anchor.time, MAX_SHORT),
        endTime: clampText(anchor && anchor.endTime, MAX_SHORT),
        locationName: getLocationName(anchor && anchor.location)
      }))
      .filter(anchor => anchor.name || anchor.locationName);

    return {
      day: index + 1,
      date: clampText(day.date, MAX_SHORT) || dates[index] || dates[0] || "",
      startTime: clampText(day.startTime, MAX_SHORT),
      endTime: clampText(day.endTime, MAX_SHORT),
      startLocationText: formatLocationForPrompt(day.startLocation),
      endLocationText: formatLocationForPrompt(day.endLocation),
      anchors
    };
  });

  return {
    dates: dates.length > 0 ? dates : dailyData.map(day => day.date).filter(Boolean),
    dailyData,
    theme: THEME_INSTRUCTIONS[input.theme] ? input.theme : null,
    budget: BUDGET_INSTRUCTIONS[input.budget] ? input.budget : null
  };
}

function buildStyleBlock(constraints) {
  const { theme, budget } = constraints;
  if (!theme && !budget) return "";

  let block = "\n\nTRAVEL STYLE PARAMETERS (STRICTLY FOLLOW THESE):";
  if (theme) {
    block += `\n\n[THEME: ${THEME_LABELS[theme] || theme}]\n${THEME_INSTRUCTIONS[theme]}`;
  }
  if (budget) {
    block += `\n\n[BUDGET: ${BUDGET_LABELS[budget] || budget}]\n${BUDGET_INSTRUCTIONS[budget]}`;
  }
  block += "\n\nYou MUST strictly adhere to BOTH the theme and budget constraints above when selecting places, restaurants, activities, and transportation methods.";
  return block;
}

function buildPrompt(constraints, lang) {
  const { dates, dailyData } = constraints;

  const numDays = dates.length || 1;
  const datesContext = numDays > 1
    ? `You MUST plan a ${numDays}-day itinerary for the dates: ${dates.join(", ")}.`
    : `Plan a 1-day itinerary for the date ${dates[0] || "Unknown Date"}.`;

  const timeAndLocationParams = dailyData.map(day => {
    const startLoc = day.startLocationText || "Unknown";
    const endLoc = day.endLocationText || "Unknown";
    return `- [Day ${day.day}] Time: ${day.startTime} to ${day.endTime} | Start Location: "${startLoc}", End Location: "${endLoc}"`;
  }).join("\n");

  const allAnchors = [];
  dailyData.forEach(day => {
    day.anchors.forEach(anchor => allAnchors.push({ day: day.day, ...anchor }));
  });

  const anchorText = allAnchors.length > 0
    ? allAnchors.map((a, i) => `${i + 1}. [Day ${a.day}] "${a.name}" at ${a.time} to ${a.endTime} (Location: "${a.locationName || "Unknown"}")`).join("\n")
    : "No fixed AnchorSchedules provided. Free to plan the entire day.";

  const anchorRule = allAnchors.length > 0
    ? '1. You MUST include ScheduleItems with type="AnchorSchedule" that exactly match the time and location of the provided AnchorSchedules.'
    : '1. You may omit ScheduleItems of type="AnchorSchedule" since none were provided.';

  const langRule = lang === "ko"
    ? "ALL output text (titles, descriptions, themes) MUST be written in Korean language."
    : "ALL output text (titles, descriptions, themes) MUST be written in English language.";

  return `
You are an expert AI Travel Planner.
${datesContext}

PARAMETERS (Daily Constraints):
${timeAndLocationParams}

ANCHOR SCHEDULES (Must Attend):
${anchorText}
${buildStyleBlock(constraints)}

The primary goal is to ensure the user arrives at any AnchorSchedules seamlessly and exactly on time.
Fill the rest of the day with visit purposes near the user's fixed locations. Google Places, not you, selects the actual businesses. Copy a supplied fixed location into placeIntent.nearLocation and location; never invent a street address.
For every single place, you MUST provide a 'practicalInfo' object containing:
  - estimatedCost: Approximate spending per person in KRW or 'Free'.
  - operatingHours and localTip: empty strings; the actual venue is not yet known.
The first ScheduleItem of each day MUST start at the Start Location near that day's Start Time.
The last ScheduleItem of each day MUST end at the End Location near that day's End Time.

CRITICAL RULES:
${anchorRule}
2. Every ordinary recommendation MUST include placeIntent: purpose (activity goal), category (supported Google place type), nearLocation (exact name of a supplied fixed user location). Title and description describe the purpose, not a business. Google Places selects the actual venue. Never invent a venue name, address, Place ID, reviews or operating hours.
3. Obey the JSON schema exactly. googleMapsUrl, officialWebsiteUrl and transitInfo MUST be empty strings. The app populates verified links and routes later. Fixed boundary/anchor items retain the user's supplied identity and use an empty placeIntent.purpose.
4. Output ONLY valid JSON, do NOT include markdown backticks or any conversation.
5. ${langRule}
6. Transit realism: The 'description' and 'transitInfo' MUST match 100% in terms of transport mode and travel time. NEVER hallucinate physically impossible routes (e.g., taking a local village bus for 74km). Calculate logical transport modes and travel times based on actual geography in Korea.
7. Do not invent transfer stations or routes. Reserve conservative travel buffers; the app checks actual durations later.
8. Do not generate movement inside a venue as a separate stop.
9. top3Recommendations MUST always be []. operatingHours and localTip MUST be empty strings. No model-generated venue facts or star ratings.
10. Time Logic Rule (Rule 4): The total 'duration' value for any schedule item MUST be greater than or equal to the transit time stated in 'transitInfo'. You MUST NOT create a time paradox where the transit travel time EXCEEDS the total allocated duration for the item. (e.g., if transit is 40 minutes, duration must be at least 40 minutes).
11. Strict Cost Rule: 'estimatedCost' MUST have a concrete value or range (e.g., "₩10,000 - ₩15,000" or "Free"). Do NOT use "0 KRW" or leave it empty, and do NOT specify exact base fares for public transit (use "Public transit fare" instead).
12. [CRITICAL] Token Limit Prevention: 각 장소의 설명(description)은 1~2문장으로 압축하여 JSON 전체 용량을 최적화하라. DO NOT write long paragraphs for descriptions.
13. [CRITICAL] Meal Time Rule: Unless an AnchorSchedule forces otherwise, LUNCH ('dining') MUST start at 12:00 (12:00-12:30 acceptable) and DINNER ('dining') MUST start at 18:00 (18:00-18:30 acceptable). Every dining item MUST reserve at least 60 minutes of pure eating time EXCLUDING travel: the slot must be [travel time] + [60+ min eating]. NEVER schedule a meal slot that is mostly consumed by transit (e.g., a 65-minute lunch slot with 70 minutes of travel is FORBIDDEN).
14. [CRITICAL] Dining On-Route Rule: Restaurants and cafes MUST be located along the route between the previous and the next stop (within walking distance or a short ride). NEVER pick a restaurant that requires a long detour (more than 20 minutes of extra one-way travel) from the day's path.
15. [CRITICAL] Event Timing Realism Rule: If an attraction is explicitly a night-only or evening-only experience (its title/description mentions "야간" / "night" / "일루미네이션" / "illumination" / night market / night cruise / fireworks / night view, etc.), its 'time' MUST fall within a realistic evening window (18:00 or later). NEVER schedule a night-exclusive variant of a venue during daytime hours — if the plan needs that venue earlier in the day, use its regular daytime visit instead, not the night-only edition.
16. [CRITICAL] No Duplicate Meals Rule: Each day MUST contain AT MOST ONE late-morning/midday meal (breakfast, brunch, OR lunch — pick only one, they serve the same purpose) and AT MOST ONE dinner, for a maximum of 2 full-meal 'dining' items per day, plus at most 1-2 short cafe/snack stops. Exception: if the theme is food tourism ("food"), up to 4 dining stops are allowed, but consecutive dining items MUST still be spaced at least 3 hours apart. NEVER schedule a second lunch-like meal (e.g. a separate "lunch" stop) after a brunch already covered that time slot.
17. [CRITICAL] End-Time Hard Limit: NEVER schedule any ScheduleItem (including 'time' or transit legs) to start at or after that day's End Time. The day's actual last ScheduleItem MUST be the one ending at End Location at End Time — do not invent an extra "moving to end location" stop after it.
18. [CRITICAL] Departure Buffer Rule: You MUST reserve enough time to actually REACH the End Location before End Time. Work backwards: estimate the real travel time from the last activity to the End Location, then make the last activity end at least that long before End Time, PLUS a safety buffer. Use these buffers on top of travel time: at least 60 minutes if the End Location is an airport (check-in/security), at least 30 minutes for a train/bus terminal, at least 15 minutes otherwise. Example: End Time 21:00 at an airport reachable in 90 minutes -> the last activity MUST end by 21:00 - 90min - 60min = 19:30 at the latest. It is perfectly fine — and expected — for the day's activities to finish well before End Time; it is NEVER acceptable for the traveler to arrive late. Long-distance transfers (city center to airport) routinely take 60-120 minutes in Korea: budget generously, never optimistically.
19. [CRITICAL] No Fake Transit Stops Rule: The app itself renders the full real-world route (with every bus/subway transfer and walking leg) between any two consecutive ScheduleItems automatically — you MUST NOT invent your own intermediate ScheduleItem whose sole purpose is to narrate travel or a transfer point (e.g. "Moving to X Station", "Heading to the airport", "Transfer preparation"). This applies everywhere, but especially to the final leg of the day: the ScheduleItem immediately after the last real visit MUST be the End Location itself, even if reaching it requires multiple transfers — describe that whole multi-leg journey in the transitInfo of the End Location item, never as separate fake stops.
  `;
}

module.exports = {
  ITINERARY_SCHEMA,
  MAX_DAYS,
  buildPrompt,
  sanitizePlannerRequest
};
