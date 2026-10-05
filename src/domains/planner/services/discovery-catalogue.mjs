// Curated catalogue; save counts measure interest within this service, not visits.
// Addresses and guides checked against official Visit Seoul, VISITKOREA and Visit Jeju pages, 2026-10-04.
export const cities = [
  { id: 'seoul', key: 'discoverSeoul', pair: ['palace', 'seochon'], pairReason: 'discoverSeoulPairReason', places: [
    { id: 'palace', key: 'discoverPalace', kind: 'discoverLandmark', stay: '60–120', guide: 'https://english.visitseoul.net/PalaceArea/Gyeongbokgung/ENP000072' },
    { id: 'forest', key: 'discoverForest', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitseoul.net/nature/Seoul%20Forest/ENP001838' },
    { id: 'island', key: 'discoverIsland', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitseoul.net/attractions/SeonyudoPark/ENP000378' },
    { id: 'seochon', key: 'discoverSeochon', stay: '60–90', guide: 'https://english.visitseoul.net/attractions/SeochonHanokVillage/ENPhyd9ee', pairOnly: true },
  ] },
  { id: 'busan', key: 'discoverBusan', pair: ['haeundae', 'dongbaek'], pairReason: 'discoverBusanPairReason', places: [
    { id: 'haeundae', key: 'discoverHaeundae', kind: 'discoverLandmark', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=111053' },
    { id: 'dongbaek', key: 'discoverDongbaek', kind: 'discoverFind', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=81541' },
    { id: 'gwangalli', key: 'discoverGwangalli', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=219&vcontsId=228475' },
  ] },
  { id: 'jeju', key: 'discoverJeju', pair: ['yongduam', 'dongmun'], pairReason: 'discoverJejuPairReason', places: [
    { id: 'yongduam', key: 'discoverYongduam', kind: 'discoverLandmark', stay: '20–40', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500469' },
    { id: 'dongmun', key: 'discoverDongmun', kind: 'discoverFind', stay: '45–75', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CONT_000000000500745' },
    { id: 'iho', key: 'discoverIho', kind: 'discoverWalk', stay: '30–60', guide: 'https://www.visitjeju.net/en/detail/view?contentsid=CNTS_200000000007344' },
  ] },
  { id: 'incheon', key: 'discoverIncheon', pair: ['chinatown', 'jayu'], pairReason: 'discoverIncheonPairReason', places: [
    { id: 'chinatown', key: 'discoverChinatown', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=105442' },
    { id: 'jayu', key: 'discoverJayu', kind: 'discoverWalk', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=105439' },
    { id: 'songdo', key: 'discoverSongdo', kind: 'discoverFind', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=61406' },
  ] },
  { id: 'daegu', key: 'discoverDaegu', pair: ['seomun', 'gyesan'], pairReason: 'discoverDaeguPairReason', places: [
    { id: 'seomun', key: 'discoverSeomun', kind: 'discoverLandmark', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87243' },
    { id: 'gyesan', key: 'discoverGyesan', kind: 'discoverFind', stay: '20–40', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=88338' },
    { id: 'dongseongro', key: 'discoverDongseongro', kind: 'discoverWalk', stay: '45–90', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=57224' },
  ] },
  { id: 'daejeon', key: 'discoverDaejeon', pair: ['hanbat', 'expo'], pairReason: 'discoverDaejeonPairReason', places: [
    { id: 'hanbat', key: 'discoverHanbat', kind: 'discoverWalk', stay: '60–90', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=82059' },
    { id: 'expo', key: 'discoverExpo', kind: 'discoverLandmark', stay: '45–75', guide: 'https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=95423' },
    { id: 'yuseong', key: 'discoverYuseong', kind: 'discoverFind', stay: '30–60', guide: 'https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=139940' },
  ] },
];
