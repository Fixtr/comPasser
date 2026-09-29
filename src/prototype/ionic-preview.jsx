import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IonApp, IonButton, IonContent, IonIcon, IonModal, IonPage, setupIonicReact } from '@ionic/react';
import { arrowDownOutline, arrowUpOutline, locateOutline } from 'ionicons/icons';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/palettes/high-contrast.always.css';
import './ionic-preview.css';

setupIonicReact();

const stops = [
  { time: '09:30', name: '광화문 광장', detail: '오늘의 출발지', kind: 'start', x: 35, y: 62 },
  { time: '11:00', name: '경복궁', detail: '고정 일정 · 1시간 30분', kind: 'anchor', x: 48, y: 38 },
  { time: '13:10', name: '서촌 점심', detail: '도보 14분 · 예상 비용 ₩15,000', kind: 'stop', x: 27, y: 28 },
  { time: '15:00', name: '북촌 한옥마을', detail: '대중교통 22분', kind: 'stop', x: 74, y: 35 },
];

function MapIllustration({ selected, onSelect }) {
  return (
    <div className="preview-map" aria-label="서울 종로 일정의 예시 지도">
      <svg className="preview-map-art" viewBox="0 0 390 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="390" height="800" fill="#e8e9e2" />
        <path d="M0 75H390M0 210H390M0 335H390M0 475H390M0 620H390M62 0V800M170 0V800M285 0V800" stroke="#f8f8f5" strokeWidth="23" />
        <path d="M-20 535C88 500 169 570 410 525" stroke="#d3dcd6" strokeWidth="60" fill="none" />
        <path d="M-20 535C88 500 169 570 410 525" stroke="#f8f8f5" strokeWidth="16" fill="none" />
        <path d="M214 0L190 153 245 286 168 435 215 800" stroke="#fff" strokeWidth="12" fill="none" />
        <rect x="90" y="90" width="72" height="88" rx="8" fill="#c9dabe" />
        <rect x="233" y="91" width="69" height="65" rx="8" fill="#d5e1c7" />
        <rect x="305" y="638" width="62" height="76" rx="8" fill="#d6e4c9" />
        <path d="M135 495L186 304 106 226 290 282" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M135 495L186 304 106 226 290 282" stroke="#252b2c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 9" fill="none" />
      </svg>
      <div className="preview-map-label preview-map-label-palace">경복궁</div>
      <div className="preview-map-label preview-map-label-square">광화문</div>
      <div className="preview-map-label preview-map-label-village">북촌</div>
      {stops.map((stop, index) => (
        <button
          className={`preview-pin preview-pin-${stop.kind}${selected === index ? ' is-selected' : ''}`}
          key={stop.name}
          style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
          onClick={() => onSelect(index)}
          aria-label={`${stop.time} ${stop.name} 일정 보기`}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}

function IonicPreview() {
  const sheet = useRef(null);
  const [selected, setSelected] = useState(1);
  const [breakpoint, setBreakpoint] = useState(0.3);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const moveSheet = (next) => {
    setBreakpoint(next);
    sheet.current?.setCurrentBreakpoint(next);
  };

  const showStop = (index) => {
    setSelected(index);
    moveSheet(0.62);
  };

  return (
    <IonApp>
      <IonPage className="preview-page">
        <IonContent fullscreen scrollY={false}>
          <MapIllustration selected={selected} onSelect={showStop} />
          <header className="preview-header">
            <span className="preview-eyebrow">COMPASSER · 화면 시제품</span>
            <h1>서울 종로의 하루</h1>
            <p>9월 27일 일요일 · 4곳 방문</p>
          </header>
          <div className="preview-map-note">지도와 일정 위치는 시연용입니다</div>
          <IonButton
            className="preview-map-control"
            fill="solid"
            onClick={() => moveSheet(0.3)}
            aria-label="지도 넓게 보기"
          >
            <IonIcon icon={locateOutline} slot="icon-only" />
          </IonButton>
        </IonContent>

        <IonModal
          ref={sheet}
          className="preview-sheet"
          isOpen
          animated={!reducedMotion}
          canDismiss={false}
          breakpoints={[0.3, 0.62, 1]}
          initialBreakpoint={0.3}
          backdropBreakpoint={0.62}
          handle
          handleBehavior="cycle"
          expandToScroll={false}
          aria-label="오늘의 여행 일정"
          onIonBreakpointDidChange={(event) => setBreakpoint(event.detail.breakpoint)}
        >
          <IonContent className="preview-sheet-content">
            <div className="preview-sheet-inner">
              <div className="preview-sheet-heading">
                <div>
                  <span className="preview-eyebrow">DAY 1 · 일요일</span>
                  <h2>오늘의 동선</h2>
                  <p>고정 일정을 중심으로 짠 경로</p>
                </div>
                <IonButton
                  fill="clear"
                  size="small"
                  className="preview-expand"
                  onClick={() => moveSheet(breakpoint === 0.3 ? 0.62 : 0.3)}
                  aria-label={breakpoint === 0.3 ? '일정 펼치기' : '일정 접기'}
                >
                  <IonIcon icon={breakpoint === 0.3 ? arrowUpOutline : arrowDownOutline} slot="icon-only" />
                </IonButton>
              </div>

              <div className="preview-current" aria-live="polite">
                <span>선택한 장소</span>
                <strong>{stops[selected].name}</strong>
                <span>{stops[selected].time}</span>
              </div>

              <ol className="preview-timeline">
                {stops.map((stop, index) => (
                  <li key={stop.name}>
                    <button
                      className={`preview-stop${selected === index ? ' is-selected' : ''}`}
                      onClick={() => setSelected(index)}
                      aria-current={selected === index ? 'true' : undefined}
                    >
                      <time>{stop.time}</time>
                      <span className={`preview-stop-dot preview-stop-dot-${stop.kind}`} aria-hidden="true" />
                      <span className="preview-stop-copy">
                        <strong>{stop.name}</strong>
                        <small>{stop.detail}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </IonContent>
        </IonModal>
      </IonPage>
    </IonApp>
  );
}

createRoot(document.getElementById('ionic-preview')).render(<IonicPreview />);
