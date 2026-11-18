/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - Global AI Copilot & Unified Floating Controls Dock
   Enterprise SaaS interactive assistant & bottom-right theme/copilot dock
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // Inject Styles for the Copilot & Floating Controls Dock
    function injectCopilotStyles() {
        if (document.getElementById('bv-copilot-styles')) return;

        const style = document.createElement('style');
        style.id = 'bv-copilot-styles';
        style.textContent = `
            /* ═══ Docked Floating Action Bar (Bottom Right) ═══ */
            .bv-docked-floating-bar {
                position: fixed;
                bottom: 24px;
                right: 28px;
                z-index: 9990;
                display: flex;
                align-items: center;
                gap: 8px;
                background: #0f172a;
                padding: 6px 10px;
                border-radius: 40px;
                border: 1px solid #1e293b;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(12px);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }

            .bv-docked-floating-bar:hover {
                box-shadow: 0 16px 32px -4px rgba(2, 132, 199, 0.25), 0 8px 16px -6px rgba(0, 0, 0, 0.5);
                border-color: #334155;
            }

            .bv-dock-btn {
                background: transparent;
                border: none;
                color: #e2e8f0;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                padding: 8px 14px;
                border-radius: 30px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                position: relative;
                transition: all 0.2s ease;
            }

            .bv-dock-btn:hover {
                background: #1e293b;
                color: #ffffff;
            }

            .bv-copilot-trigger {
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
                color: #ffffff !important;
                padding: 8px 18px !important;
            }

            .bv-copilot-trigger:hover {
                background: linear-gradient(135deg, #0369a1 0%, #075985 100%) !important;
                transform: translateY(-1px);
            }

            .bv-dock-divider {
                width: 1px;
                height: 20px;
                background: #334155;
            }

            .bv-dock-pulse {
                position: absolute;
                top: 6px;
                right: 6px;
                width: 7px;
                height: 7px;
                background: #22c55e;
                border-radius: 50%;
                box-shadow: 0 0 0 2px #0f172a;
            }

            /* Hide any legacy single floating theme toggle to prevent duplication */
            #floating-theme-toggle, .floating-theme-toggle {
                display: none !important;
            }

            /* ═══ Copilot Drawer / Popup ═══ */
            .bv-copilot-drawer {
                position: fixed;
                bottom: 84px;
                right: 28px;
                width: 420px;
                max-width: calc(100vw - 40px);
                height: 600px;
                max-height: calc(100vh - 120px);
                background: #0d1322;
                border: 1px solid #1e293b;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                z-index: 9999;
                overflow: hidden;
                opacity: 0;
                transform: translateY(20px) scale(0.97);
                pointer-events: none;
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .bv-copilot-drawer.active {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            /* Drawer Header */
            .bv-copilot-header {
                padding: 16px 20px;
                background: #111827;
                border-bottom: 1px solid #1e293b;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .bv-copilot-title-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .bv-copilot-avatar {
                width: 34px;
                height: 34px;
                border-radius: 10px;
                background: linear-gradient(135deg, #0284c7 0%, #14b8a6 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }

            .bv-copilot-title {
                font-size: 14.5px;
                font-weight: 700;
                color: #f8fafc;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .bv-copilot-badge {
                font-size: 10.5px;
                font-weight: 600;
                padding: 2px 8px;
                background: rgba(34, 197, 94, 0.15);
                color: #4ade80;
                border-radius: 20px;
                border: 1px solid rgba(34, 197, 94, 0.3);
            }

            .bv-copilot-subtext {
                font-size: 11.5px;
                color: #94a3b8;
                margin: 2px 0 0 0;
                max-width: 220px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .bv-copilot-close-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 18px;
                cursor: pointer;
                padding: 6px;
                border-radius: 6px;
                transition: all 0.2s ease;
            }

            .bv-copilot-close-btn:hover {
                background: #1e293b;
                color: #f8fafc;
            }

            /* Conversation Body */
            .bv-copilot-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                background: #0b0f19;
            }

            .bv-copilot-msg {
                max-width: 88%;
                font-size: 13.5px;
                line-height: 1.55;
                border-radius: 12px;
                padding: 12px 16px;
                word-break: break-word;
            }

            .bv-msg-user {
                align-self: flex-end;
                background: #0284c7;
                color: #ffffff;
                border-bottom-right-radius: 3px;
            }

            .bv-msg-ai {
                align-self: flex-start;
                background: #111827;
                color: #e2e8f0;
                border: 1px solid #1e293b;
                border-bottom-left-radius: 3px;
            }

            .bv-msg-ai h3 {
                font-size: 14px;
                font-weight: 700;
                color: #38bdf8;
                margin: 0 0 8px 0;
            }

            .bv-msg-ai ul, .bv-msg-ai ol {
                margin: 8px 0;
                padding-left: 20px;
            }

            .bv-msg-ai li {
                margin-bottom: 4px;
            }

            .bv-msg-ai strong {
                color: #f8fafc;
            }

            /* Quick Prompt Chips */
            .bv-prompt-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 8px;
            }

            .bv-prompt-chip {
                background: #1e293b;
                color: #38bdf8;
                border: 1px solid #334155;
                font-size: 11.5px;
                font-weight: 500;
                padding: 5px 10px;
                border-radius: 14px;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .bv-prompt-chip:hover {
                background: #0284c7;
                color: #ffffff;
                border-color: #0284c7;
            }

            /* Typing Indicator */
            .bv-typing-indicator {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 6px 12px;
                background: #111827;
                border: 1px solid #1e293b;
                border-radius: 12px;
                align-self: flex-start;
            }

            .bv-typing-dot {
                width: 6px;
                height: 6px;
                background: #38bdf8;
                border-radius: 50%;
                animation: bvTyping 1.4s infinite ease-in-out both;
            }

            .bv-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .bv-typing-dot:nth-child(2) { animation-delay: -0.16s; }

            @keyframes bvTyping {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }

            /* Drawer Footer */
            .bv-copilot-footer {
                padding: 12px 16px;
                background: #111827;
                border-top: 1px solid #1e293b;
            }

            .bv-copilot-input-form {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .bv-copilot-input {
                flex: 1;
                background: #0b0f19;
                border: 1px solid #1f293d;
                color: #f8fafc;
                font-size: 13.5px;
                padding: 10px 14px;
                border-radius: 8px;
                outline: none;
                transition: border-color 0.2s ease;
            }

            .bv-copilot-input:focus {
                border-color: #0284c7;
            }

            .bv-copilot-send-btn {
                background: #0284c7;
                color: #ffffff;
                border: none;
                font-size: 15px;
                padding: 10px 16px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .bv-copilot-send-btn:hover {
                background: #0369a1;
            }

            @media (max-width: 640px) {
                .bv-docked-floating-bar {
                    bottom: 16px;
                    right: 16px;
                    padding: 4px 8px;
                }
                .bv-dock-label {
                    display: none;
                }
                .bv-copilot-drawer {
                    bottom: 70px;
                    right: 10px;
                    width: calc(100vw - 20px);
                    height: 520px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Render Dock HTML
    function createDockElements() {
        if (document.getElementById('bv-floating-dock')) return;

        const currentTheme = localStorage.getItem('theme') || 'dark';
        const isDark = currentTheme === 'dark';

        const dock = document.createElement('div');
        dock.className = 'bv-docked-floating-bar';
        dock.id = 'bv-floating-dock';
        dock.innerHTML = `
            <button class="bv-dock-btn bv-theme-toggle" id="bv-dock-theme-btn" title="${isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}" aria-label="Toggle Theme">
                <span class="bv-dock-icon">${isDark ? '☀️' : '🌙'}</span>
                <span class="bv-dock-label">${isDark ? 'Light' : 'Dark'}</span>
            </button>
            <div class="bv-dock-divider"></div>
            <button class="bv-dock-btn bv-copilot-trigger" id="bv-dock-copilot-btn" title="Ask BizVision AI Copilot" aria-label="Open AI Copilot">
                <span class="bv-dock-icon">🤖</span>
                <span class="bv-dock-label">AI Copilot</span>
                <span class="bv-dock-pulse"></span>
            </button>
        `;
        document.body.appendChild(dock);

        // Drawer
        const drawer = document.createElement('div');
        drawer.className = 'bv-copilot-drawer';
        drawer.id = 'bv-copilot-drawer';
        drawer.innerHTML = `
            <div class="bv-copilot-header">
                <div class="bv-copilot-title-group">
                    <div class="bv-copilot-avatar">✨</div>
                    <div>
                        <div class="bv-copilot-title">
                            BizVision Copilot
                            <span class="bv-copilot-badge">Online</span>
                        </div>
                        <div class="bv-copilot-subtext" id="bv-copilot-dataset-label">Active: Loading...</div>
                    </div>
                </div>
                <button class="bv-copilot-close-btn" id="bv-copilot-close-btn" title="Close Copilot">✕</button>
            </div>

            <div class="bv-copilot-body" id="bv-copilot-messages">
                <div class="bv-copilot-msg bv-msg-ai">
                    <h3>👋 Welcome to BizVision AI Copilot!</h3>
                    I'm your intelligent dataset assistant. Ask me questions about <strong>revenue drivers</strong>, <strong>growth projections</strong>, <strong>anomalies</strong>, or click any prompt below:
                    <div class="bv-prompt-chips">
                        <span class="bv-prompt-chip" data-query="What is the total revenue and profit?">💰 Revenue & Profit</span>
                        <span class="bv-prompt-chip" data-query="Which category generates the most sales?">📊 Top Category</span>
                        <span class="bv-prompt-chip" data-query="What is the forecasted 30-day trajectory?">🔮 30-Day Forecast</span>
                        <span class="bv-prompt-chip" data-query="Are there any outliers or missing values?">🛡️ Data Quality</span>
                        <span class="bv-prompt-chip" data-query="Give me 3 strategic growth recommendations">🎯 Strategic Advice</span>
                    </div>
                </div>
            </div>

            <div class="bv-copilot-footer">
                <form class="bv-copilot-input-form" id="bv-copilot-form">
                    <input type="text" class="bv-copilot-input" id="bv-copilot-input" placeholder="Ask anything about your data..." autocomplete="off">
                    <button type="submit" class="bv-copilot-send-btn" id="bv-copilot-send" title="Send message">➤</button>
                </form>
            </div>
        `;
        document.body.appendChild(drawer);

        // Bind events
        bindDockEvents();
    }

    function getActiveDatasetName() {
        const stored = sessionStorage.getItem('currentTableName');
        if (stored) return stored;

        const select = document.getElementById('dataset-select') ||
            document.getElementById('insight-dataset-select') ||
            document.getElementById('report-ds-select') ||
            document.getElementById('dataset-a-select');

        if (select && select.value) {
            return select.value;
        }
        return '';
    }

    function updateDatasetLabel() {
        const label = document.getElementById('bv-copilot-dataset-label');
        if (!label) return;
        const ds = getActiveDatasetName();
        if (ds) {
            label.textContent = `Dataset: ${ds}`;
            label.title = ds;
        } else {
            label.textContent = 'Dataset: None Selected';
        }
    }

    function formatMarkdownText(text) {
        if (!text) return '';
        let formatted = text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/`([^`]+)`/gim, '<code style="background:#1e293b; color:#38bdf8; padding:2px 6px; border-radius:4px; font-size:12px;">$1</code>')
            .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
        return formatted;
    }

    function appendUserMessage(text) {
        const container = document.getElementById('bv-copilot-messages');
        const msg = document.createElement('div');
        msg.className = 'bv-copilot-msg bv-msg-user';
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    function showTypingIndicator() {
        const container = document.getElementById('bv-copilot-messages');
        const indicator = document.createElement('div');
        indicator.className = 'bv-typing-indicator';
        indicator.id = 'bv-copilot-typing';
        indicator.innerHTML = `
            <span class="bv-typing-dot"></span>
            <span class="bv-typing-dot"></span>
            <span class="bv-typing-dot"></span>
        `;
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
    }

    function hideTypingIndicator() {
        const el = document.getElementById('bv-copilot-typing');
        if (el) el.remove();
    }

    function appendAIMessage(answer, followUps = []) {
        hideTypingIndicator();
        const container = document.getElementById('bv-copilot-messages');
        const msg = document.createElement('div');
        msg.className = 'bv-copilot-msg bv-msg-ai';
        msg.innerHTML = formatMarkdownText(answer);

        if (followUps && followUps.length > 0) {
            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'bv-prompt-chips';
            chipsDiv.style.marginTop = '12px';
            followUps.forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'bv-prompt-chip';
                chip.setAttribute('data-query', f);
                chip.textContent = f;
                chipsDiv.appendChild(chip);
            });
            msg.appendChild(chipsDiv);
        }

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    async function handleUserQuery(query) {
        if (!query || !query.trim()) return;
        const cleanQuery = query.trim();

        appendUserMessage(cleanQuery);
        showTypingIndicator();

        const dataset = getActiveDatasetName();
        if (!dataset) {
            setTimeout(() => {
                appendAIMessage(
                    "⚠️ **No active dataset detected.** Please select or upload a dataset first so I can analyze its metrics and performance.",
                    ["Take me to Upload Data"]
                );
            }, 500);
            return;
        }

        try {
            if (window.API && typeof window.API.sendChatMessage === 'function') {
                const res = await window.API.sendChatMessage(dataset, cleanQuery);
                appendAIMessage(res.answer, res.follow_ups);
            } else {
                // Direct fetch fallback
                const token = localStorage.getItem('session_token');
                const apiBase = (window.API_BASE_URL || ((window.location.protocol === 'file:' || (window.location.port && window.location.port !== '8000')) ? 'http://127.0.0.1:8000/api' : '/api'));
                const response = await fetch(`${apiBase}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? `Bearer ${token}` : ''
                    },
                    body: JSON.stringify({ dataset_id: dataset, query: cleanQuery })
                });

                if (!response.ok) {
                    throw new Error(`API error ${response.status}`);
                }
                const res = await response.json();
                appendAIMessage(res.answer, res.follow_ups);
            }
        } catch (err) {
            console.error('Copilot query error:', err);
            appendAIMessage(
                `### ⚠️ Analysis Note\n\nCould not query dataset **${dataset}**. Please check your network connectivity or ensure the backend server is running.`,
                ["What is the total revenue?", "Check dataset health"]
            );
        }
    }

    function bindDockEvents() {
        const themeBtn = document.getElementById('bv-dock-theme-btn');
        const copilotBtn = document.getElementById('bv-dock-copilot-btn');
        const drawer = document.getElementById('bv-copilot-drawer');
        const closeBtn = document.getElementById('bv-copilot-close-btn');
        const form = document.getElementById('bv-copilot-form');
        const input = document.getElementById('bv-copilot-input');
        const body = document.getElementById('bv-copilot-messages');

        // Theme Toggle Event
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                if (typeof window.toggleTheme === 'function') {
                    window.toggleTheme();
                } else {
                    const cur = localStorage.getItem('theme') || 'dark';
                    const next = cur === 'dark' ? 'light' : 'dark';
                    if (typeof window.setTheme === 'function') {
                        window.setTheme(next);
                    } else {
                        document.documentElement.setAttribute('data-theme', next);
                        localStorage.setItem('theme', next);
                    }
                }
                updateThemeButtonLabel();
            });
        }

        // Open/Close Copilot
        if (copilotBtn && drawer) {
            copilotBtn.addEventListener('click', () => {
                const isOpen = drawer.classList.contains('active');
                if (isOpen) {
                    drawer.classList.remove('active');
                } else {
                    updateDatasetLabel();
                    drawer.classList.add('active');
                    if (input) setTimeout(() => input.focus(), 150);
                }
            });
        }

        if (closeBtn && drawer) {
            closeBtn.addEventListener('click', () => {
                drawer.classList.remove('active');
            });
        }

        // Send Query Form
        if (form && input) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const q = input.value;
                input.value = '';
                handleUserQuery(q);
            });
        }

        // Click on Prompt Chips
        if (body) {
            body.addEventListener('click', (e) => {
                const chip = e.target.closest('.bv-prompt-chip');
                if (!chip) return;
                const q = chip.getAttribute('data-query');
                if (q === 'Take me to Upload Data') {
                    window.location.href = 'upload.html';
                    return;
                }
                if (q) handleUserQuery(q);
            });
        }

        // Listen for dataset changes across window
        window.addEventListener('datasetChanged', () => {
            updateDatasetLabel();
        });

        // Listen for themeChanged event
        window.addEventListener('themeChanged', (e) => {
            updateThemeButtonLabel(e.detail ? e.detail.theme : null);
        });
    }

    function updateThemeButtonLabel(themeOverride) {
        const themeBtn = document.getElementById('bv-dock-theme-btn');
        if (!themeBtn) return;
        const currentTheme = themeOverride || localStorage.getItem('theme') || 'dark';
        const isDark = currentTheme === 'dark';
        themeBtn.innerHTML = `
            <span class="bv-dock-icon">${isDark ? '☀️' : '🌙'}</span>
            <span class="bv-dock-label">${isDark ? 'Light' : 'Dark'}</span>
        `;
        themeBtn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }

    // Initialize once DOM is ready
    function init() {
        injectCopilotStyles();
        createDockElements();
        updateDatasetLabel();
        updateThemeButtonLabel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export helper
    window.BizVisionCopilot = {
        open: function () {
            const drawer = document.getElementById('bv-copilot-drawer');
            if (drawer) {
                updateDatasetLabel();
                drawer.classList.add('active');
            }
        },
        close: function () {
            const drawer = document.getElementById('bv-copilot-drawer');
            if (drawer) drawer.classList.remove('active');
        },
        ask: function (query) {
            this.open();
            handleUserQuery(query);
        }
    };
})();
