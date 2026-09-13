// Real form CSS; synthetic dropdowns isolate stacking from paid Google services.
async page => {
  const results = [];
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const dark of [false, true]) {
      const checks = await page.evaluate(async dark => {
        const { travelFormStyles } = await import('/src/domains/planner/ui/travel-form-style.js');
        document.body.classList.toggle('dark', dark);
        const closedRoots = window.__autocompleteLayerRoots ??= new WeakMap();
        // This variant exercises focus propagation through a CLOSED shadow root.
        if (!customElements.get('gmp-basic-place-autocomplete')) {
          customElements.define('gmp-basic-place-autocomplete', class extends HTMLElement {
            constructor() { super(); closedRoots.set(this, this.attachShadow({ mode: 'closed' })); }
          });
        }
        const outcomes = [];
        for (const tag of ['gmp-place-autocomplete', 'gmp-basic-place-autocomplete']) {
          const fixture = document.createElement('div');
          fixture.style.cssText = 'position:fixed;inset:0;z-index:9999;background:white;';
          const root = fixture.attachShadow({ mode: 'open' });
          root.innerHTML = `<style>${travelFormStyles}</style><div class="form-section">
            <div class="form-group"><label>출발</label><${tag}></${tag}></div>
            <div class="form-group"><label>도착</label><${tag}></${tag}></div>
            <button id="outside">다음</button></div>`;
          document.body.append(fixture);
          try {
            const [first, second] = root.querySelectorAll(tag);
            let picked = false;
            const interiors = [first, second].map(host => {
              const inner = host.shadowRoot || closedRoots.get(host);
              inner.innerHTML = `<style>
                input { box-sizing:border-box;width:100%;height:48px; }
                .suggestions { display:none;position:absolute;top:100%;left:0;right:0;height:180px;background:white;z-index:1000; }
                :host(:focus-within) .suggestions { display:block; }
                button { display:block;width:100%;height:100%; }
              </style><input aria-label="장소"><div class="suggestions"><button>서울역 검색 결과</button></div>`;
              inner.querySelector('button').addEventListener('click', () => { picked = true; });
              return inner;
            });
            interiors[0].querySelector('input').focus();
            const rect = second.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const hit = root.elementFromPoint(x, y);
            const above = hit === first;
            const focusedZ = Number(getComputedStyle(first).zIndex);
            const idleZ = Number(getComputedStyle(second).zIndex);
            interiors[0].querySelector('button').focus();
            const resultsKeepFocus = first.matches(':focus-within') && root.elementFromPoint(x, y) === first;
            if (above) interiors[0].elementFromPoint(x, y).click();
            interiors[1].querySelector('input').focus();
            const transferred = Number(getComputedStyle(second).zIndex) > Number(getComputedStyle(first).zIndex);
            root.querySelector('#outside').focus();
            const restored = getComputedStyle(first).zIndex === getComputedStyle(second).zIndex;
            outcomes.push({ tag, above, higher: focusedZ > idleZ, resultsKeepFocus, picked, transferred, restored });
          } finally { fixture.remove(); }
        }
        return outcomes;
      }, dark);
      for (const check of checks) {
        for (const key of ['above', 'higher', 'resultsKeepFocus', 'picked', 'transferred', 'restored']) {
          if (!check[key]) throw new Error(`${width}px dark=${dark} ${check.tag}: ${key} failed`);
        }
      }
      results.push(`PASS ${width}px ${dark ? 'dark' : 'light'}: dropdown hit testing, selection, focus transfer and reset`);
    }
  }
  return { results, errors: page.smokeErrors };
}
