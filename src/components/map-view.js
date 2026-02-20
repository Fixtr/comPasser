export default class MapView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 500px;
          background: linear-gradient(135deg, oklch(98% 0.01 260), oklch(95% 0.02 260));
          border-radius: var(--radius-lg);
          margin-top: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          border: 1px solid oklch(90% 0.02 260);
          position: relative;
          overflow: hidden;
        }
        
        .placeholder-text {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          z-index: 2;
        }

        .map-bg {
          position: absolute;
          inset: 0;
          opacity: 0.05;
          background-image: radial-gradient(var(--text-primary) 1px, transparent 1px);
          background-size: 20px 20px;
        }
        
        .route-path {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: none;
        }
        
        .route-path.active {
          display: block;
        }

        circle {
          animation: pulse 2s infinite;
          transform-origin: center;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
      <div class="map-bg"></div>
      <div class="placeholder-text" id="initial-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>Awaiting Route Data...</span>
      </div>
      
      <svg class="route-path" id="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M20,80 Q50,20 80,50" fill="none" stroke="var(--accent-primary)" stroke-width="0.5" stroke-dasharray="2,1" />
        <circle cx="20" cy="80" r="1.5" fill="var(--text-primary)" />
        <circle cx="50" cy="35" r="1" fill="var(--text-secondary)" />
        <circle cx="80" cy="50" r="2" fill="var(--accent-primary)" />
      </svg>
    `;
  }

  renderRoute(itineraryData) {
    const initialState = this.shadowRoot.getElementById('initial-state');
    const routeSvg = this.shadowRoot.getElementById('route-svg');

    initialState.style.display = 'none';
    routeSvg.classList.add('active');

    // In a real application, this would initialize the Google Maps Map
    // and use DirectionsService to paint the polyline based on itineraryData.events
  }
}

customElements.define('map-view', MapView);
