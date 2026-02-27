import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

/**
 * Calls the real Gemini API to generate an optimized itinerary.
 * Uses GEMINI_API_KEY Exposed through Vite Configuration.
 */
export async function generateOptimizedItinerary(eventData) {
  console.log("Calling Gemini AI Optimizer with constraints:", eventData);

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
            events: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  time: { type: SchemaType.STRING },
                  endTime: { type: SchemaType.STRING },
                  type: { type: SchemaType.STRING, description: "Must be one of: 'attraction', 'dining', 'leisure', 'anchor'" },
                  title: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING },
                  location: { type: SchemaType.STRING, description: "Specific real world Address or accurate Place Name in Korea" },
                  duration: { type: SchemaType.STRING }
                },
                required: ["time", "endTime", "type", "title", "description", "location", "duration"]
              }
            }
          },
          required: ["day", "date", "theme", "events"]
        }
      }
    },
    required: ["days"]
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: itinerarySchema,
    }
  });

  const anchorText = eventData.anchors && eventData.anchors.length > 0
    ? eventData.anchors.map((a, i) => `${i + 1}. "${a.name}" at ${a.time} to ${a.endTime} (Location: "${a.location}")`).join('\\n')
    : "No fixed anchor events provided. Free to plan the entire day.";

  const anchorRule = eventData.anchors && eventData.anchors.length > 0
    ? `1. You MUST include events with type="anchor" that exactly match the time and location of the provided Anchor Events.`
    : `1. You may omit events of type="anchor" since none were provided.`;

  const prompt = `
You are an expert AI Travel Planner.
Plan a 1-day itinerary for the date ${eventData.date}.

PARAMETERS:
- Start Time: ${eventData.startTime}
- End Time: ${eventData.endTime}
- Start Location (e.g. Hotel): "${eventData.startLocation}"
- End Location (e.g. Hotel): "${eventData.endLocation}"

ANCHOR EVENTS (Must Attend):
${anchorText}

The primary goal is to ensure the user arrives at any Anchor Events seamlessly and exactly on time.
Fill the rest of the day prior to and after the Anchor Events with highly-rated attractions, cafes, and restaurants geographically close to the route to minimize travel time. Provide REAL street addresses or recognizable place names in Korea in the location fields so Google Maps can geocode them.
The first event of the day MUST start at the Start Location near the Start Time.
The last event of the day MUST end at the End Location near the End Time.

CRITICAL RULES:
${anchorRule}
2. All alternative locations MUST be real places in Korea, close to the route.
3. Obey the JSON schema exactly.
4. Output ONLY valid JSON, do NOT include markdown backticks or any conversation.
  `;

  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response.text();

    // Sometimes AI includes markdown tags around JSON
    if (responseText.startsWith("\`\`\`json")) {
      responseText = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    }

    const parsedData = JSON.parse(responseText);

    // Merge the input metadata back in for reference
    return {
      request: eventData,
      days: parsedData.days
    };
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw new Error("Failed to generate itinerary from AI.");
  }
}
