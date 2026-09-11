const loadingMessages = [
    'AI가 최적의 여행 장소를 탐색하고 있습니다',
    '추천 장소 간의 이동 동선을 계산하는 중입니다',
    '방문 시간에 맞춰 일정을 최적화하고 있습니다',
    '거의 다 준비되었습니다! 조금만 더 기다려주세요',
];

/** 일정 생성의 화면 표시만 담당한다. 요청과 화면 이동은 호출자가 관리한다. */
export function createGenerationProgressView({
    document = globalThis.document,
    translate,
    ads = [],
    timers = globalThis,
}) {
    const form = document.getElementById('travel-form-view');
    const transition = document.getElementById('loading-transition-view');
    const spinner = document.getElementById('loading-spinner');
    const text = document.getElementById('loading-text');
    const subtext = document.getElementById('loading-subtext');
    const button = document.getElementById('show-results-btn');
    const bannerContainer = document.getElementById('ad-banner-carousel');
    const intervals = new Set();
    const timeouts = new Set();
    const frames = new Set();
    let displayVersion = 0;
    let loading = false;

    const isCurrent = version => loading && version === displayVersion;

    function renderBanner(index, version) {
        if (!isCurrent(version) || !bannerContainer) return;
        const ad = ads[index];
        if (!ad) return;
        const iconContent = ad.imageUrl ? `<img src="${ad.imageUrl}" alt="${ad.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; object-fit: contain;">` : '';
        const fallbackIcon = `<div class="ad-banner-icon-inner" style="display: ${ad.imageUrl ? 'none' : 'flex'};">${ad.icon}</div>`;
        bannerContainer.innerHTML = `
    <div class="ad-banner" style="background-color: ${ad.bgColor};" onclick="window.open('${ad.link}', '_blank')">
      <span class="ad-badge">AD</span>
      <div class="ad-banner-icon">
        ${iconContent}
        ${fallbackIcon}
      </div>
      <div class="ad-banner-content">
        <div class="ad-banner-title">${ad.title}</div>
        <div class="ad-banner-desc">${ad.desc}</div>
      </div>
    </div>
    <div class="ad-dots">
      ${ads.map((_, i) => `<span class="ad-dot${i === index ? ' active' : ''}"></span>`).join('')}
    </div>
  `;
        const frame = timers.requestAnimationFrame(() => {
            frames.delete(frame);
            if (!isCurrent(version)) return;
            bannerContainer.querySelector('.ad-banner')?.classList.add('fade-in');
        });
        frames.add(frame);
    }

    function startAnimations(version) {
        if (bannerContainer && ads.length) {
            let bannerIndex = 0;
            bannerContainer.style.display = 'block';
            renderBanner(bannerIndex, version);
            intervals.add(timers.setInterval(() => {
                if (!isCurrent(version)) return;
                const banner = bannerContainer.querySelector('.ad-banner');
                banner?.classList.remove('fade-in');
                banner?.classList.add('fade-out');
                const timeout = timers.setTimeout(() => {
                    timeouts.delete(timeout);
                    if (!isCurrent(version)) return;
                    bannerIndex = (bannerIndex + 1) % ads.length;
                    renderBanner(bannerIndex, version);
                }, 500);
                timeouts.add(timeout);
            }, 3500));
        }
        if (subtext) {
            let messageIndex = 0;
            subtext.textContent = loadingMessages[messageIndex];
            subtext.classList.add('loading-text-fade');
            intervals.add(timers.setInterval(() => {
                if (!isCurrent(version)) return;
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                subtext.textContent = loadingMessages[messageIndex];
            }, 3000));
        }
    }

    function stop() {
        // 취소되기 전에 이벤트 큐에 들어간 콜백도 새 화면에 영향을 주지 못한다.
        loading = false;
        displayVersion++;
        for (const id of intervals) timers.clearInterval(id);
        for (const id of timeouts) timers.clearTimeout(id);
        for (const id of frames) timers.cancelAnimationFrame(id);
        intervals.clear();
        timeouts.clear();
        frames.clear();
        if (bannerContainer) {
            bannerContainer.style.display = 'none';
            bannerContainer.innerHTML = '';
        }
        subtext?.classList.remove('loading-text-fade');
    }

    function showLoading() {
        stop();
        loading = true;
        if (form) form.style.display = 'none';
        if (spinner) spinner.style.display = 'block';
        if (text) {
            text.textContent = translate('loadingText');
            delete text.dataset.tone;
        }
        if (subtext) {
            subtext.textContent = translate('loadingSubtext');
            subtext.style.display = 'block';
        }
        if (button) {
            button.style.display = 'none';
            button.textContent = translate('showResultsBtn');
            button.onclick = null;
        }
        if (transition) {
            transition.style.display = 'flex';
            void transition.offsetWidth;
            transition.classList.remove('hidden-view');
        }
        startAnimations(displayVersion);
    }

    function showSuccess(onContinue) {
        stop();
        if (spinner) spinner.style.display = 'none';
        if (text) text.textContent = translate('planReadyText');
        if (subtext) subtext.style.display = 'none';
        if (button) {
            button.textContent = translate('showResultsBtn');
            button.style.display = 'inline-block';
            button.onclick = onContinue;
        }
    }

    function showError(error, onBack) {
        stop();
        if (spinner) spinner.style.display = 'none';
        if (text) {
            text.textContent = translate('planFailedText');
            text.dataset.tone = 'danger';
        }
        if (subtext) {
            subtext.textContent = error?.message || translate('tryAgainText');
            subtext.style.display = 'block';
        }
        if (button) {
            button.textContent = translate('goBackBtn');
            button.style.display = 'inline-block';
            button.onclick = onBack;
        }
    }

    function showForm() {
        stop();
        if (form) {
            form.style.display = 'block';
            void form.offsetWidth;
            form.classList.remove('hidden-view');
        }
        if (transition) {
            transition.style.display = 'none';
            transition.classList.add('hidden-view');
        }
        if (button) button.onclick = null;
    }

    function showRetry(message) {
        if (!loading || !text) return;
        text.textContent = message;
        text.dataset.tone = 'warn';
    }

    return { showLoading, showSuccess, showError, showForm, showRetry, stop };
}
