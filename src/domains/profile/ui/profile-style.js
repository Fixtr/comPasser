export const profileStyles = `
                :host {
                    display: block;
                    width: 100%;
                    min-height: 100vh;
                    background-color: oklch(98% 0.01 260);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                }

                .profile-wrapper {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    gap: 2rem;
                    padding: 3rem 1.5rem;
                }

                .sidebar {
                    width: 280px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .btn-back-home {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 1rem 1.5rem;
                    margin-bottom: 1rem;
                    border-radius: 12px;
                    background: white;
                    border: 1px solid oklch(90% 0.02 260);
                    color: var(--text-primary);
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }

                .btn-back-home:hover {
                    background: oklch(98% 0.01 260);
                    border-color: var(--accent-primary);
                    transform: translateX(-4px);
                }

                .nav-item {
                    /* button 으로 바꾸면서 브라우저 기본 스타일을 지운다 */
                    appearance: none; background: transparent; border: none; font: inherit; text-align: left; width: 100%;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1rem 1.5rem;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 500;
                    color: var(--text-secondary);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                }

                .nav-item:hover {
                    background-color: oklch(94% 0.02 260);
                    color: var(--text-primary);
                }

                .nav-item.active {
                    background-color: rgba(124, 58, 237, 0.1);
                    color: var(--accent-primary, #7c3aed);
                    font-weight: 700;
                }

                .nav-icon { font-size: 1.25rem; }

                .main-content {
                    flex-grow: 1;
                    max-width: 800px;
                }

                .header-banner {
                    text-align: center;
                    margin-bottom: 3rem;
                    animation: fadeInDown 0.6s ease-out;
                }

                .photo-hero {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    object-fit: cover;
                    margin-bottom: 1.5rem;
                    border: 4px solid white;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }

                .header-banner h1 {
                    font-size: 2rem;
                    font-weight: 800;
                    margin: 0;
                    letter-spacing: -0.02em;
                }

                .header-banner p {
                    color: var(--text-secondary);
                    margin-top: 0.5rem;
                    font-size: 1.1rem;
                }

                .content-section { display: none; }
                .content-section.active {
                    display: block;
                    animation: fadeInUp 0.4s ease-out;
                }

                .card {
                    background: white;
                    border: 1px solid oklch(90% 0.02 260);
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                }

                .card-header {
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid oklch(94% 0.02 260);
                }

                .card-header h2 { margin: 0; font-size: 1.3rem; font-weight: 700; }
                .card-header p { margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.95rem; }

                .list-item {
                    display: flex;
                    align-items: center;
                    padding: 1.5rem 2rem;
                    border-bottom: 1px solid oklch(96% 0.01 260);
                    transition: background 0.2s;
                }

                .list-item:last-child { border-bottom: none; }

                .list-label {
                    width: 30%;
                    font-weight: 600;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .list-value {
                    width: 70%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                }

                .photo-small { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
                .value-text { font-weight: 500; font-size: 1.05rem; }
                .not-set { color: var(--text-secondary); font-style: italic; font-size: 0.95rem; }

                /* Inline Form UI */
                .edit-mode-container {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    width: 100%;
                }

                .inline-input {
                    flex-grow: 1;
                    padding: 0.6rem 1rem;
                    border-radius: 8px;
                    border: 2px solid var(--accent-primary);
                    font-size: 1rem;
                    outline: none;
                    background: oklch(99% 0.01 260);
                }

                .edit-actions { display: flex; gap: 0.5rem; }

                .btn-save, .btn-cancel, .btn-edit-inline {
                    padding: 0.5rem 0.75rem;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .btn-save { background: var(--accent-primary); color: white; }
                .btn-cancel { background: oklch(94% 0.02 260); color: var(--text-secondary); }
                .btn-edit-inline {
                    background: transparent;
                    color: var(--accent-primary);
                    border: 1px solid var(--accent-primary);
                }
                .btn-edit-inline:hover { background: rgba(124, 58, 237, 0.05); }

                .value-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .verified-badge {
                    background: oklch(95% 0.1 150);
                    color: oklch(40% 0.15 150);
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 0.2rem 0.6rem;
                    border-radius: 20px;
                    border: 1px solid oklch(85% 0.1 150);
                }

                .certification-success {
                    flex-direction: column;
                    align-items: flex-start;
                    width: 100%;
                }

                .cert-msg {
                    font-size: 0.9rem;
                    color: var(--accent-primary);
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }

                /* My Trips */
                .itineraries-container { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; }
                .trip-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem;
                    background: oklch(98% 0.01 260);
                    border: 1px solid oklch(92% 0.02 260);
                    border-radius: 16px;
                    transition: all 0.2s;
                }
                .trip-card:hover { border-color: var(--accent-primary); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                .trip-title-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
                .trip-title { font-weight: 700; color: var(--accent-primary); }
                .trip-anchor-suffix { font-size: 0.85rem; color: var(--text-secondary); }
                .btn-rename { background: transparent; border: none; cursor: pointer; padding: 0.1rem 0.3rem; border-radius: 6px; font-size: 0.85rem; opacity: 0.55; transition: opacity 0.15s, background 0.15s; }
                .btn-rename:hover, .btn-rename:focus-visible { opacity: 1; background: rgba(124, 58, 237, 0.1); }
                .rename-input { flex: 1; min-width: 10rem; padding: 0.35rem 0.6rem; border: 1px solid var(--accent-primary); border-radius: 6px; font-family: inherit; font-size: 0.95rem; font-weight: 600; }
                .btn-rename-save { background: var(--accent-primary); color: white; border: none; padding: 0.35rem 0.8rem; border-radius: 6px; font-weight: 700; cursor: pointer; }
                .btn-rename-save:disabled { opacity: 0.6; cursor: default; }
                .btn-rename-cancel { background: transparent; color: var(--text-secondary); border: 1px solid #d1d5db; padding: 0.35rem 0.8rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
                .trip-date { font-size: 0.85rem; color: var(--text-secondary); }
                .trip-actions { display: flex; gap: 0.75rem; }

                .btn-view { background: var(--accent-primary); color: white; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 700; cursor: pointer; }
                .btn-delete-trip { background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; }

                /* Danger Zone */
                .danger-section { border-color: rgba(239, 68, 68, 0.2); }
                .danger-header { background-color: rgba(239, 68, 68, 0.02); }
                .danger-header h2 { color: #ef4444; }
                .btn-danger-trigger { background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; margin: 1.5rem 2rem; transition: transform 0.2s; }
                .btn-danger-trigger:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }

                /* Modal */
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); z-index: 2000; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
                .modal-overlay.show { opacity: 1; pointer-events: auto; }
                .modal-content { background: white; width: 90%; max-width: 480px; border-radius: 24px; padding: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.2); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; }
                .modal-overlay.show .modal-content { transform: scale(1); }
                .modal-close-x { position: absolute; top: 1.5rem; right: 1.5rem; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary); }
                .modal-content h3 { margin: 0 0 1rem 0; color: #ef4444; font-size: 1.5rem; font-weight: 800; }
                .modal-actions { display: flex; gap: 1rem; justify-content: flex-end; }
                .btn-modal-cancel { background: oklch(94% 0.02 260); border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; }
                .btn-modal-confirm { background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; }

                @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .loading-state, .empty-state, .error-state { padding: 3rem; text-align: center; color: var(--text-secondary); }

                @media (max-width: 768px) {
                    .profile-wrapper {
                        flex-direction: column;
                        padding: 1.5rem 1rem;
                        gap: 1.5rem;
                    }
                    .sidebar {
                        width: 100%;
                    }
                    .main-content {
                        max-width: 100%;
                    }
                    .list-item {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.5rem;
                        padding: 1rem 1.25rem;
                    }
                    .list-label {
                        width: 100%;
                    }
                    .list-value {
                        width: 100%;
                    }
                    .value-text, #user-email {
                        word-break: break-all;
                        overflow-wrap: break-word;
                    }
                    .edit-mode-container {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 0.75rem;
                    }
                    .edit-actions {
                        justify-content: flex-end;
                    }
                    .trip-card {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 1rem;
                    }
                    .trip-actions {
                        width: 100%;
                        justify-content: flex-end;
                    }
                    .btn-danger-trigger {
                        margin: 1.5rem;
                        width: calc(100% - 3rem);
                    }
                }
`;
