// Curated catalogue; save counts measure interest within this service, not visits.
// Addresses and guides checked against official Visit Seoul, VISITKOREA and Visit Jeju pages, 2026-10-04; added places checked against official city/visitor guides 2026-10-11.
export const cities = [
  { id: 'seoul', key: 'discoverSeoul', pair: ['palace', 'seochon'], pairReason: 'discoverSeoulPairReason', places: [
    { id: 'palace', key: 'discoverPalace', kind: 'discoverLandmark', stay: '60–120', guide: 'https://english.visitseoul.net/PalaceArea/Gyeongbokgung/ENP000072' },
    { id: 'forest', key: 'discoverForest', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitseoul.net/nature/Seoul-Forest/ENP001838' },
    { id: 'island', key: 'discoverIsland', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitseoul.net/attractions/SeonyudoPark/ENP000378' },
    { id: 'seochon', key: 'discoverSeochon', kind: 'discoverFind', stay: '60–90', guide: 'https://english.visitseoul.net/attractions/SeochonHanokVillage/ENPhyd9ee' },
    { id: 'namsan', key: 'discoverNamsan', searchAliases: ['N서울타워'], kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=88026' },
    { id: 'bukchon', key: 'discoverBukchon', kind: 'discoverWalk', stay: '45–90', guide: 'https://english.seoul.go.kr/service/amusement/traditional-culture/hanok-village-walking-tour-map/' },
  ] },
  { id: 'busan', key: 'discoverBusan', pair: ['haeundae', 'dongbaek'], pairReason: 'discoverBusanPairReason', places: [
    { id: 'haeundae', key: 'discoverHaeundae', kind: 'discoverLandmark', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=111053' },
    { id: 'dongbaek', key: 'discoverDongbaek', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=81541' },
    { id: 'gwangalli', key: 'discoverGwangalli', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=111074' },
    { id: 'gamcheon', key: 'discoverGamcheon', kind: 'discoverFind', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=72894' },
    { id: 'jagalchi', key: 'discoverJagalchi', kind: 'discoverFind', stay: '45–75', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=69318' },
    { id: 'taejongdae', key: 'discoverTaejongdae', kind: 'discoverWalk', stay: '90–120', guide: 'https://visitbusan.net/kr/index.do?menuCd=DOM_000000201001001000&uc_seq=258&lang_cd=en' },
  ] },
  { id: 'jeju', key: 'discoverJeju', pair: ['yongduam', 'dongmun'], pairReason: 'discoverJejuPairReason', places: [
    { id: 'yongduam', key: 'discoverYongduam', kind: 'discoverLandmark', stay: '20–40', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500469' },
    { id: 'dongmun', key: 'discoverDongmun', kind: 'discoverFind', stay: '45–75', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500745' },
    { id: 'iho', key: 'discoverIho', kind: 'discoverWalk', stay: '30–60', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000007344' },
    { id: 'seongsan', key: 'discoverSeongsan', kind: 'discoverLandmark', stay: '60–90', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500349' },
    { id: 'hamdeok', key: 'discoverHamdeok', kind: 'discoverWalk', stay: '45–90', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500693' },
    { id: 'hallim', key: 'discoverHallim', kind: 'discoverFind', stay: '90–120', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=351&vcontsId=104761' },
  ] },
  { id: 'incheon', key: 'discoverIncheon', pair: ['chinatown', 'jayu'], pairReason: 'discoverIncheonPairReason', places: [
    { id: 'chinatown', key: 'discoverChinatown', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=105442' },
    { id: 'jayu', key: 'discoverJayu', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=105439' },
    { id: 'songdo', key: 'discoverSongdo', kind: 'discoverFind', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=61406' },
    { id: 'wolmido', key: 'discoverWolmido', kind: 'discoverWalk', stay: '60–90', guide: 'https://eng-itour.incheon.go.kr/cmn/board/BBSMSTR_000000000080/4172bbsDetail.do' },
    { id: 'songwol', key: 'discoverSongwol', kind: 'discoverFind', stay: '45–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=69452' },
    { id: 'sinpo', key: 'discoverSinpo', kind: 'discoverFind', stay: '45–75', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=88101' },
  ] },
  { id: 'daegu', key: 'discoverDaegu', pair: ['seomun', 'gyesan'], pairReason: 'discoverDaeguPairReason', places: [
    { id: 'seomun', key: 'discoverSeomun', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87243' },
    { id: 'gyesan', searchAliases: ["주교좌 계산 대성당"], key: 'discoverGyesan', kind: 'discoverFind', stay: '20–40', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=88338' },
    { id: 'dongseongro', key: 'discoverDongseongro', kind: 'discoverWalk', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=57224' },
    { id: 'kimroad', key: 'discoverKimRoad', kind: 'discoverFind', stay: '45–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=75464' },
    { id: 'apsan', searchLocation: '대구광역시 남구 앞산순환로 574-87', key: 'discoverApsan', kind: 'discoverWalk', stay: '90–120', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87639' },
    { id: 'suseong', key: 'discoverSuseong', kind: 'discoverWalk', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=68482' },
  ] },
  { id: 'daejeon', key: 'discoverDaejeon', pair: ['hanbat', 'expo'], pairReason: 'discoverDaejeonPairReason', places: [
    { id: 'hanbat', key: 'discoverHanbat', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=82059' },
    { id: 'expo', searchAliases: ["대전 엑스포 과학공원"], key: 'discoverExpo', kind: 'discoverLandmark', stay: '45–75', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=95423' },
    { id: 'yuseong', searchAliases: ["유성온천 족욕체험장"], key: 'discoverYuseong', kind: 'discoverFind', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=139940' },
    { id: 'science', key: 'discoverScience', kind: 'discoverLandmark', stay: '90–120', guide: 'https://www.science.go.kr/eps/index.do' },
    { id: 'ppuri', key: 'discoverPpuri', kind: 'discoverWalk', stay: '45–90', guide: 'https://www.djjunggu.go.kr/prog/tursmCn/tour/sub03_01_01/view.do?cntNo=24', guideKorean: true },
    { id: 'daecheong', key: 'discoverDaecheong', kind: 'discoverWalk', stay: '60–120', guide: 'https://www.daejeon.go.kr/english/EngContentsHtmlView.do?menuSeq=7051' },
  ] },
];
