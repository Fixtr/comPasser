export default class TravelForm extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    render() {
        // Standard baseline features applied: :host, container queries, CSS variables
        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: var(--bg-secondary, #fff);
          padding: 2.5rem;
          border-radius: var(--radius-lg, 16px);
          box-shadow: var(--shadow-lg, 0 10px 15px rgba(0,0,0,0.1));
          container-type: inline-size;
        }

        h2 {
          font-size: 1.75rem;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-size: 1rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          color: var(--text-primary);
          font-size: 0.9rem;
        }

        input {
          width: 100%;
          padding: 0.8rem 1rem;
          border: 1px solid oklch(90% 0.02 260);
          border-radius: 8px;
          font-family: inherit;
          font-size: 1rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        input:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px oklch(65% 0.2 260 / 20%);
        }

        button {
          background: linear-gradient(135deg, var(--accent-primary), oklch(55% 0.3 280));
          color: white;
          border: none;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-weight: 700;
          border-radius: 12px;
          cursor: pointer;
          width: 100%;
          margin-top: 1rem;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-glow);
        }

        @container (min-width: 500px) {
          .row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
          }
        }
      </style>

      <form id="travel-form">
        <h2>Enter Your Anchor Event</h2>
        <p class="subtitle">Tell us what you MUST attend, and we'll build the trip around it.</p>
        
        <div class="form-group">
          <label for="event-name">Event Name (e.g., K-pop Concert, Exhibition)</label>
          <input type="text" id="event-name" required placeholder="G-Dragon Concert">
        </div>

        <div class="row">
          <div class="form-group">
            <label for="event-date">Event Date</label>
            <input type="date" id="event-date" required>
          </div>
          <div class="form-group">
            <label for="event-time">Event Time</label>
            <input type="time" id="event-time" required>
          </div>
        </div>

        <div class="form-group">
          <label for="event-location">Location (Area or Venue)</label>
          <input type="text" id="event-location" required placeholder="KSPO Dome">
        </div>

        <button type="submit">Generate AI Itinerary ✨</button>
      </form>
    `;
    }

    setupEventListeners() {
        const form = this.shadowRoot.getElementById('travel-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const eventData = {
                name: this.shadowRoot.getElementById('event-name').value,
                date: this.shadowRoot.getElementById('event-date').value,
                time: this.shadowRoot.getElementById('event-time').value,
                location: this.shadowRoot.getElementById('event-location').value,
            };

            console.log('Dispatching generation event:', eventData);

            // Dispatch custom event reaching up through the DOM
            this.dispatchEvent(new CustomEvent('generate-itinerary', {
                detail: eventData,
                bubbles: true,
                composed: true // Allows event to pass through shadow DOM boundary
            }));
        });
    }
}

customElements.define('travel-form', TravelForm);
