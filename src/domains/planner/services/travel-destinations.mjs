import { TRAVEL_REGIONS } from '../../../../functions/travel-region.mjs';
import { cities } from './discovery-catalogue.mjs';
// Official visitor guides checked 2026-10-11; stay durations are planning suggestions.
export const destinations = [
  ...cities.map(city => ({ ...city, country: 'KOR' })),
  { id: 'tokyo', key: 'cityTokyo', country: 'JPN', places: [
    { id: '浅草寺', searchAliases: ["Sensō-ji"], name: '센소지', englishName: 'Sensoji Temple', location: '浅草寺, Tokyo', stayMinutes: 60, guide: 'https://www.gotokyo.org/en/spot/15/index.html' },
    { id: '東京タワー', name: '도쿄 타워', englishName: 'Tokyo Tower', location: '東京タワー, Tokyo', stayMinutes: 60, guide: 'https://www.gotokyo.org/en/spot/4/index.html' },
    { id: '明治神宮', searchAliases: ["Meiji Jingu"], name: '메이지 신궁', englishName: 'Meiji Jingu Shrine', location: '明治神宮, Tokyo', stayMinutes: 60, guide: 'https://www.gotokyo.org/en/spot/76/index.html' },
  ] },
  { id: 'kyoto', key: 'cityKyoto', country: 'JPN', places: [
    { id: '清水寺', searchAliases: ["Kiyomizu-dera"], name: '기요미즈데라', englishName: 'Kiyomizu-dera Temple', location: '清水寺, Kyoto', stayMinutes: 60, guide: 'https://kyoto.travel/en/destinations/kiyomizudera-temple/' },
    { id: '伏見稲荷大社', searchAliases: ["Fushimi Inari Taisha"], name: '후시미 이나리 신사', englishName: 'Fushimi Inari-taisha Shrine', location: '伏見稲荷大社, Kyoto', stayMinutes: 60, guide: 'https://kyoto.travel/en/destinations/fushimi-inaritaisha-shrine/' },
    { id: '嵐山', name: '아라시야마', englishName: 'Arashiyama', location: '嵐山, Kyoto', stayMinutes: 60, guide: 'https://kyoto.travel/en/areas/saga-arashiyama/' },
  ] },
  { id: 'paris', key: 'cityParis', country: 'FRA', places: [
    { id: 'Tour Eiffel', name: '에펠탑', englishName: 'Eiffel Tower', location: 'Tour Eiffel, Paris', stayMinutes: 60, guide: 'https://www.toureiffel.paris/en' },
    { id: 'Musée du Louvre', name: '루브르 박물관', englishName: 'Louvre Museum', location: 'Musée du Louvre, Paris', stayMinutes: 60, guide: 'https://www.louvre.fr/en' },
    { id: 'Arc de Triomphe', name: '개선문', englishName: 'Arc de Triomphe', location: 'Arc de Triomphe, Paris', stayMinutes: 60, guide: 'https://www.paris-arc-de-triomphe.fr/en' },
  ] },
  { id: 'nice', key: 'cityNice', country: 'FRA', places: [
    { id: 'Promenade des Anglais', name: '프롬나드 데 장글레', englishName: 'Promenade des Anglais', location: 'Promenade des Anglais, Nice', stayMinutes: 60, guide: 'https://www.explorenicecotedazur.com/en/culture/promenade-des-anglais/' },
    { id: 'Colline du Château', searchAliases: ["Colline du Château"], name: '캐슬 힐', englishName: 'Castle Hill', location: 'Colline du Château, Nice', stayMinutes: 60, guide: 'https://www.explorenicecotedazur.com/en/culture/parc-de-la-colline-du-chateau/' },
    { id: 'Vieux Nice', searchAliases: ["old nice"], name: '니스 구시가지', englishName: 'Old Town of Nice', location: 'Vieux Nice, Nice', stayMinutes: 60, guide: 'https://www.explorenicecotedazur.com/en/service-provider/le-vieux-nice/' },
  ] },
  { id: 'taipei', key: 'cityTaipei', country: 'TWN', places: [
    { id: 'taipei-1', searchAliases: ["Chiang Kai-shek Memorial Hall"], name: '중정기념당', englishName: 'National Chiang Kai-shek Memorial Hall', location: 'National Chiang Kai-shek Memorial Hall, Taipei', stayMinutes: 60, guide: 'https://travel.taipei/en/must-visit/attractions' },
    { id: 'taipei-2', name: '용산사', englishName: 'Longshan Temple', location: 'Longshan Temple, Taipei', stayMinutes: 45, guide: 'https://travel.taipei/en/attraction?page=1' },
    { id: 'taipei-3', name: '타이베이 101', englishName: 'Taipei 101', location: 'Taipei 101, Taipei', stayMinutes: 90, guide: 'https://travel.taipei/en/must-visit/attractions' },
  ] },
  { id: 'bangkok', key: 'cityBangkok', country: 'THA', places: [
    { id: 'bangkok-1', name: '방콕 왕궁', englishName: 'The Grand Palace', location: 'The Grand Palace, Bangkok', stayMinutes: 120, guide: 'https://www.tourismthailand.org/Attraction/the-grand-palace' },
    { id: 'bangkok-2', searchAliases: ["Wat Phra Chetuphon Wimon Mangkhalaram Rajwaramahawihan"], name: '왓 포', englishName: 'Wat Pho', location: 'Wat Pho, Bangkok', stayMinutes: 60, guide: 'https://www.tourismthailand.org/Destinations/Provinces/Bangkok/219' },
    { id: 'bangkok-3', name: '왓 아룬', englishName: 'Wat Arun', location: 'Wat Arun, Bangkok', stayMinutes: 60, guide: 'https://www.tourismthailand.org/Destinations/Provinces/Bangkok/219' },
  ] },
  { id: 'hanoi', key: 'cityHanoi', country: 'VNM', places: [
    { id: 'hanoi-1', searchAliases: ["Hoàn Kiếm Lake"], name: '호안끼엠 호수', englishName: 'Hoan Kiem Lake', location: 'Hoan Kiem Lake, Hanoi', stayMinutes: 60, guide: 'https://vietnam.travel/things-to-do/11-must-see-attractions-ha-noi' },
    { id: 'hanoi-2', name: '응옥선 사당', englishName: 'Ngoc Son Temple', location: 'Ngoc Son Temple, Hanoi', stayMinutes: 45, guide: 'https://vietnam.travel/things-to-do/11-must-see-attractions-ha-noi' },
    { id: 'hanoi-3', name: '하노이 문묘', englishName: 'Temple of Literature', location: 'Temple of Literature, Hanoi', stayMinutes: 60, guide: 'https://vietnam.travel/things-to-do/hanoi-six-heritage-sites/' },
  ] },
  { id: 'singapore', key: 'citySingapore', country: 'SGP', places: [
    { id: 'singapore-1', name: '머라이언 파크', englishName: 'Merlion Park', location: 'Merlion Park, Singapore', stayMinutes: 30, guide: 'https://www.visitsingapore.com/neighbourhood/featured-neighbourhood/marina-bay/merlion-park/' },
    { id: 'singapore-2', name: '가든스 바이 더 베이', englishName: 'Gardens by the Bay', location: 'Gardens by the Bay, Singapore', stayMinutes: 120, guide: 'https://www.visitsingapore.com/neighbourhood/featured-neighbourhood/marina-bay/gardens-by-the-bay/' },
    { id: 'singapore-3', name: '싱가포르 보타닉 가든', englishName: 'Singapore Botanic Gardens', location: 'Singapore Botanic Gardens, Singapore', stayMinutes: 90, guide: 'https://www.nparks.gov.sg/sbg' },
  ] },
  { id: 'rome', key: 'cityRome', country: 'ITA', places: [
    { id: 'rome-1', name: '콜로세움', englishName: 'Colosseum', location: 'Colosseum, Rome', stayMinutes: 90, guide: 'https://www.turismoroma.it/en/places/flavian-amphitheatre-colosseum' },
    { id: 'rome-2', name: '포로 로마노', englishName: 'Roman Forum', location: 'Roman Forum, Rome', stayMinutes: 90, guide: 'https://turismoroma.it/en/places/roman-forum-and-palatine' },
    { id: 'rome-3', name: '팔라티노 언덕', englishName: 'Palatine Hill', location: 'Palatine Hill, Rome', stayMinutes: 60, guide: 'https://turismoroma.it/en/places/roman-forum-and-palatine' },
  ] },
  { id: 'barcelona', key: 'cityBarcelona', country: 'ESP', places: [
    { id: 'barcelona-1', searchAliases: ["Basilica of the Sagrada Familia"], name: '사그라다 파밀리아', englishName: 'Sagrada Família', location: 'Sagrada Família, Barcelona', stayMinutes: 90, guide: 'https://thisisbarcelona.com/architecture/religious-heritage/basilica-de-la-sagrada-familia' },
    { id: 'barcelona-2', name: '구엘 공원', englishName: 'Park Güell', location: 'Park Güell, Barcelona', stayMinutes: 90, guide: 'https://thisisbarcelona.com/architecture/urban-spaces-and-elements/park-guell' },
    { id: 'barcelona-3', name: '카사 바트요', englishName: 'Casa Batlló', location: 'Casa Batlló, Barcelona', stayMinutes: 90, guide: 'https://thisisbarcelona.com/architecture/houses-and-emblematic-buildings/casa-batllo' },
  ] },
  { id: 'london', key: 'cityLondon', country: 'GBR', places: [
    { id: 'london-1', name: '웨스트민스터 사원', englishName: 'Westminster Abbey', location: 'Westminster Abbey, London', stayMinutes: 90, guide: 'https://www.westminster-abbey.org/' },
    { id: 'london-2', name: '런던 아이', englishName: 'London Eye', location: 'London Eye, London', stayMinutes: 60, guide: 'https://www.visitlondon.com/things-to-do/place/282783-london-eye' },
    { id: 'london-3', name: '빅 벤', englishName: 'Big Ben', location: 'Big Ben, London', stayMinutes: 30, guide: 'https://www.parliament.uk/bigben/' },
  ] },
  { id: 'newyork', key: 'cityNewYork', country: 'USA', places: [
    { id: 'newyork-1', name: '메트로폴리탄 미술관', englishName: 'The Metropolitan Museum of Art', location: 'The Metropolitan Museum of Art, New York', stayMinutes: 120, guide: 'https://www.metmuseum.org/plan-your-visit' },
    { id: 'newyork-2', name: '센트럴 파크', englishName: 'Central Park', location: 'Central Park, New York', stayMinutes: 90, guide: 'https://www.centralparknyc.org/' },
    { id: 'newyork-3', name: '타임스 스퀘어', englishName: 'Times Square', location: 'Times Square, New York', stayMinutes: 45, guide: 'https://www.timessquarenyc.org/' },
    { id: "newyork-4", name: "자유의 여신상", englishName: "Statue of Liberty", location: "Statue of Liberty, New York, NY", stayMinutes: 120, guide: "https://www.nps.gov/stli/planyourvisit/index.htm" },
    { id: "newyork-5", name: "브루클린 브리지", englishName: "Brooklyn Bridge", location: "Brooklyn Bridge, New York, NY", stayMinutes: 60, guide: "https://www.nyc.gov/html/dot/html/infrastructure/brooklyn-bridge.shtml" },
    { id: "newyork-6", name: "엠파이어 스테이트 빌딩", englishName: "Empire State Building", location: "Empire State Building, New York, NY", stayMinutes: 90, guide: "https://www.esbnyc.com/visit" },
  ] },
  { id: "losangeles", key: "cityLosAngeles", country: 'USA', places: [
    { id: "losangeles-1", name: "그리피스 천문대", englishName: "Griffith Observatory", location: "Griffith Observatory, Los Angeles, CA", stayMinutes: 90, guide: "https://griffithobservatory.lacity.gov/visit/" },
    { id: "losangeles-2", name: "할리우드 명예의 거리", englishName: "Hollywood Walk of Fame", location: "Hollywood Walk of Fame, Los Angeles, CA", stayMinutes: 60, guide: "https://www.discoverlosangeles.com/things-to-do/hollywood-walk-of-fame" },
    { id: "losangeles-3", searchAliases: ["The Getty"], name: "게티 센터", englishName: "The Getty Center", location: "The Getty Center, Los Angeles, CA", stayMinutes: 120, guide: "https://www.getty.edu/visit/center/" },
    { id: "losangeles-4", name: "산타모니카 피어", englishName: "Santa Monica Pier", location: "Santa Monica Pier, Santa Monica, CA", stayMinutes: 90, guide: "https://www.discoverlosangeles.com/things-to-do/santa-monica-pier" },
    { id: "losangeles-5", name: "할리우드 사인", englishName: "Hollywood Sign", location: "Hollywood Sign, Los Angeles, CA", stayMinutes: 60, guide: "https://www.hollywoodsign.org/" },
    { id: "losangeles-6", name: "월트 디즈니 콘서트 홀", englishName: "Walt Disney Concert Hall", location: "Walt Disney Concert Hall, Los Angeles, CA", stayMinutes: 45, guide: "https://www.laphil.com/visit/plan-your-visit" },
  ] },
  { id: "sanfrancisco", key: "citySanFrancisco", country: 'USA', places: [
    { id: "sanfrancisco-1", name: "금문교", englishName: "Golden Gate Bridge", location: "Golden Gate Bridge, San Francisco, CA", stayMinutes: 60, guide: "https://www.goldengate.org/" },
    { id: "sanfrancisco-2", name: "팰리스 오브 파인 아츠", englishName: "Palace of Fine Arts", location: "Palace of Fine Arts, San Francisco, CA", stayMinutes: 60, guide: "https://www.sftravel.com/article/guide-to-san-franciscos-palace-fine-arts" },
    { id: "sanfrancisco-3", name: "피셔맨스 워프", englishName: "Fisherman's Wharf", location: "Fisherman's Wharf, San Francisco, CA", stayMinutes: 90, guide: "https://www.sftravel.com/neighborhoods/fishermans-wharf" },
    { id: "sanfrancisco-4", name: "페리 빌딩", englishName: "Ferry Building", location: "Ferry Building, San Francisco, CA", stayMinutes: 60, guide: "https://www.sftravel.com/article/san-francisco-ferry-building-everything-to-know-before-you-go" },
    { id: "sanfrancisco-5", name: "롬바드 스트리트", englishName: "Lombard Street", location: "Lombard Street, San Francisco, CA", stayMinutes: 30, guide: "https://www.sftravel.com/things-to-do/attractions/iconic-sf/lombard-street" },
    { id: "sanfrancisco-6", name: "골든 게이트 파크", englishName: "Golden Gate Park", location: "Golden Gate Park, San Francisco, CA", stayMinutes: 90, guide: "https://www.sftravel.com/things-to-do/attractions" },
  ] },
  { id: "lasvegas", key: "cityLasVegas", country: 'USA', places: [
    { id: "lasvegas-1", name: "벨라지오 분수", englishName: "Fountains of Bellagio", location: "Fountains of Bellagio, Las Vegas, NV", stayMinutes: 30, guide: "https://bellagio.mgmresorts.com/en/entertainment/fountains-of-bellagio.html" },
    { id: "lasvegas-2", name: "하이 롤러", englishName: "High Roller", location: "High Roller, Las Vegas, NV", stayMinutes: 60, guide: "https://www.visitlasvegas.com/things-to-do/?skip=0&sort=rankTitle&subcatids=1048" },
    { id: "lasvegas-3", searchAliases: ["Grand Canal Shoppes at The Venetian Resort Las Vegas"], name: "베네시안 그랜드 캐널", englishName: "Grand Canal Shoppes at The Venetian", location: "Grand Canal Shoppes at The Venetian, Las Vegas, NV", stayMinutes: 60, guide: "https://www.grandcanalshoppes.com/en/" },
    { id: "lasvegas-4", name: "프리몬트 스트리트", englishName: "Fremont Street Experience", location: "Fremont Street Experience, Las Vegas, NV", stayMinutes: 60, guide: "https://fremontstreetexperience.com/" },
    { id: "lasvegas-5", name: "웰컴 투 라스베이거스 사인", englishName: "Welcome to Fabulous Las Vegas Sign", location: "Welcome to Fabulous Las Vegas Sign, Las Vegas, NV", stayMinutes: 30, guide: "https://www.visitlasvegas.com/listing/welcome-to-fabulous-las-vegas-sign/35219/" },
    { id: "lasvegas-6", name: "스피어", englishName: "Sphere", location: "Sphere, Las Vegas, NV", stayMinutes: 60, guide: "https://www.thesphere.com/" },
  ] },
  { id: "chicago", key: "cityChicago", country: 'USA', places: [
    { id: "chicago-1", name: "클라우드 게이트", englishName: "Cloud Gate", location: "Cloud Gate, Chicago, IL", stayMinutes: 45, guide: "https://chicago.gov/city/en/depts/dca/supp_info/chicago_s_publicartcloudgateinmillenniumpark.html" },
    { id: "chicago-2", searchAliases: ["The Art Institute of Chicago"], name: "시카고 미술관", englishName: "Art Institute of Chicago", location: "Art Institute of Chicago, Chicago, IL", stayMinutes: 120, guide: "https://www.choosechicago.com/listing/art-institute-of-chicago/" },
    { id: "chicago-3", name: "시카고 리버워크", englishName: "Chicago Riverwalk", location: "Chicago Riverwalk, Chicago, IL", stayMinutes: 60, guide: "https://www.choosechicago.com/articles/free-and-cheap/chicago-riverwalk/" },
    { id: "chicago-4", name: "네이비 피어", englishName: "Navy Pier", location: "Navy Pier, Chicago, IL", stayMinutes: 90, guide: "https://navypier.org/" },
    { id: "chicago-5", name: "스카이덱 시카고", englishName: "Skydeck Chicago", location: "Skydeck Chicago, Chicago, IL", stayMinutes: 60, guide: "https://theskydeck.com/" },
    { id: "chicago-6", searchAliases: ["Clarence F. Buckingham Memorial Fountain"], name: "버킹엄 분수", englishName: "Buckingham Fountain", location: "Buckingham Fountain, Chicago, IL", stayMinutes: 30, guide: "https://www.chicagoparkdistrict.com/parks-facilities/clarence-f-buckingham-memorial-fountain" },
  ] },
  { id: "washingtondc", key: "cityWashingtonDC", country: 'USA', places: [
    { id: "washingtondc-1", name: "링컨 기념관", englishName: "Lincoln Memorial", location: "Lincoln Memorial, Washington, DC", stayMinutes: 45, guide: "https://www.nps.gov/linc/index.htm" },
    { id: "washingtondc-2", name: "워싱턴 기념탑", englishName: "Washington Monument", location: "Washington Monument, Washington, DC", stayMinutes: 60, guide: "https://www.nps.gov/wamo/index.htm" },
    { id: "washingtondc-3", name: "제2차 세계대전 기념비", englishName: "World War II Memorial", location: "World War II Memorial, Washington, DC", stayMinutes: 30, guide: "https://www.nps.gov/wwii/index.htm" },
    { id: "washingtondc-4", name: "미국 국회의사당", englishName: "United States Capitol", location: "United States Capitol, Washington, DC", stayMinutes: 90, guide: "https://www.visitthecapitol.gov/" },
    { id: "washingtondc-5", searchAliases: ["Smithsonian's National Air and Space Museum"], name: "국립항공우주박물관", englishName: "National Air and Space Museum", location: "National Air and Space Museum, Washington, DC", stayMinutes: 120, guide: "https://airandspace.si.edu/visit" },
    { id: "washingtondc-6", name: "제퍼슨 기념관", englishName: "Thomas Jefferson Memorial", location: "Thomas Jefferson Memorial, Washington, DC", stayMinutes: 45, guide: "https://www.nps.gov/thje/index.htm" },
  ] },
  { id: "honolulu", key: "cityHonolulu", country: 'USA', places: [
    { id: "honolulu-1", searchAliases: ["Waikīkī Beach"], name: "와이키키 해변", englishName: "Waikiki Beach", location: "Waikiki Beach, Honolulu, HI", stayMinutes: 90, guide: "https://www.gohawaii.com/islands/oahu/things-to-do/beaches/waikiki-beach" },
    { id: "honolulu-2", name: "다이아몬드 헤드", englishName: "Diamond Head State Monument", location: "Diamond Head State Monument, Honolulu, HI", stayMinutes: 120, guide: "https://dlnr.hawaii.gov/dsp/parks/oahu/diamond-head-state-monument/" },
    { id: "honolulu-3", name: "이올라니 궁전", englishName: "Iolani Palace", location: "Iolani Palace, Honolulu, HI", stayMinutes: 90, guide: "https://www.iolanipalace.org/" },
    { id: "honolulu-4", name: "진주만 국립기념관", englishName: "Pearl Harbor National Memorial", location: "Pearl Harbor National Memorial, Honolulu, HI", stayMinutes: 120, guide: "https://www.nps.gov/perl/" },
    { id: "honolulu-5", searchAliases: ["Ala Moana Regional Park"], name: "알라모아나 비치 파크", englishName: "Ala Moana Beach Park", location: "Ala Moana Beach Park, Honolulu, HI", stayMinutes: 90, guide: "https://www.gohawaii.com/islands/oahu/things-to-do/land-activities" },
    { id: "honolulu-6", searchAliases: ["Kapiʻolani Regional Park"], name: "카피올라니 공원", englishName: "Kapiolani Park", location: "Kapiolani Park, Honolulu, HI", stayMinutes: 60, guide: "https://www.gohawaii.com/islands/oahu/things-to-do/land-activities" },
  ] },
];
export const destinationById = id => destinations.find(city => city.id === id);

export const destinationCountries = Object.keys(TRAVEL_REGIONS);
