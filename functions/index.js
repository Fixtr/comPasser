const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

const {
    ITINERARY_SCHEMA,
    buildPrompt,
    sanitizePlannerRequest
} = require("./itinerary-prompt");

// Firebase Admin SDK 초기화
admin.initializeApp();

exports.verifySocialToken = functions.https.onRequest((req, res) => {
    // CORS 및 Preflight(OPTIONS) 요청 허용을 위해 전체 로직을 cors로 래핑
    cors(req, res, async () => {
        try {
            // 클라이언트(httpsCallable) 호출 시 데이터는 req.body.data에 담겨서 옵니다.
            const requestData = req.body.data;
            if (!requestData) {
                throw new Error("요청 데이터가 올바르지 않습니다.");
            }

            const { provider, token } = requestData;

            // 파라미터 검증
            if (!provider || !token) {
                throw new Error("제공자(provider)와 액세스 토큰(token)은 필수 항목입니다.");
            }

            let uid = null;
            let userInfo = {
                email: null,
                displayName: null,
                photoURL: null,
            };

            // 1. 소셜 플랫폼 API를 통한 토큰 검증 및 프로필 획득
            if (provider === "kakao") {
                const response = await axios.get("https://kapi.kakao.com/v2/user/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = response.data;

                uid = `kakao:${data.id}`;
                userInfo.email = data.kakao_account?.email;
                userInfo.displayName = data.properties?.nickname;
                userInfo.photoURL = data.properties?.profile_image;

            } else if (provider === "naver") {
                const response = await axios.get("https://openapi.naver.com/v1/nid/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = response.data.response;

                uid = `naver:${data.id}`;
                userInfo.email = data.email;
                userInfo.displayName = data.name || data.nickname;
                userInfo.photoURL = data.profile_image;

            } else {
                throw new Error("지원하지 않는 소셜 로그인 플랫폼입니다. ('kakao' 또는 'naver' 만 가능)");
            }

            // 2. Firebase Auth 유저 확인/생성 및 커스텀 토큰 발급
            try {
                // 가입된 유저인지 확인
                await admin.auth().getUser(uid);
            } catch (error) {
                // 미가입자(user-not-found)인 경우 신규 유저 생성
                if (error.code === "auth/user-not-found") {
                    const userRecordData = { uid };

                    // 파싱해온 프로필 데이터 중 존재하는 값만 할당
                    if (userInfo.email) userRecordData.email = userInfo.email;
                    if (userInfo.displayName) userRecordData.displayName = userInfo.displayName;
                    if (userInfo.photoURL) userRecordData.photoURL = userInfo.photoURL;

                    await admin.auth().createUser(userRecordData);
                    console.log(`New user created: ${uid}`);
                } else {
                    throw error; // 다른 Auth 에러는 위로 던짐
                }
            }

            // 커스텀 토큰 생성
            const customToken = await admin.auth().createCustomToken(uid);

            // 성공 응답: 클라이언트의 httpsCallable은 응답이 { data: ... } 형태로 오길 기대합니다.
            return res.status(200).send({ data: { customToken: customToken } });

        } catch (error) {
            const provider = req.body?.data?.provider || 'UnknownProvider';

            // Axios API 통신 에러인 경우 (error.response 존재)
            if (error.response) {
                console.error(`[${provider}] API Error:`, error.response.status, error.message);
            } else {
                // 기타 내부 로직 및 검증 에러
                console.error(`[${provider}] Token Verification Error:`, error.message);
            }

            // 클라이언트에게는 500 에러와 함께 구조화된 에러 메시지 전송
            return res.status(500).send({ data: { error: error.message } });
        }
    });
});

// =====================================================================
// AI 일정 생성 (Gemini)
// ---------------------------------------------------------------------
// Gemini API 키는 Secret Manager에만 존재하며 프론트엔드 번들에 포함되지
// 않습니다. 클라이언트는 프롬프트가 아니라 '구조화된 제약 조건'만 보내므로
// 이 엔드포인트를 범용 LLM 중계기로 악용할 수 없습니다.
//
//   배포 전 1회:  firebase functions:secrets:set GEMINI_API_KEY
//   에뮬레이터:   functions/.env.local 에 GEMINI_API_KEY=... 작성
// =====================================================================

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
const GEMINI_TIMEOUT_MS = 90000;

/** 단일 모델 호출. 실패 시 throw 하여 상위에서 다음 모델로 폴백한다. */
async function callGemini(model, apiKey, prompt) {
    const response = await axios.post(
        `${GEMINI_ENDPOINT}/${model}:generateContent`,
        {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: ITINERARY_SCHEMA
            }
        },
        {
            // 키를 쿼리스트링이 아닌 헤더로 전달해 로그/프록시에 남지 않게 한다.
            headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
            timeout: GEMINI_TIMEOUT_MS
        }
    );

    const candidate = response.data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text = (candidate?.content?.parts || [])
        .map(part => part.text)
        .filter(Boolean)
        .join("");

    if (finishReason === "MAX_TOKENS") {
        throw new Error(`Truncated response from ${model} (MAX_TOKENS)`);
    }
    if (!text) {
        throw new Error(`Empty response from ${model} (finishReason: ${finishReason || "unknown"})`);
    }

    return text;
}

exports.generateItinerary = onCall(
    {
        secrets: [GEMINI_API_KEY],
        timeoutSeconds: 300,
        memory: "512MiB",
        maxInstances: 10
    },
    async (request) => {
        // /plan 은 로그인 사용자 전용이다. 미인증 호출로 API 할당량이 소모되는 것을 막는다.
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인 후 이용할 수 있습니다.");
        }

        const apiKey = GEMINI_API_KEY.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "서버에 Gemini API 키가 설정되지 않았습니다.");
        }

        const constraints = sanitizePlannerRequest(request.data?.request);
        if (constraints.dailyData.length === 0) {
            throw new HttpsError("invalid-argument", "여행 일정 조건이 비어 있습니다.");
        }

        const lang = request.data?.lang === "en" ? "en" : "ko";
        const prompt = buildPrompt(constraints, lang);

        let lastError = null;

        for (const model of GEMINI_MODELS) {
            try {
                const rawText = await callGemini(model, apiKey, prompt);
                const parsed = JSON.parse(rawText);

                const days = Array.isArray(parsed.days)
                    ? parsed.days.filter(day => Array.isArray(day.scheduleItems) && day.scheduleItems.length > 0)
                    : [];

                if (days.length === 0) {
                    throw new Error("Invalid output: 'days' contains no valid scheduleItems.");
                }

                functions.logger.info("[generateItinerary] success", {
                    uid: request.auth.uid,
                    model,
                    dayCount: days.length
                });

                return { days, model };
            } catch (error) {
                lastError = error;
                // 프롬프트/키는 절대 로깅하지 않는다.
                functions.logger.warn("[generateItinerary] model failed", {
                    uid: request.auth.uid,
                    model,
                    status: error.response?.status || null,
                    message: error.message
                });
            }
        }

        const status = lastError?.response?.status;
        if (status === 429) {
            throw new HttpsError("resource-exhausted", "AI 사용량(429)이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
        }
        throw new HttpsError("internal", "일정 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
);
