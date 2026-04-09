const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({ origin: true });

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
