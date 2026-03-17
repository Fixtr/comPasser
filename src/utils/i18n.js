const dictionary = {
    ko: {
        heroTitle: "Smart Travel AI",
        heroSubtitle: "원하는 주요 일정(Anchor)을 중심으로 최적의 여행 경로를 그려보세요.",
        darkMode: "🌙 다크 모드",
        lightMode: "☀️ 라이트 모드",
        myItineraries: "📂 내 여행 일정 보기",
        logout: "🚪 로그아웃",
        loginTitle: "당신의 완벽한 여행 플래너 🧭",
        loginSubtitle: "방문하고 싶은 장소들만 픽하세요. 나머지는 AI가 알아서 최적화해 드립니다.",
        loginBtn: "Google 계정으로 시작하기",
        tripBasicsTitle: "기본 일정",
        scheduleDate: "날짜",
        startTime: "시작 시간",
        endTime: "종료 시간",
        startLocation: "시작 장소 (호텔, 공항 등)",
        startLocationPlaceholder: "안국역",
        endLocation: "종료 장소 (호텔, 공항 등)",
        endLocationPlaceholder: "인천국제공항",
        anchorTitle: "필수 방문 일정 (Anchor)",
        anchorSubtitle: "반드시 방문해야 하는 고정된 일정을 추가해 주세요 (예: 7PM 콘서트, 저녁 식사 예약)",
        addAnchor: "+ 필수 일정 추가",
        generateBtn: "AI 일정 생성하기 ✨",
        anchorNameLabel: "일정 이름",
        anchorNamePlaceholder: "지드래곤 콘서트",
        anchorStartLabel: "시작 시간",
        anchorEndLabel: "종료 시간",
        anchorLocationLabel: "장소명",
        anchorLocationPlaceholder: "KSPO Dome",
        loadingText: "AI가 최적의 경로를 분석하고 있습니다...",
        loadingSubtext: "잠시만 기다려주세요.",
        generationComplete: "✨ 경로 설계가 완료되었습니다!",
        showResultsBtn: "✨ 경로 확인하기",
        generationFail: "❌ 일정을 생성하지 못했습니다.",
        goBackBtn: "← 이전 화면으로",
        saveItineraryBtn: "이 일정 저장하기 💾",
        itinerarySaveToast: "일정이 성공적으로 저장되었습니다! 🎉",
        itineraryDeleteToast: "일정이 성공적으로 삭제되었습니다.",
        emptyItineraryMsg: "저장된 일정이 없습니다.",
        myItinerariesTitle: "📂 내 여행 일정",
        confirmDelete: "정말로 이 일정을 삭제하시겠습니까?",
        loadingModal: "불러오는 중...",
        saveFailToast: "저장에 실패했습니다.",
        shareItineraryBtn: "🔗 일정 공유하기",
        shareSuccessAlert: "🔗 공유 링크가 클립보드에 복사되었습니다!",
        loginRequiredToast: "로그인이 필요합니다.",
        savingStateBtn: "저장 중...",
        walkText: "도보",
        transitText: "대중교통",
        busFormat: "{0}번 버스",
        subwayFormat: "{0}",
        trainFormat: "{0} 기차",
        editItineraryBtn: "일정 수정하기 ✏️",
        boarding: "승차",
        alighting: "하차",
        fare: "요금",
        itineraryHeader: "{0} 여행 일정",
        officialWebsite: "🌐 홈페이지",
        googleMapsLink: "📍 구글맵 보기",
        timeValidationError: "오류: '[{0}]' 일정이 전체 여행 시간({1} ~ {2})을 벗어납니다. 시간을 다시 확인해 주세요.",
        invalidAnchorTime: "오류: '[{0}]' 일정이 시작 시간이 종료 시간보다 늦거나 같습니다.",
        basicTimeValidationError: "오류: 여행 종료 시간은 시작 시간보다 늦어야 합니다. 시간을 다시 확인해 주세요."
    },
    en: {
        heroTitle: "Smart Travel AI",
        heroSubtitle: "Optimize your itinerary seamlessly around your must-attend anchor events.",
        darkMode: "🌙 Dark Mode",
        lightMode: "☀️ Light Mode",
        myItineraries: "📂 My Itineraries",
        logout: "🚪 Logout",
        loginTitle: "Your Perfect Travel Planner 🧭",
        loginSubtitle: "Just pick the places you want to visit. The AI will optimize the rest.",
        loginBtn: "Continue with Google",
        tripBasicsTitle: "Trip Basics",
        scheduleDate: "Date",
        startTime: "Start Time",
        endTime: "End Time",
        startLocation: "Start Location (e.g., Hotel)",
        startLocationPlaceholder: "Myeongdong Lotte Hotel",
        endLocation: "End Location (e.g., Hotel/Airport)",
        endLocationPlaceholder: "Incheon Airport",
        anchorTitle: "Anchor Schedules",
        anchorSubtitle: "Fixed schedule items to build around (e.g., Concert at 7PM, Dinner reservation)",
        addAnchor: "+ Add Anchor Schedule",
        generateBtn: "Generate AI Itinerary ✨",
        anchorNameLabel: "Schedule Name",
        anchorNamePlaceholder: "G-Dragon Concert",
        anchorStartLabel: "Start Time",
        anchorEndLabel: "End Time",
        anchorLocationLabel: "Location (Area or Venue)",
        anchorLocationPlaceholder: "KSPO Dome",
        loadingText: "AI is analyzing the optimal route...",
        loadingSubtext: "Please wait a moment.",
        generationComplete: "✨ Route design is complete!",
        showResultsBtn: "✨ View Itinerary",
        generationFail: "❌ Failed to generate itinerary.",
        goBackBtn: "← Go Back",
        saveItineraryBtn: "Save this Itinerary 💾",
        itinerarySaveToast: "Itinerary saved successfully! 🎉",
        itineraryDeleteToast: "Itinerary deleted successfully.",
        emptyItineraryMsg: "No saved itineraries found.",
        myItinerariesTitle: "📂 My Itineraries",
        confirmDelete: "Are you sure you want to delete this itinerary?",
        loadingModal: "Loading...",
        saveFailToast: "Failed to save.",
        loginRequiredToast: "Login is required.",
        savingStateBtn: "Saving...",
        walkText: "Walk",
        transitText: "Transit",
        busFormat: "Bus {0}",
        subwayFormat: "Line {0}",
        trainFormat: "Train {0}",
        editItineraryBtn: "Edit Itinerary ✏️",
        boarding: "Boarding",
        alighting: "Drop-off",
        fare: "Fare",
        itineraryHeader: "{0} Itinerary",
        officialWebsite: "🌐 Website",
        googleMapsLink: "📍 View on Maps",
        timeValidationError: "Error: '{0}' schedule is outside the total trip time ({1} ~ {2}). Please check the time again.",
        invalidAnchorTime: "Error: '{0}' schedule's start time is later than or equal to the end time.",
        basicTimeValidationError: "Error: Trip end time must be later than the start time. Please check the time again."
    }
};

/**
 * Initializes language from localStorage or defaults to 'ko'.
 */
function initLang() {
    const stored = localStorage.getItem('compasser_lang');
    if (stored) return stored;

    // Optional: check navigator.language
    // const browserLang = navigator.language.split('-')[0];
    // return browserLang === 'ko' ? 'ko' : 'en';

    return 'ko'; // Default
}

let currentLang = initLang();

export function getLang() {
    return currentLang;
}

export function setLang(lang) {
    if (dictionary[lang]) {
        currentLang = lang;
        localStorage.setItem('compasser_lang', lang);
        // Dispatch global event so components can react
        window.dispatchEvent(new CustomEvent('i18n-changed', { detail: { lang } }));
    }
}

export function t(key) {
    return dictionary[currentLang]?.[key] || key;
}
