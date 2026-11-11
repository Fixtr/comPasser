const functions = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { deletePublicationReviews } = require('./course-review-cleanup');
const { error: logError } = require('firebase-functions/logger');
const { createAccountDeletion } = require('./account-deletion');
const { createGenerationCredits, generationRecovery } = require('./generation-credits');
const { randomUUID } = require('node:crypto');
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const { findPlannerRequestIssue } = require('./planner-request-validation.mjs');
const { getSeoulCrowd } = require('./seoul-crowd');
const { createDiscoverySaves } = require('./discovery-saves');
const { createPlaceRecommendations, createRecommendationLimiter, validateRecommendationInput } = require('./place-recommendations');
const { createTripWeather, validateTripWeatherInput } = require('./trip-weather');

const {
    ITINERARY_SCHEMA,
    buildPrompt,
    sanitizePlannerRequest
} = require("./itinerary-prompt");

// Firebase Admin SDK 초기화
admin.initializeApp();

const accountDeletion = createAccountDeletion({ db: admin.firestore(), auth: admin.auth(), log: logError });
const generationCredits = createGenerationCredits({ db: admin.firestore() });
const discoverySaves = createDiscoverySaves({ db: admin.firestore() });
const isGenerationAdmin = user => user.email === 'sunkyu821@gmail.com' && user.emailVerified === true;
function assertCurrentIdentity(request, user) {
    if (!Number.isFinite(Number(request.auth.token?.auth_time))
        || Number(request.auth.token.auth_time) < Math.floor(Date.parse(user.metadata.creationTime) / 1000)) {
        throw new HttpsError('unauthenticated', '다시 로그인해 주세요.');
    }
    if (request.auth.token.firebase?.sign_in_provider === 'password' && user.emailVerified !== true) {
        throw new HttpsError('permission-denied', '이메일 인증 후 다시 로그인해 주세요.', { reason: 'email-not-verified' });
    }
}
const deletionHandler = handler => async request => {
    try { return await handler(request); }
    catch (error) {
        if (['unauthenticated', 'invalid-argument', 'failed-precondition'].includes(error.code)) {
            throw new HttpsError(error.code, error.message, error.details);
        }
        console.error('Account deletion endpoint failed', { code: error.code || 'unknown' });
        throw new HttpsError('unavailable', 'Unable to confirm deletion status.');
    }
};
exports.requestAccountDeletion = onCall({ timeoutSeconds: 60, maxInstances: 5 }, deletionHandler(accountDeletion.requestDeletion));
exports.cleanupCourseReviews = onDocumentWritten({ document: 'public_courses/{courseId}', retry: true, timeoutSeconds: 540, maxInstances: 5 }, event => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || (after && before.createdAt?.isEqual?.(after.createdAt))) return;
    return deletePublicationReviews(admin.firestore(), event.params.courseId, before.createdAt);
});
exports.getAccountDeletionStatus = onCall({ timeoutSeconds: 30, maxInstances: 5 }, deletionHandler(accountDeletion.status));
exports.getSeoulCrowd = onCall({ timeoutSeconds: 10, maxInstances: 5 }, async () => {
    try { return await getSeoulCrowd(); }
    catch (error) {
        console.error('Seoul crowd unavailable:', error.message);
        throw new HttpsError('unavailable', '서울 실시간 혼잡 정보를 불러올 수 없습니다.');
    }
});
exports.setDiscoveryPlaceSaved = onCall({ timeoutSeconds: 15, maxInstances: 5 }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const user = await admin.auth().getUser(request.auth.uid);
    assertCurrentIdentity(request, user);
    return deletionHandler(() => discoverySaves.setSaved(request.auth.uid, user.metadata.creationTime,
        Number(request.auth.token.auth_time), request.data?.placeId, request.data?.saved))(request);
});
exports.retryAccountDeletions = onSchedule({ schedule: 'every 5 minutes', timeoutSeconds: 60, maxInstances: 1 }, accountDeletion.retryDue);

exports.getGenerationCredits = onCall({ timeoutSeconds: 30, maxInstances: 5 }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인 후 이용할 수 있습니다.');
    await deletionHandler(() => accountDeletion.assertNotDeleting(request.auth.uid))(request);
    const user = await admin.auth().getUser(request.auth.uid);
    assertCurrentIdentity(request, user);
    return deletionHandler(() => generationCredits.balance(request.auth.uid, user.metadata.creationTime, isGenerationAdmin(user)))(request);
});

// adMobRewardCallback is paused (2026-10-21): ADMOB_REWARDED_AD_UNITS was never configured, so every callback failed.
// admob-reward.js and grantAdReward stay; restore the export and its verifier from git history when ad units exist.

// Without a provider id every such caller would share one real account named kakao:undefined.
const SOCIAL_PROFILE_MISSING = '소셜 계정 정보를 확인할 수 없습니다.';
// Only these validation messages reach the client; provider and SDK errors can carry internal detail.
const socialError = message => Object.assign(new Error(message), { expose: true });

exports.verifySocialToken = functions.https.onRequest((req, res) => {
    // CORS 및 Preflight(OPTIONS) 요청 허용을 위해 전체 로직을 cors로 래핑
    cors(req, res, async () => {
        try {
            // 클라이언트(httpsCallable) 호출 시 데이터는 req.body.data에 담겨서 옵니다.
            const requestData = req.body.data;
            if (!requestData) {
                throw socialError("요청 데이터가 올바르지 않습니다.");
            }

            const { provider, token } = requestData;

            // 파라미터 검증
            if (!provider || !token) {
                throw socialError("제공자(provider)와 액세스 토큰(token)은 필수 항목입니다.");
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
                if (!data?.id) throw socialError(SOCIAL_PROFILE_MISSING);

                uid = `kakao:${data.id}`;
                userInfo.email = data.kakao_account?.email;
                userInfo.displayName = data.properties?.nickname;
                userInfo.photoURL = data.properties?.profile_image;

            } else if (provider === "naver") {
                const response = await axios.get("https://openapi.naver.com/v1/nid/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                // A failed Naver lookup still answers 200, with resultcode other than '00' and no response.
                const data = response.data?.response;
                if (!data?.id) throw socialError(SOCIAL_PROFILE_MISSING);

                uid = `naver:${data.id}`;
                userInfo.email = data.email;
                userInfo.displayName = data.name || data.nickname;
                userInfo.photoURL = data.profile_image;

            } else {
                throw socialError("지원하지 않는 소셜 로그인 플랫폼입니다. ('kakao' 또는 'naver' 만 가능)");
            }

            // 2. Firebase Auth 유저 확인/생성 및 커스텀 토큰 발급
            await accountDeletion.assertNotDeleting(uid);
            try {
                // 가입된 유저인지 확인
                await admin.auth().getUser(uid);
            } catch (error) {
                // 미가입자(user-not-found)인 경우 신규 유저 생성
                if (error.code === "auth/user-not-found") {
                    await accountDeletion.assertNotDeleting(uid);
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
            await accountDeletion.assertNotDeleting(uid);
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
            return res.status(500).send({ data: { error: error.expose ? error.message : '소셜 로그인을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' } });
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
const GOOGLE_MAPS_SERVER_KEY = defineSecret('GOOGLE_MAPS_SERVER_KEY');
const recommendPlaces = createPlaceRecommendations({axios,
    getKeys: () => ({gemini:GEMINI_API_KEY.value(),maps:GOOGLE_MAPS_SERVER_KEY.value()}),
    reserveRequest:createRecommendationLimiter({db:admin.firestore()}),
});
// 300s: worst case (search+backup, format, weather, 6 Places lookups) passes 180s; the client waits 310s.
exports.recommendPlaces = onCall({secrets:[GEMINI_API_KEY,GOOGLE_MAPS_SERVER_KEY],timeoutSeconds:300,maxInstances:3}, async request => {
    try {
        validateRecommendationInput(request.data);
        if (request.auth) {
            await deletionHandler(() => accountDeletion.assertNotDeleting(request.auth.uid))(request);
            const user = await admin.auth().getUser(request.auth.uid);
            assertCurrentIdentity(request,user);
        }
        return await recommendPlaces(request);
    }
    catch (error) {
        if (['unauthenticated','permission-denied','invalid-argument','failed-precondition','resource-exhausted','unavailable','not-found'].includes(error.code)) throw new HttpsError(error.code,error.message,error.details);
        throw new HttpsError('unavailable','recommendation-unavailable');
    }
});

const tripWeather = createTripWeather({axios, getKey: () => GOOGLE_MAPS_SERVER_KEY.value(), db: admin.firestore()});
// Hourly rain for a trip day today or tomorrow. Signed-in only, per-uid hourly limit, hourly shared cache.
exports.getTripWeather = onCall({secrets:[GOOGLE_MAPS_SERVER_KEY],timeoutSeconds:40,maxInstances:3}, async request => {
    try {
        if (!request.auth) throw Object.assign(new Error('weather-auth'), {code:'unauthenticated'});
        const input = validateTripWeatherInput(request.data);
        await deletionHandler(() => accountDeletion.assertNotDeleting(request.auth.uid))(request);
        const user = await admin.auth().getUser(request.auth.uid);
        assertCurrentIdentity(request,user);
        return await tripWeather(request.auth.uid,input);
    }
    catch (error) {
        if (['unauthenticated','permission-denied','invalid-argument','failed-precondition','resource-exhausted'].includes(error.code)) throw new HttpsError(error.code,error.message,error.details);
        throw new HttpsError('unavailable','weather-unavailable');
    }
});

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-3.5-flash-lite"];
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

        // Reject malformed input before defaults, account reads, secrets or AI.
        const { request: legacyRequest, recoverableRequest, lang: requestedLang, requestId } = request.data ?? {};
        const plannerRequest = requestId === undefined ? legacyRequest : recoverableRequest;
        const issue = findPlannerRequestIssue(plannerRequest);
        if (issue) {
            throw new HttpsError("invalid-argument", "여행 일정 조건을 확인해 주세요.", issue);
        }
        const constraints = sanitizePlannerRequest(plannerRequest);
        const lang = requestedLang === "en" ? "en" : "ko";
        let recovery;
        try {
            recovery = generationRecovery(requestId, { constraints, lang });
        } catch (error) {
            throw new HttpsError(error.code, error.message, error.details);
        }

        await deletionHandler(() => accountDeletion.assertNotDeleting(request.auth.uid))(request);

        const uid = request.auth.uid;
        const user = await admin.auth().getUser(uid);
        assertCurrentIdentity(request, user);
        const identityCreatedAt = user.metadata.creationTime;
        const unlimited = isGenerationAdmin(user);
        const leaseId = randomUUID();
        try {
            const result = await generationCredits.reserve(uid, identityCreatedAt, leaseId, unlimited, recovery);
            if (result) return result;
        } catch (error) {
            if (['resource-exhausted', 'failed-precondition', 'invalid-argument'].includes(error.code)) {
                throw new HttpsError(error.code, error.message, error.details);
            }
            throw error;
        }

        let lastError = null;
        let succeeded = false;
        let resultJson = null;
        try {
            const apiKey = GEMINI_API_KEY.value();
            if (!apiKey) {
                throw new HttpsError("failed-precondition", "서버에 Gemini API 키가 설정되지 않았습니다.");
            }
            const prompt = buildPrompt(constraints, lang);
            for (const model of GEMINI_MODELS) {
                try {
                    const rawText = await callGemini(model, apiKey, prompt);
                    const parsed = JSON.parse(rawText);

                    const days = Array.isArray(parsed.days)
                        ? [...parsed.days].sort((a, b) => a?.day - b?.day)
                        : [];
                    if (days.length !== constraints.dailyData.length || days.some((day, index) =>
                        day?.day !== constraints.dailyData[index].day
                        || day.date !== constraints.dailyData[index].date
                        || !Array.isArray(day.scheduleItems))) {
                        throw new Error("Invalid output: days do not match the requested trip.");
                    }
                    const result = { days, model };
                    if (recovery) {
                        resultJson = JSON.stringify(result);
                        if (Buffer.byteLength(resultJson) > 900_000) throw new Error('Generation result exceeds recovery storage limit.');
                    }

                    functions.logger.info("[generateItinerary] success", {
                        uid: request.auth.uid,
                        model,
                        dayCount: days.length
                    });

                    succeeded = true;
                    return result;
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
        } finally {
            const settled = await generationCredits.settle(uid, identityCreatedAt, leaseId, succeeded, recovery, resultJson);
            if (succeeded && !settled) throw new HttpsError('failed-precondition', 'Generation reservation is no longer active.');
        }
    }
);
